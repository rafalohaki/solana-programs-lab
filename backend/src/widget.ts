import { eq } from "drizzle-orm";
import { Hono } from "hono";
import nacl from "tweetnacl";
import { redis } from "bun";
import { getDb } from "./db/client.js";
import { widgetSites } from "./db/schema.js";

// ---------------------------------------------------------------------------
// Embeddable-widget backend: merchants bind (merchant, domain) → plan.
// The popup checkout (/pay) enforces the bind server-side via GET /check,
// so stealing the 2-line snippet onto a foreign domain ends in 403.
//
// Ownership check on write is two-layer (defense in depth):
//   1. merchant signature — ed25519 (tweetnacl) over the canonical
//      widget-bind message (widgetBindMessage below). The message carries
//      the NORMALIZED domain and a ms-epoch timestamp gated to a ±10 min
//      replay window; failures answer 401 with a generic message.
//   2. the plan account is read from RPC and its merchant field
//      (disc 8 + merchant 32 @ offset 8, see subscriptions/DESIGN.md §3)
//      must equal the merchant that signed.
// ---------------------------------------------------------------------------

export const widget = new Hono();

const DB_DOWN = "Database unavailable (DATABASE_URL not configured or unreachable).";
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** Generic auth failure — deliberately short and non-sensitive. */
const AUTH_FAILED = "Merchant signature verification failed.";
/**
 * Replay window for the bind message timestamp (±10 minutes).
 *
 * KNOWN DEBT (planned coordinated migration — do NOT patch unilaterally):
 * auth is window-only — there is no single-use nonce — so a captured
 * (signature, timestamp, fields) tuple can be replayed through the whole
 * window. The standard fix adds a nonce INSIDE the canonical widget-bind
 * message, consumed server-side (Redis SET nonce:<val> EX 600 NX) before
 * acceptance; that changes the canonical message grammar, so the signer
 * (frontend) and this verifier must ship together. The idempotent upsert
 * (merchant+domain → plan) limits the blast radius until then.
 */
const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;
/** Upstream (cluster RPC) budget for getAccountInfo — far below the server
 * idleTimeout, so a hung RPC answers the mapped 502 instead of stalling the
 * route until Bun resets the socket. */
const UPSTREAM_TIMEOUT_MS = 5_000;
/** Bound for the public, unsigned GET /sites list — the shared limiter skips
 * GETs, so this limit is the only per-request bound on the result set. */
const SITES_LIMIT = 100;
/** Short-TTL cache for the hot GET /check path (every /pay load and widget
 * boot) — keeps a checkout burst from scanning widget_sites per visitor. */
const CHECK_CACHE_TTL_SEC = 8;

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 encode (Bitcoin alphabet, standard bs58-compatible). */
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits: number[] = [0];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i] ?? 0;
    for (let j = 0; j < digits.length; j += 1) {
      carry += (digits[j] ?? 0) * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "1".repeat(zeros);
  // All-zero buffer: each zero byte is one leading "1", no value digits.
  if (zeros === bytes.length) return out;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out += B58_ALPHABET[digits[i] ?? 0] ?? "";
  }
  return out;
}

/** Base58 decode (Bitcoin alphabet) — inverse of base58Encode. Throws on any non-alphabet character. */
export function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [];
  let zeros = 0;
  while (zeros < input.length && input[zeros] === "1") zeros += 1;
  for (let i = zeros; i < input.length; i += 1) {
    const value = B58_ALPHABET.indexOf(input[i] ?? "");
    if (value < 0) throw new Error(`Invalid base58 character: ${input[i] ?? ""}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j += 1) {
      carry += (bytes[j] ?? 0) * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading "1"s are leading zero bytes; the rest accumulated little-endian.
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[zeros + i] = bytes[bytes.length - 1 - i] ?? 0;
  }
  return out;
}

function rpcUrl(): string {
  const raw = process.env.SOLANA_DEVNET_RPC ?? "";
  return raw === "" ? "https://api.devnet.solana.com" : raw;
}

// Best-effort cache helpers for the hot /check path — silent when Redis is not
// configured (local dev) and on any Redis error, degrading to a plain DB read.
async function cacheGetRaw(key: string): Promise<string | null> {
  if ((process.env.REDIS_URL ?? "") === "") return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function cacheSetRaw(key: string, value: string, ttlSec: number): Promise<void> {
  if ((process.env.REDIS_URL ?? "") === "") return;
  try {
    await redis.set(key, value, "EX", ttlSec);
  } catch {
    /* cache is best-effort — degrade to the uncached read */
  }
}

/** Lowercase, strip port + trailing dot. Empty string = invalid. */
export function normalizeHost(value: string): string {
  let host = value.trim().toLowerCase();
  if (host.startsWith("[") && host.includes("]")) host = host.slice(1, host.indexOf("]"));
  else if (host.includes(":") && /:[0-9]+$/.test(host)) host = host.slice(0, host.lastIndexOf(":"));
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

function isValidDomain(domain: string): boolean {
  return (
    domain.length > 0 &&
    domain.length <= 253 &&
    DOMAIN_RE.test(domain) &&
    !domain.includes("..") &&
    (domain.includes(".") || domain === "localhost")
  );
}

/** Exact or subdomain match: shop.example.com is allowed for example.com. */
export function hostAllowed(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (h === "" || d === "") return false;
  return h === d || h.endsWith(`.${d}`);
}

interface PlanOwner {
  ok: true;
  merchant: string;
}

interface PlanError {
  ok: false;
  status: number;
  error: string;
}

/** Read the plan account from RPC and decode its merchant (bytes 8..40). */
async function readPlanMerchant(plan: string): Promise<PlanOwner | PlanError> {
  let res: Response;
  try {
    res = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [plan, { encoding: "base64" }],
      }),
      // Cap the upstream wait well under the server idleTimeout: a hung RPC
      // must map to a 502, not stall the route into a connection reset.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    // Full error stays server-side; the client gets the fixed message.
    console.error("[widget] RPC fetch failed for plan", plan, e);
    return { ok: false, status: 502, error: "RPC unreachable." };
  }
  if (!res.ok) return { ok: false, status: 502, error: `RPC answered HTTP ${res.status}.` };
  let json: { result?: { value?: { data?: [string, string] } | null } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, status: 502, error: "RPC answered with invalid JSON." };
  }
  const value = json.result?.value ?? null;
  if (value === null) return { ok: false, status: 404, error: "Plan account not found on-chain." };
  const raw = value.data?.[0] ?? "";
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(raw, "base64"));
  } catch {
    return { ok: false, status: 502, error: "RPC returned undecodable account data." };
  }
  if (bytes.length < 40) {
    return { ok: false, status: 500, error: "Plan account layout too short (expected disc 8 + merchant 32)." };
  }
  return { ok: true, merchant: base58Encode(bytes.subarray(8, 40)) };
}

/**
 * Canonical widget-bind message. The merchant must sign EXACTLY this string
 * (UTF-8 bytes) — the domain slot carries the value AFTER normalizeHost, so
 * the client has to normalize the host the same way before signing. Exported
 * for tests; the exact layout is documented in backend/README.md.
 */
export function widgetBindMessage(merchant: string, domain: string, plan: string, timestamp: number): string {
  return `onchainsub widget-bind\nmerchant:${merchant}\ndomain:${domain}\nplan:${plan}\nts:${timestamp}`;
}

/**
 * Verify an ed25519 detached signature (base58) made by the merchant keypair
 * over `message`. Returns false on any decode/format problem — the caller
 * answers 401 with the same generic message either way.
 */
function verifyWidgetBindSignature(message: string, merchant: string, signatureB58: string): boolean {
  let pubkey: Uint8Array;
  let signature: Uint8Array;
  try {
    pubkey = base58Decode(merchant);
    signature = base58Decode(signatureB58);
  } catch {
    return false;
  }
  if (pubkey.length !== 32 || signature.length !== 64) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), signature, pubkey);
}

widget.post("/sites", async (c) => {
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  let body: { merchant?: unknown; domain?: unknown; plan?: unknown; signature?: unknown; timestamp?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Body must be JSON." }, 400);
  }
  const merchant = typeof body.merchant === "string" ? body.merchant.trim() : "";
  const domain = normalizeHost(typeof body.domain === "string" ? body.domain : "");
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!BASE58_RE.test(merchant)) return c.json({ error: "Body field merchant must be a base58 address." }, 400);
  if (!isValidDomain(domain)) {
    return c.json({ error: "Body field domain must be a bare hostname (e.g. shop.example.com)." }, 400);
  }
  if (!BASE58_RE.test(plan)) return c.json({ error: "Body field plan must be a base58 address." }, 400);

  // Layer 1 — merchant signature over the canonical widget-bind message.
  // The message carries the NORMALIZED domain, so the signed string is the
  // exact one stored server-side (see widgetBindMessage + README).
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const timestamp = typeof body.timestamp === "number" ? body.timestamp : Number.NaN;
  if (signature === "") return c.json({ error: "Body field signature is required (base58 ed25519)." }, 400);
  // 88 base58 chars encode 64 bytes — anything longer cannot be a real ed25519
  // signature and would hit the O(n²) decoder. Cap BEFORE decoding (400, same
  // shape as the other malformed-field rejections).
  if (signature.length > 100) return c.json({ error: "Body field signature is too long (base58 ed25519)." }, 400);
  if (!Number.isInteger(timestamp)) {
    return c.json({ error: "Body field timestamp is required (ms epoch, integer)." }, 400);
  }
  if (Math.abs(Date.now() - timestamp) > SIGNATURE_WINDOW_MS) return c.json({ error: AUTH_FAILED }, 401);
  const message = widgetBindMessage(merchant, domain, plan, timestamp);
  if (!verifyWidgetBindSignature(message, merchant, signature)) return c.json({ error: AUTH_FAILED }, 401);

  // KNOWN LIMITATION (honor-based binding, documented by design): this endpoint
  // proves ownership of the PLAN (signature + on-chain plan.merchant), NOT of
  // the DOMAIN — a merchant may bind a hostname it does not control, and /check
  // then answers allowed:true for (their plan, a foreign domain). What this
  // protects: the snippet — a foreign site cannot charge through someone
  // else's plan, and every popup renders amount + merchant FROM THE CHAIN, so
  // funds cannot be redirected by a hijacked bind; it can only mislabel the
  // storefront. Real domain-control proof (DNS TXT or a /.well-known challenge
  // derived from the signed message) is a future feature with its own design,
  // not a local patch here.
  // Layer 2 (defense in depth) — the plan must still exist on-chain and be
  // owned by the very merchant that signed above.
  const owner = await readPlanMerchant(plan);
  if (!owner.ok) return c.json({ error: owner.error }, owner.status as 404 | 500 | 502);
  if (owner.merchant !== merchant) {
    return c.json({ error: "Plan is owned by a different merchant (plan.merchant mismatch)." }, 403);
  }

  try {
    await db
      .insert(widgetSites)
      .values({ merchant, domain, plan })
      .onConflictDoUpdate({
        target: [widgetSites.merchant, widgetSites.domain],
        set: { plan },
      });
  } catch (e) {
    // Full driver error stays in the server log; the client gets a fixed 500.
    console.error("[widget] failed to store widget site", merchant, domain, e);
    return c.json({ error: "Failed to store widget site." }, 500);
  }
  return c.json({ ok: true, merchant, domain, plan }, 201);
});

widget.get("/sites", async (c) => {
  const merchant = (c.req.query("merchant") ?? "").trim();
  if (!BASE58_RE.test(merchant)) return c.json({ error: "Query param merchant must be a base58 address." }, 400);
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  let rows;
  try {
    // Public, unsigned endpoint (the shared limiter skips GETs) — the limit is
    // the only per-request bound on the result set; 100 bindings per merchant
    // is far beyond real usage.
    rows = await db.select().from(widgetSites).where(eq(widgetSites.merchant, merchant)).limit(SITES_LIMIT);
  } catch (e) {
    console.error("[widget] /sites query failed for", merchant, e);
    return c.json({ error: "Database query failed." }, 500);
  }
  return c.json({
    merchant,
    sites: rows.map((row) => ({
      domain: row.domain,
      plan: row.plan,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  });
});

widget.get("/check", async (c) => {
  const plan = (c.req.query("plan") ?? "").trim();
  const host = c.req.query("host") ?? "";
  if (!BASE58_RE.test(plan)) return c.json({ error: "Query param plan must be a base58 address." }, 400);
  if (host.trim() === "") return c.json({ error: "Query param host is required." }, 400);
  const normalizedHost = normalizeHost(host);
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);

  // Hot path (every /pay load + widget boot): short-TTL Redis cache keyed by
  // (plan, normalized host) so a checkout burst shares one DB answer instead
  // of scanning widget_sites per visitor. Best-effort like every cache here.
  const cacheKey = `check:${plan}:${normalizedHost}`;
  const cached = await cacheGetRaw(cacheKey);
  if (cached !== null) return new Response(cached, { status: 200, headers: { "content-type": "application/json" } });

  let rows;
  try {
    rows = await db.select().from(widgetSites).where(eq(widgetSites.plan, plan));
  } catch (e) {
    console.error("[widget] /check query failed for", plan, e);
    return c.json({ error: "Database query failed." }, 500);
  }
  // Fail closed: an unregistered plan is never payable through the widget.
  const matched = rows.find((row) => hostAllowed(host, row.domain));
  const payload =
    matched === undefined
      ? { allowed: false, plan, host: normalizedHost }
      : {
          allowed: true,
          plan,
          host: normalizedHost,
          // ADDITIVE field: the REGISTERED domain straight from the DB
          // (normalized at bind time). Lets the frontend render the registered
          // domain and postMessage to its exact origin instead of trusting the
          // URL `host` param, which the requester controls.
          domain: matched.domain,
        };
  await cacheSetRaw(cacheKey, JSON.stringify(payload), CHECK_CACHE_TTL_SEC);
  return c.json(payload);
});
