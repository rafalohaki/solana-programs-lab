import { eq, inArray } from "drizzle-orm";
import { redis } from "bun";
import type { Context } from "hono";
import { Hono } from "hono";
import nacl from "tweetnacl";
import { getDb } from "./db/client.js";
import { planMetadata } from "./db/schema.js";
import { rpcApp } from "./rpc.js";
import { base58Decode } from "./widget.js";

/** 60 s Redis cache for the grid read path (best-effort, same discipline as
 *  routes.ts cacheGet/cacheSet: Redis down = uncached, never an error). */
const META_TTL_SEC = 60;

async function metaCacheGet(key: string): Promise<string | null> {
  if ((process.env.REDIS_URL ?? "") === "") return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function metaCacheSet(key: string, value: string): Promise<void> {
  if ((process.env.REDIS_URL ?? "") === "") return;
  try {
    await redis.set(key, value, "EX", META_TTL_SEC);
  } catch {
    /* ignore — stale entries expire on their own */
  }
}

async function metaCacheDel(key: string): Promise<void> {
  if ((process.env.REDIS_URL ?? "") === "") return;
  try {
    await redis.del(key);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Plan metadata registry — merchant-DECLARED display copy for plan cards
// (title, description, category badge, optional handle). The on-chain plan
// account carries only the numbers; this table carries the copy a merchant
// wants shown, exactly like a product description in Stripe. Nothing here is
// verified on-chain beyond OWNERSHIP, and nothing is fabricated server-side:
// a row exists only because the plan's on-chain owner signed this write.
//
// Mounted at /api/plans/meta in routes.ts, so the standard /api/* body-limit
// and mutation rate-limit middleware cover these writes too.
//
// POST /  — upsert one plan's metadata. Two-layer ownership check (widget.ts
//           discipline): (1) ed25519 signature by the merchant over the
//           canonical plan-meta message (planMetaMessage below, ±10 min
//           window, generic 401); (2) the plan account is read from RPC and
//           its merchant field (disc 8 + merchant 32 @ offset 8, see
//           subscriptions/DESIGN.md §3) must equal the signing merchant.
//           Upsert semantics = FULL REPLACE of the four display fields: a
//           re-POST with fewer fields clears the rest (this is "edit
//           metadata", not "merge").
// GET /   — public, unsigned: ?plans=<base58,base58,…> (1..100, the plans
//           grid batch) or ?merchant=<base58> (one merchant's declarations,
//           cap 100). Plans without metadata are simply absent from the
//           response — the caller falls back to "Plan #N".
// ---------------------------------------------------------------------------

export const plansMetaApp = new Hono();

const DB_DOWN = "Database unavailable (DATABASE_URL not configured or unreachable).";
/** Same base58-address shape as widget.ts BASE58_RE / routes.ts MERCHANT_RE. */
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Replay window for the plan-meta timestamp (±10 minutes), mirroring widget/media/receipt-bind. */
const WINDOW_MS = 10 * 60 * 1000;
/** Generic auth failure — deliberately short and non-sensitive (widget.ts convention). */
const AUTH_FAILED = "Merchant signature verification failed.";

/**
 * Fixed category vocabulary (shared with the frontend mirror in
 * frontend/src/lib/plansMeta.ts — CONTRACT MIRROR, change both together).
 * The badge and the plans-grid category filters are derived ONLY from these
 * values; anything else is rejected at the gate below.
 */
export const PLAN_CATEGORIES = ["saas", "rpc", "ai", "community", "devtools"] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];
const CATEGORY_SET: ReadonlySet<string> = new Set<string>(PLAN_CATEGORIES);

/** Merchant-declared strings are printable single-line (INVOICE_RE class):
 * no control chars, no line breaks — they land in JSON responses and the
 * canonical signed message, where a newline would forge a field boundary. */
const PRINTABLE_RE = /^[^\u0000-\u001f\u007f]+$/;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 280;
const HANDLE_MAX = 40;
/** Batch GET cap — the grid shows dozens of plans; 100 is generous headroom. */
const LIST_LIMIT = 100;

/** Opaque 500 with a correlation ref — full error logged, client gets a ref. */
function internalError(c: Context, action: string, e: unknown): Response {
  const ref = crypto.randomUUID();
  console.error(`[plans-meta] ${action} failed (ref ${ref})`, e);
  return c.json({ error: "Internal error", ref }, 500);
}

/** Trim + normalize: absent/empty → null (the "not declared" value). */
function optionalText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false; field: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, field: "string" };
  const value = raw.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > max || !PRINTABLE_RE.test(value)) return { ok: false, field: `a printable single-line string (max ${max} chars)` };
  return { ok: true, value };
}

/**
 * Canonical plan-meta message. The merchant must sign EXACTLY this string
 * (UTF-8 bytes); unset optional fields carry an empty value slot so the
 * layout is deterministic for every field subset. CONTRACT MIRROR:
 * frontend/src/lib/plans-meta.ts duplicates this layout — change both
 * together (a new message grammar ships as a new label, never by editing
 * the frozen widget-bind / media-put / receipt-bind grammars).
 */
export function planMetaMessage(
  merchant: string,
  plan: string,
  title: string,
  description: string,
  category: string,
  handle: string,
  timestamp: number,
): string {
  return `onchainsub plan-meta\nmerchant:${merchant}\nplan:${plan}\ntitle:${title}\ndesc:${description}\ncategory:${category}\nhandle:${handle}\nts:${timestamp}`;
}

/** Verify a detached base58 ed25519 signature made by `merchant`
 *  (same decode discipline as widget.ts verifyWidgetBindSignature). */
function verifyPlanMetaSignature(message: string, merchant: string, signatureB58: string): boolean {
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

interface PlanOwner {
  ok: true;
  merchant: string;
}
interface PlanError {
  ok: false;
  status: 404 | 500 | 502;
  error: string;
}

/**
 * Read the plan account from RPC (through our own proxy: allowlist +
 * failover) and decode its merchant (bytes 8..40). Local copy of widget.ts
 * readPlanMerchant — that one is module-private and widget.ts is a frozen
 * contract file, so plans-meta carries its own instead of widening it.
 */
async function readPlanMerchant(plan: string): Promise<PlanOwner | PlanError> {
  let res: Response;
  try {
    res = await rpcApp.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [plan, { encoding: "base64" }],
      }),
    });
  } catch (e) {
    console.error("[plans-meta] verification rpc call failed:", e);
    return { ok: false, status: 502, error: "Plan could not be verified on-chain." };
  }
  if (!res.ok) {
    console.error(`[plans-meta] verification rpc answered HTTP ${res.status}.`);
    return { ok: false, status: 502, error: "Plan could not be verified on-chain." };
  }
  let json: { result?: { value?: { data?: [string, string] } | null } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, status: 502, error: "Plan could not be verified on-chain." };
  }
  const value = json.result?.value ?? null;
  if (value === null) return { ok: false, status: 404, error: "Plan account not found on-chain." };
  const raw = value.data?.[0] ?? "";
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(raw, "base64"));
  } catch {
    return { ok: false, status: 502, error: "Plan could not be verified on-chain." };
  }
  if (bytes.length < 40) {
    return { ok: false, status: 500, error: "Plan account layout too short (expected disc 8 + merchant 32)." };
  }
  // bytes[8..40] is the merchant pubkey (same layout as widget.ts).
  return { ok: true, merchant: base58Encode(bytes.slice(8, 40)) };
}

/** Base58 encode (Bitcoin alphabet) — local copy of widget.ts base58Encode
 *  (module-private there; importing it is impossible without widening the
 *  frozen widget contract file). */
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
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

const toMetaJson = (row: typeof planMetadata.$inferSelect) => ({
  plan: row.plan,
  merchant: row.merchant,
  title: row.title,
  description: row.description,
  category: row.category,
  handle: row.handle,
  updatedAt: row.updatedAt?.toISOString() ?? null,
});

plansMetaApp.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body; expected { merchant, plan, title?, description?, category?, handle?, signature, timestamp }." }, 400);
  }

  const merchant = typeof body.merchant === "string" ? body.merchant.trim() : "";
  if (!ADDRESS_RE.test(merchant)) return c.json({ error: "Body field merchant must be a base58 address." }, 400);
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!ADDRESS_RE.test(plan)) return c.json({ error: "Body field plan must be a base58 address." }, 400);

  // Optional display fields — each one printable + bounded; "" means "not
  // declared" and is stored as NULL.
  const title = optionalText(body.title, TITLE_MAX);
  if (!title.ok) return c.json({ error: `Body field title must be ${title.field}.` }, 400);
  const description = optionalText(body.description, DESCRIPTION_MAX);
  if (!description.ok) return c.json({ error: `Body field description must be ${description.field}.` }, 400);
  const categoryRaw = optionalText(body.category, 20);
  if (!categoryRaw.ok) return c.json({ error: `Body field category must be ${categoryRaw.field}.` }, 400);
  if (categoryRaw.value !== null && !CATEGORY_SET.has(categoryRaw.value)) {
    return c.json({ error: `Body field category must be one of: ${PLAN_CATEGORIES.join(", ")}.` }, 400);
  }
  const handle = optionalText(body.handle, HANDLE_MAX);
  if (!handle.ok) return c.json({ error: `Body field handle must be ${handle.field}.` }, 400);
  if (title.value === null && description.value === null && categoryRaw.value === null && handle.value === null) {
    return c.json({ error: "Declare at least one field (title, description, category or handle)." }, 400);
  }

  // Layer 1 — merchant signature over the canonical plan-meta message.
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature)) {
    return c.json({ error: "Body field signature must be base58 ed25519." }, 400);
  }
  const timestamp = typeof body.timestamp === "number" ? body.timestamp : Number.NaN;
  if (!Number.isInteger(timestamp)) {
    return c.json({ error: "Body field timestamp is required (ms epoch, integer)." }, 400);
  }
  if (Math.abs(Date.now() - timestamp) > WINDOW_MS) return c.json({ error: AUTH_FAILED }, 401);
  const message = planMetaMessage(
    merchant,
    plan,
    title.value ?? "",
    description.value ?? "",
    categoryRaw.value ?? "",
    handle.value ?? "",
    timestamp,
  );
  if (!verifyPlanMetaSignature(message, merchant, signature)) return c.json({ error: AUTH_FAILED }, 401);

  // Layer 2 (defense in depth) — the plan must exist on-chain and be owned by
  // the very merchant that signed above: metadata is bound to real plans,
  // never to an invented PDA.
  const owner = await readPlanMerchant(plan);
  if (!owner.ok) return c.json({ error: owner.error }, owner.status);
  if (owner.merchant !== merchant) {
    return c.json({ error: "Plan is owned by a different merchant (plan.merchant mismatch)." }, 403);
  }

  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  try {
    const rows = await db
      .insert(planMetadata)
      .values({
        plan,
        merchant,
        title: title.value,
        description: description.value,
        category: categoryRaw.value,
        handle: handle.value,
      })
      // Full replace on conflict (see module docs): the four display fields
      // take the new values; merchant never changes (the PDA encodes it and
      // layer 2 just re-verified it).
      .onConflictDoUpdate({
        target: planMetadata.plan,
        set: {
          title: title.value,
          description: description.value,
          category: categoryRaw.value,
          handle: handle.value,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) return internalError(c, "store plan metadata (empty returning row)", new Error("INSERT returned no row"));
    // Drop the merchant read cache; batch (?plans=) keys holding this plan go
    // stale for at most META_TTL_SEC (not enumerable — accepted, documented).
    await metaCacheDel(`plans-meta:merchant:${merchant}`);
    return c.json({ ok: true, meta: toMetaJson(row) }, 201);
  } catch (e) {
    return internalError(c, "store plan metadata", e);
  }
});

plansMetaApp.get("/", async (c) => {
  const plansRaw = c.req.query("plans") ?? "";
  const merchant = (c.req.query("merchant") ?? "").trim();
  if (plansRaw !== "" && merchant !== "") {
    return c.json({ error: "Use either plans or merchant, not both." }, 400);
  }
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  try {
    if (merchant !== "") {
      if (!ADDRESS_RE.test(merchant)) return c.json({ error: "Query param merchant must be a base58 address." }, 400);
      const key = `plans-meta:merchant:${merchant}`;
      const hit = await metaCacheGet(key);
      if (hit !== null) return c.json(JSON.parse(hit) as unknown);
      const rows = await db.select().from(planMetadata).where(eq(planMetadata.merchant, merchant)).limit(LIST_LIMIT);
      const payload = { merchant, metas: rows.map(toMetaJson) };
      await metaCacheSet(key, JSON.stringify(payload));
      return c.json(payload);
    }
    // Batch by plan PDAs — the plans-grid read path. Dedupe, validate, bound.
    // Every surviving address passes ADDRESS_RE (a bad one 400s), so the
    // inArray set is non-empty exactly when requested is.
    const requested = [...new Set(plansRaw.split(",").map((p) => p.trim()).filter((p) => p !== ""))];
    if (requested.length === 0) return c.json({ error: "Query param plans (comma-separated base58 addresses) or merchant is required." }, 400);
    if (requested.length > LIST_LIMIT) {
      return c.json({ error: `Query param plans accepts at most ${LIST_LIMIT} addresses.` }, 400);
    }
    for (const p of requested) {
      if (!ADDRESS_RE.test(p)) return c.json({ error: "Query param plans must be comma-separated base58 addresses." }, 400);
    }
    // Cache key is order-independent (sorted) so ?plans=a,b and ?plans=b,a share it.
    const key = `plans-meta:plans:${[...requested].sort().join(",")}`;
    const hit = await metaCacheGet(key);
    if (hit !== null) return c.json(JSON.parse(hit) as unknown);
    const rows = await db.select().from(planMetadata).where(inArray(planMetadata.plan, requested));
    // Plans without a metadata row are honestly absent (no fabricated copy) —
    // the client renders its on-chain fallback for those.
    const payload = { metas: rows.map(toMetaJson) };
    await metaCacheSet(key, JSON.stringify(payload));
    return c.json(payload);
  } catch (e) {
    return internalError(c, "list plan metadata", e);
  }
});
