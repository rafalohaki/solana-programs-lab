import {
  handleBatchGet,
  handleBatchPost,
  handleCancelGet,
  handleCancelPost,
  handleChargeGet,
  handleChargePost,
  handleInvoiceGet,
  handleInvoicePost,
  handlePlanGet,
  handlePlanPost,
  handleReportGet,
  handleSubscribeGet,
  handleSubscribePost,
  optionsResponse,
} from "@subscriptions/actions";
import { redis } from "bun";
import { and, asc, count, eq, gt, sum } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import nacl from "tweetnacl";
import { checkDb, getDb } from "./db/client.js";
import { invoiceCharges, invoiceMetadata, type InvoiceMetadata } from "./db/schema.js";
import { isEmail, mailStatus, sendChargeReceipt, sendMail, testTokenRequired } from "./mail.js";
import { decodeBatchBody } from "./schema.js";
import { rpcApp } from "./rpc.js";
import { mediaApp } from "./media.js";
import { paymentsApp } from "./payments.js";
import { plansMetaApp } from "./plans-meta.js";
import { activityApp } from "./activity.js";
import { base58Decode, widget } from "./widget.js";

export const app = new Hono();

// JSON envelope for unhandled errors — Hono's default answers text/plain
// ("Internal Server Error"), which breaks the API contract and leaks nothing
// but helps no one. HTTPException pass-through mirrors the default handler;
// mounted sub-apps (widget/media/rpc) inherit this handler.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  const ref = randomUUID();
  console.error(`[api] unhandled error (ref ${ref})`, err);
  return c.json({ error: "Internal Server Error", ref }, 500);
});

// Baseline hardening for every response. nosniff is the one that matters for
// a JSON API; the cross-origin isolation headers (COOP/COEP/CORP) are
// document-level policies owned by the Astro frontend and are deliberately
// left off so an origin HTML change never fights the API layer.
app.use(
  "*",
  secureHeaders({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);

// Bodies on the JSON API are tiny (a few KB); 256 KiB is generous headroom,
// so oversized payloads are rejected before c.req.json() buffers+parses them.
// The 11 MiB Bun socket cap (index.ts) stays as the outer bound;
// /api/media/upload enforces its own 10 MiB cap in media.ts and is excluded.
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/media/")) return next();
  return bodyLimit({
    maxSize: 256 * 1024,
    onError: (bc) => bc.json({ error: "Request body too large." }, 413),
  })(c, next);
});

const DB_DOWN = "Database unavailable (DATABASE_URL not configured or unreachable).";
const METADATA_TTL_SEC = 30;
/** Mutations per IP per minute (writes are expensive, budget is tight). */
const RATE_LIMIT_PER_MINUTE = 60;
/** Hot public GETs (invoice/stats polling) get a looser bucket. */
const RATE_LIMIT_GET_PER_MINUTE = 240;

interface BunServerLike {
  requestIP?: (request: Request) => { address: string } | null;
}

/** Loopback / RFC1918 / link-local / IPv6 ULA — i.e. traffic arriving from
 *  our own reverse proxy, Cloudflare tunnel or local dev, where forwarding
 *  headers were authored by infrastructure we control. */
function isTrustedSocketIp(raw: string): boolean {
  const ip = raw.toLowerCase().startsWith("::ffff:") ? raw.slice(7) : raw;
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const octets = ip.split(".");
  if (octets.length !== 4) return false;
  const a = Number.parseInt(octets[0] ?? "", 10);
  const b = Number.parseInt(octets[1] ?? "", 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Rate-limit bucket key. The kernel socket IP is the only identity a client
 * cannot forge. Forwarding headers are honored ONLY on trusted (private)
 * sockets — behind the tunnel/proxy they are set by our own infrastructure:
 * cf-connecting-ip (edge-written) first, then the proxy-authored
 * x-forwarded-for (the Astro proxy strips client XFF and SETS a single
 * truthful value). On a public socket everything client-supplied is ignored
 * and the socket IP wins — XFF[0] rotation is dead as an evasion path.
 */
function clientBucketIp(c: Context): string {
  const bunServer = (c.env as { bunServer?: BunServerLike } | undefined)?.bunServer;
  const socketIp = bunServer?.requestIP?.(c.req.raw)?.address ?? null;
  if (socketIp === null) return "local"; // app.request() tests / non-Bun runtime
  if (isTrustedSocketIp(socketIp)) {
    const cf = c.req.header("cf-connecting-ip")?.trim();
    if (cf !== undefined && cf !== "") return cf;
    const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff !== undefined && xff !== "") return xff;
  }
  return socketIp;
}

// In-process fallback counters used ONLY while Redis is unreachable, so an
// outage degrades to per-process limiting instead of failing open. Bounded:
// when oversized, the oldest window entry is evicted.
const localHits = new Map<string, number>();

/** Fixed 1-minute window (INCR + 120s TTL). Returns the verdict plus a
 *  Retry-After hint (real key TTL when Redis answered, estimate otherwise). */
async function rateLimit(
  prefix: string,
  ip: string,
  limitPerMinute: number,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const windowBucket = Math.floor(Date.now() / 60_000);
  const key = `${prefix}:${ip}:${windowBucket}`;
  let hits: number;
  try {
    hits = await redis.incr(key);
    if (hits === 1) {
      // EXPIRE NX: never overwrite a live TTL, so a crash between INCR and
      // EXPIRE cannot leak a permanent key (which would 429 that IP forever).
      await redis.send("EXPIRE", [key, "120", "NX"]);
    }
  } catch (e) {
    console.error(`[ratelimit] redis unavailable, in-process fallback for ${key}:`, e);
    hits = (localHits.get(key) ?? 0) + 1;
    localHits.set(key, hits);
    if (localHits.size > 10_000) {
      const oldest = localHits.keys().next().value;
      if (oldest !== undefined) localHits.delete(oldest);
    }
  }
  if (hits > limitPerMinute) {
    let retryAfterSec = 60 - Math.floor((Date.now() % 60_000) / 1000);
    try {
      const ttl = await redis.ttl(key);
      if (ttl > 0) retryAfterSec = ttl;
    } catch {
      /* keep the window estimate */
    }
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  return { ok: true };
}

// Best-effort per-IP rate limit (Redis INCR, 1-minute window): mutations on
// /api/* (rpc.ts owns its own budget), plus a looser bucket for the hot
// public invoice/stats GETs whose queries must never run unbounded. Skips
// silently-not: Redis outages log and fall back to the in-process counter.
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "OPTIONS" || method === "HEAD") return next();
  if (c.req.path.startsWith("/api/rpc")) return next(); // rpc.ts owns its budget
  const isMutation = method !== "GET";
  const hotGet =
    !isMutation && (c.req.path.startsWith("/api/invoices/") || c.req.path.startsWith("/api/stats/"));
  if (!isMutation && !hotGet) return next(); // other GETs are served by their own modules
  const verdict = await rateLimit(
    isMutation ? "rl" : "rlget",
    clientBucketIp(c),
    isMutation ? RATE_LIMIT_PER_MINUTE : RATE_LIMIT_GET_PER_MINUTE,
  );
  if (!verdict.ok) {
    c.header("Retry-After", String(verdict.retryAfterSec));
    return c.json({ error: "Too many requests — slow down." }, 429);
  }
  await next();
});

// Protocol collection fee — mirrors FEE_BPS / FEE_DENOMINATOR in
// subscriptions/programs/subscriptions/src/fees.rs, which is the on-chain
// source of truth (40 bps = 0.4% of every charge). Keep in sync with fees.rs.
// Declared as bigint so fee derivation below stays integer-exact (no floats).
const FEE_BPS = 40n;
const FEE_DENOMINATOR = 10_000n;

async function batchPost(c: Context): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await c.req.raw.clone().json();
  } catch {
    return c.json({ error: "Invalid JSON body; expected { account, items: [...] }." }, 400);
  }
  const gate = decodeBatchBody(parsed);
  if (gate._tag !== "Success") {
    // The schema Issue is logged, not returned: the client keeps its stable
    // 400 message, while a too-strict schema change can never silently reject
    // valid production traffic without a trace.
    console.debug("[gate] batch body rejected:", gate.failure);
    return c.json(
      {
        error:
          "Invalid batch body; expected { account: string, items: [{ plan, subscription, invoice, subscriberAta, mint }] } with 1-8 items.",
      },
      400,
    );
  }
  // The actions handler re-parses the raw body (see src/schema.ts note) — the
  // decoded value here only proves the shape.
  return handleBatchPost(c.req.raw);
}

async function cacheGet(key: string): Promise<string | null> {
  if ((process.env.REDIS_URL ?? "") === "") return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: string, ttlSec: number = METADATA_TTL_SEC): Promise<void> {
  if ((process.env.REDIS_URL ?? "") === "") return;
  try {
    await redis.set(key, value, "EX", ttlSec);
  } catch {
    /* cache is best-effort — degrade to uncached */
  }
}

async function cacheDel(key: string): Promise<void> {
  if ((process.env.REDIS_URL ?? "") === "") return;
  try {
    await redis.del(key);
  } catch {
    /* ignore — stale cache entry expires on its own */
  }
}

async function checkRedis(): Promise<boolean> {
  if ((process.env.REDIS_URL ?? "") === "") return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Lamports / ids from JSON. Decimal strings are THE input format: JSON.parse
 * rounds values above 2^53 before this function ever sees them (and
 * Number.isInteger happily accepts the rounded result), so arbitrary-precision
 * numbers must arrive as strings. JS numbers are tolerated only within the
 * safe-integer range; negatives, fractions and garbage are rejected.
 */
function toBigint(value: unknown): bigint | null {
  if (typeof value === "bigint") return value < 0n ? null : value;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  return null;
}

/** Opaque 500 with a correlation ref: the full error (SQL/SMTP details) is
 *  logged server-side, the client gets no exception text. */
function internalError(c: Context, action: string, e: unknown): Response {
  const ref = randomUUID();
  console.error(`[api] ${action} failed (ref ${ref})`, e);
  return c.json({ error: "Internal error", ref }, 500);
}

/** Constant-time shared-secret comparison over fixed-length digests — a
 *  plain !== short-circuits on the first differing byte (timing side-channel). */
function tokenMatches(candidate: string, secret: string): boolean {
  if (candidate === "" || secret === "") return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

async function readJsonBody(c: Context): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  try {
    return { ok: true, body: (await c.req.json()) as Record<string, unknown> };
  } catch {
    return { ok: false, res: c.json({ error: "Invalid JSON body." }, 400) };
  }
}

// Public origin gets liveness only — the db/redis probe used to publish
// dependency status to anyone who could reach the API. The compose
// healthcheck (compose.yml) only needs a 2xx from here.
app.get("/health", (c) => c.json({ ok: true }));

// Detailed dependency probe, gated by the same shared secret as the mail test
// (unset MAIL_TEST_TOKEN keeps it permanently off).
app.get("/health/detail", async (c) => {
  if (!tokenMatches(c.req.header("x-mail-token") ?? "", process.env.MAIL_TEST_TOKEN ?? "")) {
    return c.json({ error: "Invalid or missing x-mail-token header." }, 401);
  }
  const [dbUp, redisUp] = await Promise.all([checkDb(), checkRedis()]);
  return c.json({ ok: true, db: dbUp ? "up" : "down", redis: redisUp ? "up" : "down" });
});

// Preflight (ACAO *) is an Actions-spec (Blinks) requirement on /api/actions/*
// only. Same-origin routes (/api/rpc, /api/widget, /api/invoices, /api/stats,
// /api/media) never needed cross-origin preflights — serving them wildcard
// was broader than the spec requires.
app.options("/api/actions/*", () => optionsResponse());

app.get("/api/actions/plan", (c) => handlePlanGet(c.req.raw));
app.post("/api/actions/plan", (c) => handlePlanPost(c.req.raw));
app.get("/api/actions/subscribe", (c) => handleSubscribeGet(c.req.raw));
app.post("/api/actions/subscribe", (c) => handleSubscribePost(c.req.raw));
app.get("/api/actions/cancel", (c) => handleCancelGet(c.req.raw));
app.post("/api/actions/cancel", (c) => handleCancelPost(c.req.raw));
app.get("/api/actions/charge", (c) => handleChargeGet(c.req.raw));
app.post("/api/actions/charge", (c) => handleChargePost(c.req.raw));
app.get("/api/actions/invoice", (c) => handleInvoiceGet(c.req.raw));
app.post("/api/actions/invoice", (c) => handleInvoicePost(c.req.raw));
app.get("/api/actions/batch", (c) => handleBatchGet(c.req.raw));
app.post("/api/actions/batch", (c) => batchPost(c));
app.get("/api/actions/report", (c) => handleReportGet(c.req.raw));

// --- Invoice write auth (receipt-bind) ---------------------------------------
//
// POST /api/invoices/metadata and POST /api/invoices/charges used to accept
// ANY anonymous body while feeding receipt delivery and public stats. Both
// writes now require the merchant's ed25519 signature over a canonical
// message (same grammar/window as widget-bind and media-put — those two
// contracts are untouched; this is a separate "receipt-bind" message):
//
//   onchainsub receipt-bind
//   merchant:<merchant>
//   invoice:<invoice>
//   ts:<ms epoch>
//
// and for charges the amount and tx signature are bound as well:
//
//   onchainsub receipt-bind
//   merchant:<merchant>
//   invoice:<invoice>
//   amount:<lamports>
//   sig:<tx signature>
//   ts:<ms epoch>
//
// Body-field split (charges only): `signature` carries the Solana transaction
// signature (verified on-chain via getSignatureStatuses, then stored); the
// merchant's ed25519 over the message above travels in `authSignature`.
// One field cannot serve both roles — a tx signature is not a signature over
// this message, so sharing the field made every charge unsatisfiable (401).

const RECEIPT_AUTH_FAILED = "Merchant signature verification failed.";
/** Replay window for the receipt-bind timestamp (±10 minutes), mirroring widget/media. */
const RECEIPT_WINDOW_MS = 10 * 60 * 1000;
const MERCHANT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** ed25519 signature decodes to 64 bytes → ~87-88 base58 chars (same shape as a tx signature). */
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;
/** Invoice strings are merchant-chosen labels (e.g. "INV-2026-0001"), NOT
 *  base58 — they must be printable and bounded, since they reach mail HTML
 *  and the canonical signed message (no control chars, no line breaks). */
const INVOICE_RE = /^[^\u0000-\u001f\u007f]{1,200}$/;
/** Receipt metadata JSONB size cap (TOAST / read-amplification guard). */
const MAX_METADATA_BYTES = 16 * 1024;

export function receiptBindMessage(merchant: string, invoice: string, timestamp: number): string {
  return `onchainsub receipt-bind\nmerchant:${merchant}\ninvoice:${invoice}\nts:${timestamp}`;
}

export function receiptChargeMessage(
  merchant: string,
  invoice: string,
  amount: bigint,
  txSignature: string,
  timestamp: number,
): string {
  return `onchainsub receipt-bind\nmerchant:${merchant}\ninvoice:${invoice}\namount:${amount}\nsig:${txSignature}\nts:${timestamp}`;
}

/** Verify a detached base58 ed25519 signature made by `merchant` (same decode
 *  discipline as widget.ts verifyWidgetBindSignature / media.ts authorize). */
function verifyReceiptSignature(message: string, merchant: string, signatureB58: string): boolean {
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

interface ReceiptAuthOk {
  ok: true;
  merchant: string;
  timestamp: number;
}
type ReceiptAuth = ReceiptAuthOk | { ok: false; res: Response };

/**
 * Shared ed25519 gate for the invoice write endpoints. Malformed fields
 * answer 400; a well-formed but invalid or stale signature answers 401 with
 * a generic, non-sensitive message (widget.ts convention).
 */
function requireReceiptAuth(
  c: Context,
  body: Record<string, unknown>,
  buildMessage: (merchant: string, timestamp: number) => string,
  sigField: "signature" | "authSignature" = "signature",
): ReceiptAuth {
  const merchant = typeof body.merchant === "string" ? body.merchant.trim() : "";
  if (!MERCHANT_RE.test(merchant)) {
    return { ok: false, res: c.json({ error: "Body field merchant must be a base58 address." }, 400) };
  }
  const rawSig = body[sigField];
  const signature = typeof rawSig === "string" ? rawSig.trim() : "";
  if (!SIG_RE.test(signature)) {
    return { ok: false, res: c.json({ error: `Body field ${sigField} must be base58 ed25519.` }, 400) };
  }
  const timestamp = typeof body.timestamp === "number" ? body.timestamp : Number.NaN;
  if (!Number.isInteger(timestamp)) {
    return { ok: false, res: c.json({ error: "Body field timestamp is required (ms epoch, integer)." }, 400) };
  }
  if (Math.abs(Date.now() - timestamp) > RECEIPT_WINDOW_MS) {
    return { ok: false, res: c.json({ error: RECEIPT_AUTH_FAILED }, 401) };
  }
  if (!verifyReceiptSignature(buildMessage(merchant, timestamp), merchant, signature)) {
    return { ok: false, res: c.json({ error: RECEIPT_AUTH_FAILED }, 401) };
  }
  return { ok: true, merchant, timestamp };
}

/** JSONB metadata gate: optional, must be an object, bounded in size. */
function validateMetadata(
  c: Context,
  value: unknown,
): { ok: true; metadata: InvoiceMetadata | null } | { ok: false; res: Response } {
  if (value === undefined || value === null) return { ok: true, metadata: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, res: c.json({ error: "Body field metadata must be a JSON object." }, 400) };
  }
  if (JSON.stringify(value).length > MAX_METADATA_BYTES) {
    return { ok: false, res: c.json({ error: `Body field metadata exceeds ${MAX_METADATA_BYTES} bytes.` }, 400) };
  }
  return { ok: true, metadata: value as InvoiceMetadata };
}

app.post("/api/invoices/metadata", async (c) => {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body;
  if (typeof body.invoice !== "string" || !INVOICE_RE.test(body.invoice)) {
    return c.json({ error: "Body field invoice must be a non-empty printable string (max 200 chars)." }, 400);
  }
  const invoice = body.invoice;
  const auth = requireReceiptAuth(c, body, (merchant, timestamp) => receiptBindMessage(merchant, invoice, timestamp));
  if (!auth.ok) return auth.res;
  const meta = validateMetadata(c, body.metadata);
  if (!meta.ok) return meta.res;
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  const invoiceId = body.invoiceId === undefined || body.invoiceId === null ? null : toBigint(body.invoiceId);
  if (invoiceId === null && body.invoiceId !== undefined && body.invoiceId !== null) {
    return c.json({ error: "Body field invoiceId must be a non-negative integer (decimal string preferred)." }, 400);
  }
  const row = {
    invoice,
    plan: typeof body.plan === "string" ? body.plan : null,
    subscription: typeof body.subscription === "string" ? body.subscription : null,
    merchant: auth.merchant, // the signing merchant is the stored merchant
    invoiceId,
    memoHash: typeof body.memoHash === "string" ? body.memoHash : null,
    metadata: meta.metadata,
  };
  try {
    await db.insert(invoiceMetadata).values(row).onConflictDoUpdate({
      target: invoiceMetadata.invoice,
      set: {
        plan: row.plan,
        subscription: row.subscription,
        merchant: row.merchant,
        invoiceId: row.invoiceId,
        memoHash: row.memoHash,
        metadata: row.metadata,
      },
    });
  } catch (e) {
    return internalError(c, "store invoice metadata", e);
  }
  await cacheDel(`invoice-metadata:${invoice}`);
  return c.json({ ok: true, invoice }, 201);
});

app.get("/api/invoices/metadata", async (c) => {
  const invoice = c.req.query("invoice") ?? "";
  if (invoice === "") return c.json({ error: "Query param invoice is required." }, 400);
  const key = `invoice-metadata:${invoice}`;
  const cached = await cacheGet(key);
  if (cached !== null) {
    try {
      return c.json(JSON.parse(cached) as unknown);
    } catch {
      // Corrupt/truncated cache entry must not 500 the endpoint until TTL:
      // drop it and fall through to the database path.
      await cacheDel(key);
    }
  }
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  let rows;
  try {
    rows = await db.select().from(invoiceMetadata).where(eq(invoiceMetadata.invoice, invoice)).limit(1);
  } catch (e) {
    return internalError(c, "load invoice metadata", e);
  }
  const found = rows[0];
  if (found === undefined) return c.json({ error: "Invoice metadata not found." }, 404);
  const payload = {
    invoice: found.invoice,
    plan: found.plan,
    subscription: found.subscription,
    merchant: found.merchant,
    invoiceId: found.invoiceId === null ? null : found.invoiceId.toString(),
    memoHash: found.memoHash,
    metadata: found.metadata,
    createdAt: found.createdAt?.toISOString() ?? null,
  };
  await cacheSet(key, JSON.stringify(payload));
  return c.json(payload);
});

/**
 * Confirm a charge's transaction signature on-chain via our own RPC proxy
 * (rpcApp: allowlist + failover). Fast path: getSignatureStatuses with
 * searchHistory. Fallback: getTransaction — devnet status caches prune
 * within minutes (and some upstreams reject the searchHistory shape), while
 * a confirmed tx stays fetchable; `meta.err === null` means it succeeded.
 * Fail-closed: an unverifiable signature never reaches the table that feeds
 * public stats.
 */
async function verifyChargeOnChain(
  txSignature: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 502; error: string }> {
  const callProxy = async (method: string, params: unknown[]): Promise<{ ok: boolean; json: unknown }> => {
    let res: Response;
    try {
      res = await rpcApp.request("/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch (e) {
      console.error("[api] charge verification rpc call failed:", e);
      return { ok: false, json: null };
    }
    if (!res.ok) {
      console.error(`[api] charge verification rpc answered HTTP ${res.status}.`);
      return { ok: false, json: null };
    }
    try {
      return { ok: true, json: (await res.json()) as unknown };
    } catch {
      return { ok: false, json: null };
    }
  };
  // Narrowed readers for untrusted RPC envelopes: `in` guards only, no
  // shape assertions. Absent/null slots mean "not found" (fail-closed).
  const readStatusErr = (json: unknown): { found: true; err: unknown } | { found: false } => {
    if (typeof json !== "object" || json === null || !("result" in json)) return { found: false };
    const result = json.result;
    if (typeof result !== "object" || result === null || !("value" in result)) return { found: false };
    const value = result.value;
    if (!Array.isArray(value) || value.length === 0) return { found: false };
    const first = value[0];
    if (typeof first !== "object" || first === null || !("err" in first)) return { found: false };
    return { found: true, err: first.err };
  };
  const readTxMetaErr = (json: unknown): { found: true; err: unknown } | { found: false } => {
    if (typeof json !== "object" || json === null || !("result" in json)) return { found: false };
    const result = json.result;
    if (typeof result !== "object" || result === null || !("meta" in result)) return { found: false };
    const meta = result.meta;
    if (typeof meta !== "object" || meta === null || !("err" in meta)) return { found: false };
    return { found: true, err: meta.err };
  };
  const statuses = await callProxy("getSignatureStatuses", [[txSignature], { searchHistory: true }]);
  if (!statuses.ok) return { ok: false, status: 502, error: "Charge could not be verified on-chain." };
  const status = readStatusErr(statuses.json);
  if (status.found) {
    if (status.err !== null && status.err !== undefined) {
      return { ok: false, status: 400, error: "Charge transaction failed on-chain." };
    }
    return { ok: true };
  }
  // Statuses pruned (or upstream rejected the shape) — confirm via the tx itself.
  const tx = await callProxy("getTransaction", [txSignature, { encoding: "json", maxSupportedTransactionVersion: 0 }]);
  if (!tx.ok) return { ok: false, status: 502, error: "Charge could not be verified on-chain." };
  const meta = readTxMetaErr(tx.json);
  if (!meta.found) {
    return { ok: false, status: 400, error: "Charge signature not found on-chain." };
  }
  if (meta.err !== null && meta.err !== undefined) {
    return { ok: false, status: 400, error: "Charge transaction failed on-chain." };
  }
  return { ok: true };
}

app.post("/api/invoices/charges", async (c) => {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed.res;
  const body = parsed.body;
  if (typeof body.invoice !== "string" || !INVOICE_RE.test(body.invoice)) {
    return c.json({ error: "Body field invoice must be a non-empty printable string (max 200 chars)." }, 400);
  }
  const invoice = body.invoice;
  if (typeof body.signature !== "string" || !SIG_RE.test(body.signature.trim())) {
    return c.json({ error: "Body field signature must be a base58 transaction signature." }, 400);
  }
  const txSignature = body.signature.trim();
  const amount = toBigint(body.amount);
  if (amount === null) {
    return c.json(
      { error: "Body field amount must be a non-negative integer — send it as a decimal string (no precision loss)." },
      400,
    );
  }
  const auth = requireReceiptAuth(
    c,
    body,
    (merchant, timestamp) => receiptChargeMessage(merchant, invoice, amount, txSignature, timestamp),
    "authSignature",
  );
  if (!auth.ok) return auth.res;
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  const chain = await verifyChargeOnChain(txSignature);
  if (!chain.ok) return c.json({ error: chain.error }, chain.status);
  let inserted;
  try {
    inserted = await db
      .insert(invoiceCharges)
      .values({ invoice, signature: txSignature, amount })
      .returning();
  } catch (e) {
    // SQLSTATE 23505 = unique_violation; the message-substring check stays as
    // a fallback for drivers that do not surface e.code.
    const code = (e as { code?: unknown }).code;
    const message = (e as Error).message ?? "";
    if (code === "23505" || (code === undefined && (message.includes("unique") || message.includes("duplicate")))) {
      if (code !== "23505") console.debug("[api] unique violation detected by message fallback:", message);
      return c.json({ error: "Charge signature already recorded." }, 409);
    }
    return internalError(c, "record charge", e);
  }
  const row = inserted[0];
  if (row === undefined || row.amount === null) {
    return internalError(c, "record charge (empty returning row)", new Error("INSERT returned no row"));
  }

  // Best-effort email receipt: if the invoice metadata carries a notifyEmail,
  // deliver asynchronously — never block or fail the charge response on mail.
  void deliverChargeReceipt(String(row.invoice), txSignature, row.amount.toString());

  return c.json(
    {
      id: row.id,
      invoice: row.invoice,
      signature: row.signature,
      amount: row.amount.toString(),
      createdAt: row.createdAt?.toISOString() ?? null,
    },
    201,
  );
});

/** Validated RECEIPT_DECIMALS: integer 0-9, otherwise the USDC-like default 6
 *  (an unvalidated env once produced "NaN USDC" receipts). */
function receiptDecimals(): number {
  const raw = process.env.RECEIPT_DECIMALS;
  if (raw === undefined || raw === "") return 6;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 9 ? parsed : 6;
}

/** Integer-exact bigint → UI amount ("15", "15.5", "15.50"): no float math on
 *  lamports — Number() loses precision above 2^53 (~9M USDC at 6 decimals). */
function formatUnits(amountRaw: string, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const amount = BigInt(amountRaw);
  const whole = amount / base;
  if (decimals === 0) return whole.toString();
  const frac = (amount % base).toString().padStart(decimals, "0");
  // Receipts show 2 fraction digits for the default 6-decimal mint (USDC-like).
  const shown = decimals === 6 ? frac.slice(0, 2) : frac;
  return `${whole}.${shown}`;
}

/** Look up metadata.notifyEmail and send the branded receipt; log-only on failure. */
async function deliverChargeReceipt(invoice: string, signature: string, amountRaw: string): Promise<void> {
  const db = getDb();
  if (db === null) return;
  try {
    const rows = await db
      .select({ metadata: invoiceMetadata.metadata, plan: invoiceMetadata.plan, merchant: invoiceMetadata.merchant })
      .from(invoiceMetadata)
      .where(eq(invoiceMetadata.invoice, invoice))
      .limit(1);
    const notifyEmail = rows[0]?.metadata?.notifyEmail;
    if (!isEmail(notifyEmail)) return;
    const amountUi = `${formatUnits(amountRaw, receiptDecimals())} USDC`;
    const planLine = rows[0]?.plan ?? "";
    const merchant = rows[0]?.merchant ?? "";
    const short = merchant.length > 12 ? `${merchant.slice(0, 6)}…${merchant.slice(-4)}` : merchant;
    const cluster = process.env.CLUSTER ?? "devnet";
    await sendChargeReceipt({
      to: notifyEmail,
      invoice,
      amountUi,
      planLine: `${planLine ? `${planLine} · ` : ""}merchant ${short}`,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`,
      cluster,
    });
  } catch (e) {
    console.error(`[mail] receipt flow for ${invoice} failed:`, e);
  }
}

app.get("/api/mail/status", (c) => {
  return c.json(mailStatus());
});

app.post("/api/mail/test", async (c) => {
  if (!testTokenRequired()) {
    return c.json({ error: "Mail test disabled: set MAIL_TEST_TOKEN to allow test sends." }, 503);
  }
  if (!tokenMatches(c.req.header("x-mail-token") ?? "", process.env.MAIL_TEST_TOKEN ?? "")) {
    return c.json({ error: "Invalid or missing x-mail-token header." }, 401);
  }
  let body: { to?: unknown };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return c.json({ error: "Body must be JSON." }, 400);
  }
  if (!isEmail(body.to)) return c.json({ error: "Body field to must be a valid email address." }, 400);
  const result = await sendMail({
    to: body.to,
    subject: "OnchainSUB — SMTP test",
    text: "SMTP works. This is a test message from the OnchainSUB backend.",
    html: '<p style="font-family:Inter,Arial,sans-serif;font-size:14px">SMTP works — <b style="color:#14f195">OnchainSUB</b> mail is live.</p>',
  });
  return c.json(result, result.sent ? 200 : 502);
});

/** Hard cap per charges list page (keyset pagination via ?after=<charge id>). */
const CHARGES_PAGE_LIMIT = 500;

app.get("/api/invoices/charges", async (c) => {
  const invoice = c.req.query("invoice") ?? "";
  const merchant = c.req.query("merchant") ?? "";
  if (invoice === "" && merchant === "") {
    return c.json({ error: "Query param invoice or merchant is required." }, 400);
  }
  // Keyset pagination: `after` = last seen charge id. Public unauthenticated
  // endpoint — list size must not grow with the table (memory + latency).
  const afterRaw = c.req.query("after") ?? "";
  let after: number | null = null;
  if (afterRaw !== "") {
    const parsed = Number(afterRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return c.json({ error: "Query param after must be a non-negative integer charge id." }, 400);
    }
    after = parsed;
  }
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  const chargeShape = {
    id: invoiceCharges.id,
    invoice: invoiceCharges.invoice,
    signature: invoiceCharges.signature,
    amount: invoiceCharges.amount,
    createdAt: invoiceCharges.createdAt,
  };
  const toCharge = (row: { id: number; invoice: string | null; signature: string | null; amount: bigint | null; createdAt: Date | null }) => ({
    id: row.id,
    invoice: row.invoice,
    signature: row.signature,
    amount: row.amount === null ? null : row.amount.toString(),
    createdAt: row.createdAt?.toISOString() ?? null,
  });
  // Per-invoice lookup (no metadata needed) — shape unchanged, now bounded.
  if (merchant === "") {
    let rows;
    try {
      rows = await db
        .select(chargeShape)
        .from(invoiceCharges)
        .where(
          after === null
            ? eq(invoiceCharges.invoice, invoice)
            : and(eq(invoiceCharges.invoice, invoice), gt(invoiceCharges.id, after)),
        )
        .orderBy(asc(invoiceCharges.id))
        .limit(CHARGES_PAGE_LIMIT);
    } catch (e) {
      return internalError(c, "list invoice charges", e);
    }
    return c.json({ invoice, charges: rows.map(toCharge) });
  }
  // Merchant rollup: INNER JOIN invoice_metadata on the invoice address.
  // Charges whose invoice has no metadata row are honestly excluded (no
  // merchant key to group by) — never attributed, never mocked. The COUNT+SUM
  // runs in SQL over the whole filtered set; only the charges page is fetched.
  const filter =
    invoice === ""
      ? eq(invoiceMetadata.merchant, merchant)
      : and(eq(invoiceMetadata.merchant, merchant), eq(invoiceCharges.invoice, invoice));
  try {
    const [aggRows, pageRows] = await Promise.all([
      db
        .select({ volume: sum(invoiceCharges.amount), count: count() })
        .from(invoiceCharges)
        .innerJoin(invoiceMetadata, eq(invoiceCharges.invoice, invoiceMetadata.invoice))
        .where(filter),
      db
        .select(chargeShape)
        .from(invoiceCharges)
        .innerJoin(invoiceMetadata, eq(invoiceCharges.invoice, invoiceMetadata.invoice))
        .where(after === null ? filter : and(filter, gt(invoiceCharges.id, after)))
        .orderBy(asc(invoiceCharges.id))
        .limit(CHARGES_PAGE_LIMIT),
    ]);
    const agg = aggRows[0];
    // sum() over a bigint-mode column yields string | null; null means no
    // rows were summed (empty set) — treat as zero gross.
    const grossRaw = agg?.volume ?? null;
    const volume = grossRaw === null ? 0n : BigInt(grossRaw);
    return c.json({
      merchant,
      ...(invoice === "" ? {} : { invoice }),
      count: agg?.count ?? 0,
      volume: volume.toString(),
      charges: pageRows.map(toCharge),
    });
  } catch (e) {
    return internalError(c, "aggregate merchant charges", e);
  }
});

/** Cache-hit helper: parse defensively — one corrupt Redis value must not
 *  500 the endpoint until TTL. On failure the key is dropped and the caller
 *  falls through to the DB path. */
async function cachedJson(c: Context, key: string): Promise<Response | null> {
  const cached = await cacheGet(key);
  if (cached === null) return null;
  try {
    return c.json(JSON.parse(cached) as unknown);
  } catch {
    await cacheDel(key);
    return null;
  }
}

app.get("/api/stats/volume", async (c) => {
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  // 30s Redis cache — index polls this metric on every visit.
  const hit = await cachedJson(c, "stats:volume");
  if (hit !== null) return hit;
  let rows;
  try {
    rows = await db.select({ volume: sum(invoiceCharges.amount), count: count() }).from(invoiceCharges);
  } catch (e) {
    return internalError(c, "aggregate stats volume", e);
  }
  const row = rows[0];
  const payload = { volume: row?.volume ?? "0", count: row?.count ?? 0 };
  await cacheSet("stats:volume", JSON.stringify(payload), 30);
  return c.json(payload);
});
// Protocol fees are DERIVED from gross, not stored: invoice_charges rows carry
// the gross charge amount (as written by POST /api/invoices/charges), so
// fees = floor(gross * FEE_BPS / FEE_DENOMINATOR) — the same integer math as
// per charge on-chain, so an aggregate over N different amounts can overshoot
// the true protocol revenue by < N base units; per-charge parity would be
// SUM((amount*40)/10000) in SQL. Evaluated in bigint (no floats).
app.get("/api/stats/fees", async (c) => {
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  // Same 30s cache as its sibling /api/stats/volume — the dashboard polls
  // both, and a full-table aggregate per request buys nothing.
  const hit = await cachedJson(c, "stats:fees");
  if (hit !== null) return hit;
  let rows;
  try {
    rows = await db.select({ gross: sum(invoiceCharges.amount), count: count() }).from(invoiceCharges);
  } catch (e) {
    return internalError(c, "aggregate stats fees", e);
  }
  const row = rows[0];
  // sum() over a bigint-mode column yields string | null; null means no rows
  // were summed (empty table) — treat as zero gross.
  const grossRaw = row?.gross ?? null;
  const gross = grossRaw === null ? 0n : BigInt(grossRaw);
  // Bigint division truncates; operands are non-negative, so this is floor.
  const fees = (gross * FEE_BPS) / FEE_DENOMINATOR;
  const payload = { fees: fees.toString(), count: row?.count ?? 0, gross: gross.toString() };
  await cacheSet("stats:fees", JSON.stringify(payload), 30);
  return c.json(payload);
});
app.route("/api/widget", widget);
app.route("/api/media", mediaApp);
app.route("/api/rpc", rpcApp);
app.route("/api/payments", paymentsApp);
app.route("/api/plans/meta", plansMetaApp);
app.route("/api", activityApp);

app.notFound((c) => c.json({ error: "Not found." }, 404));
