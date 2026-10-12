import { createHash } from "node:crypto";
import { Hono } from "hono";
import { redis } from "bun";

// ---------------------------------------------------------------------------
// JSON-RPC proxy to the cluster RPC (testnet/devnet by CLUSTER env).
//
// Every visitor's browser used to hit the public RPC directly and eat 429s.
// Now the browser talks to OUR origin (`/api/rpc`, same domain, like /api and
// /media) and this module fans out to the upstream RPC once:
//   - read methods are cached in Redis for a few seconds (dedupe across
//     concurrent visitors), so the public RPC sees one IP with low QPS;
//   - a per-IP windowed limit (higher than mutations — the web3 client polls)
//     keeps abuse in check;
//   - method allowlist: reads + the tx submission the Actions flow needs.
// ---------------------------------------------------------------------------

const RATE_LIMIT_RPC_PER_MINUTE = 240;
/** sendTransaction is the only write on the allowlist — a much tighter budget
 * so one caller cannot spend the shared read budget (checkout depends on it)
 * on tx spam or expensive getProgramAccounts calls. */
const RATE_LIMIT_SEND_TX_PER_MINUTE = 10;
/** Serialized params cap: oversized/degenerate params are rejected with 400
 * BEFORE the cache-key hash and any upstream fan-out (CPU-burn guard). */
const MAX_PARAMS_JSON_CHARS = 8 * 1024;
/** Per-attempt upstream budget: primary + failover stay ≤16 s total, and every
 * timeout here must sit under the server idleTimeout so clients see the mapped
 * 502 instead of a connection reset (raising idleTimeout in index.ts is
 * coordinated in its own change). */
const UPSTREAM_TIMEOUT_MS = 8_000;
const BUCKET = "media"; // unused here; keeps tree-shaken parity with media.ts

/** Methods this app actually uses, reads first. */
const ALLOWED_METHODS = new Set([
  "getProgramAccounts",
  "getAccountInfo",
  "getMultipleAccounts",
  "getEpochInfo",
  "getSlot",
  "getVersion",
  "getHealth",
  "getSignatureStatuses",
  // Receipt verification fallback: statuses prune fast on devnet, a confirmed
  // tx stays fetchable via getTransaction (read-only, heavily cached below).
  "getTransaction",
  // Wallet header chip: native SOL balance (read-only, cached below). Was
  // missing, so the chip silently got 403 and never rendered a segment.
  "getBalance",
  "minimumBalanceForRentExemption",
  "getLatestBlockhash",
  "getFeeForMessage",
  "sendTransaction",
]);

/** Short-TTL cache for idempotent reads (seconds). tx-building stays fresh. */
const CACHE_TTL: Record<string, number> = {
  getProgramAccounts: 15,
  getAccountInfo: 8,
  getMultipleAccounts: 8,
  getEpochInfo: 10,
  getSlot: 2,
  minimumBalanceForRentExemption: 60,
  // Confirmed transactions are immutable — cache hard.
  getTransaction: 3600,
  // Wallet balance: per-block data, 15 s is plenty (client caches 30 s).
  getBalance: 15,
};
/**
 * Pure failover candidate list for a cluster — preferred upstream first,
 * canonical PUBLIC endpoint last. The public entry is canonical ON PURPOSE:
 * the configured env may itself point at the rejected provider (Helius), which
 * would fail over to 403 again. Takes every input explicitly (no env reads, no
 * I/O) so bun:test can cover all branches; upstreamCandidates() is the env
 * adapter. Preserved semantics of the previous upstreamRpcUrl(): Helius wins
 * for devnet/mainnet when a key is set, an explicit testnet URL wins on
 * testnet, otherwise SOLANA_DEVNET_RPC (or the public devnet endpoint).
 */
export function rpcCandidates(
  cluster: string,
  heliusKey: string,
  testnetUrl: string,
  devnetUrl: string,
): [preferred: string, fallback: string] {
  let preferred = devnetUrl === "" ? "https://api.devnet.solana.com" : devnetUrl;
  // Helius preferred when a key is set (free plan: devnet + mainnet only —
  // testnet keeps the public RPC fallback).
  if (heliusKey !== "") {
    if (cluster === "devnet") preferred = `https://devnet.helius-rpc.com/?api-key=${heliusKey}`;
    if (cluster === "mainnet-beta" || cluster === "mainnet") {
      preferred = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
    }
  }
  if (cluster === "testnet" && testnetUrl !== "") preferred = testnetUrl;
  const fallback = cluster === "testnet" ? "https://api.testnet.solana.com" : "https://api.devnet.solana.com";
  return [preferred, fallback];
}

/** Env adapter for rpcCandidates. */
function upstreamCandidates(): [preferred: string, fallback: string] {
  return rpcCandidates(
    process.env.CLUSTER ?? "devnet",
    process.env.HELIUS_API_KEY ?? "",
    process.env.SOLANA_TESTNET_RPC ?? "",
    process.env.SOLANA_DEVNET_RPC ?? "",
  );
}

/**
 * Pure failover policy: should this preferred-upstream outcome trigger the
 * canonical public fallback? `null` means the call itself failed (network
 * error, timeout, abort); 401/403 are credential rejections; 429/5xx mean the
 * upstream is unusable for this call — in all those cases the app must not
 * hard-break on one bad upstream. Plain other 4xx (bad request etc.) are the
 * caller's mistake and are returned as-is. Exported for bun:test.
 */
export function shouldFailover(response: { ok: boolean; status: number } | null): boolean {
  if (response === null) return true;
  if (response.ok) return false;
  return response.status === 401 || response.status === 403 || response.status === 429 || response.status >= 500;
}

/** Cache reads are best-effort — Redis errors degrade to a cache miss. */
async function readCache(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export const rpcApp = new Hono();

rpcApp.post("/", async (c) => {
  let body: { method?: unknown; params?: unknown; jsonrpc?: unknown; id?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Body must be JSON-RPC." }, 400);
  }
  const method = typeof body.method === "string" ? body.method : "";
  if (!ALLOWED_METHODS.has(method)) {
    return c.json({ error: `RPC method not allowed: ${method || "(none)"}` }, 403);
  }

  // Sanity gate BEFORE hashing/caching/fan-out: degenerate params must cost a
  // 400, not a sha256 over megabytes plus an upstream call from the budget.
  const paramsJson = JSON.stringify(body.params ?? []);
  if (paramsJson.length > MAX_PARAMS_JSON_CHARS) {
    return c.json({ error: "RPC params too large." }, 400);
  }

  // Per-IP windowed limit with per-method budgets: writes (sendTransaction)
  // cannot exhaust the shared read budget the checkout flow depends on.
  try {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const windowBucket = Math.floor(Date.now() / 60_000);
    const isWrite = method === "sendTransaction";
    const budget = isWrite ? RATE_LIMIT_SEND_TX_PER_MINUTE : RATE_LIMIT_RPC_PER_MINUTE;
    const rlKey = `rlrpc:${isWrite ? "tx" : "rd"}:${ip}:${windowBucket}`;
    const hits = await redis.incr(rlKey);
    if (hits === 1) await redis.expire(rlKey, 120);
    if (hits > budget) return c.json({ error: "Too many requests — slow down." }, 429);
  } catch {
    /* best effort */
  }

  // Short-TTL cache for idempotent reads: concurrent visitors share one
  // upstream answer instead of hammering the public RPC. The key omits the
  // JSON-RPC id on purpose (visitors must share entries) — the id is rewritten
  // to the requester's on every hit below, so strict id-matching clients see
  // their own id and not the first caller's.
  const ttl = CACHE_TTL[method] ?? 0;
  const cacheKey = `rpc:${method}:${createHash("sha256").update(paramsJson).digest("hex")}`;
  if (ttl > 0) {
    const cached = await readCache(cacheKey);
    if (cached !== null) {
      try {
        const parsed = JSON.parse(cached) as { id?: unknown };
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsed.id = body.id ?? 1;
          return new Response(JSON.stringify(parsed), { status: 200, headers: { "content-type": "application/json" } });
        }
      } catch {
        /* corrupted entry — fall through to a fresh upstream call */
      }
      return new Response(cached, { status: 200, headers: { "content-type": "application/json" } });
    }
  }

  async function callUpstream(baseUrl: string): Promise<Response> {
    return fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: body.id ?? 1, method, params: body.params ?? [] }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  }

  // Preferred upstream first, canonical public RPC as the fallback: failover
  // triggers on credential rejections AND network errors/429/5xx (see
  // shouldFailover), so one bad upstream never hard-breaks the app.
  const [preferredUrl, fallbackUrl] = upstreamCandidates();
  let upstream: Response | null = null;
  for (const [label, baseUrl] of [
    ["preferred", preferredUrl],
    ["public", fallbackUrl],
  ] as const) {
    let response: Response | null = null;
    try {
      response = await callUpstream(baseUrl);
    } catch (e) {
      // Full error in the server log only — never interpolated into the reply.
      console.error(`[rpc] ${method}: ${label} upstream call failed`, e);
    }
    if (!shouldFailover(response)) {
      upstream = response;
      break;
    }
    if (response !== null) {
      console.warn(`[rpc] ${method}: ${label} upstream answered ${response.status} — trying the public fallback`);
      upstream = response; // remember it in case there is no next candidate
    }
  }
  if (upstream === null) {
    // Every attempt failed at the network level — answer the generic message;
    // details (hostnames, keys in URLs) stay in the server logs above.
    return c.json({ error: "RPC upstream unreachable." }, 502);
  }
  const text = await upstream.text();
  if (upstream.ok && ttl > 0) {
    try {
      await redis.set(cacheKey, text, "EX", ttl);
    } catch {
      /* best effort */
    }
  }
  return new Response(text, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" } });
});
