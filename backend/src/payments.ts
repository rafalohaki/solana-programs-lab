import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { getDb } from "./db/client.js";
import { payments } from "./db/schema.js";
import { rpcApp } from "./rpc.js";

// ---------------------------------------------------------------------------
// One-time payments (Stripe-style payment links). Mounted at /api/payments in
// routes.ts (alongside widget/media/rpc), so the standard /api/* body-limit
// and mutation rate-limit middleware in routes.ts cover these writes too.
//
// POST /record stores one row per CONFIRMED on-chain transfer: before the
// INSERT the transaction signature is verified against the cluster through
// our own RPC proxy (allowlist + failover) — fail-closed, exactly like the
// invoice-charge receipt path in routes.ts (verifyChargeOnChain). The UNIQUE
// constraint on `signature` is the dedupe: a replayed or duplicated record
// answers 409, and the client's own "record" step stays idempotent.
//
// GET /?merchant= lists a merchant's payments, newest first, hard-capped at
// 50 — the merchant index (payments_merchant_idx, db-init/004) keeps the
// query bounded.
// ---------------------------------------------------------------------------

export const paymentsApp = new Hono();

const DB_DOWN = "Database unavailable (DATABASE_URL not configured or unreachable).";

/** Same base58-address shape as routes.ts (MERCHANT_RE). */
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** ed25519/tx signature decodes to 64 bytes → ~87-88 base58 chars. */
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;
/** Optional memo — printable, bounded (never reaches mail HTML here, but the
 *  same discipline as routes.ts INVOICE_RE applies to any merchant string). */
const MEMO_RE = /^[^\u0000-\u001f\u007f]{1,200}$/;
/** List cap (spec: limit 50). */
const LIST_LIMIT = 50;

/**
 * Lamports / amounts from JSON. Decimal strings are THE input format —
 * JSON.parse rounds values above 2^53 (mirror of toBigint in routes.ts).
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

/** Opaque 500 with a correlation ref — full error logged, client gets a ref. */
function internalError(c: Context, action: string, e: unknown): Response {
  const ref = crypto.randomUUID();
  console.error(`[payments] ${action} failed (ref ${ref})`, e);
  return c.json({ error: "Internal error", ref }, 500);
}

/**
 * Confirm the payment's transaction signature on-chain via the RPC proxy.
 * Local copy of routes.ts verifyChargeOnChain (importing routes.ts from here
 * would be a circular import): getSignatureStatuses with searchHistory so
 * older transactions still resolve; a missing or failed transaction never
 * reaches the table.
 */
async function verifyPaymentOnChain(
  txSignature: string,
): Promise<{ ok: true } | { ok: false; status: 400 | 502; error: string }> {
  let res: Response;
  try {
    res = await rpcApp.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[txSignature], { searchHistory: true }],
      }),
    });
  } catch (e) {
    console.error("[payments] verification rpc call failed:", e);
    return { ok: false, status: 502, error: "Payment could not be verified on-chain." };
  }
  if (!res.ok) {
    console.error(`[payments] verification rpc answered HTTP ${res.status}.`);
    return { ok: false, status: 502, error: "Payment could not be verified on-chain." };
  }
  let json: { result?: { value?: Array<{ err: unknown } | null> } };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, status: 502, error: "Payment could not be verified on-chain." };
  }
  const status = json.result?.value?.[0];
  if (status === undefined || status === null) {
    return { ok: false, status: 400, error: "Payment signature not found on-chain." };
  }
  if (status.err !== null && status.err !== undefined) {
    return { ok: false, status: 400, error: "Payment transaction failed on-chain." };
  }
  return { ok: true };
}

paymentsApp.post("/record", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body; expected { merchant, amount, signature }." }, 400);
  }
  const merchant = typeof body.merchant === "string" ? body.merchant.trim() : "";
  if (!ADDRESS_RE.test(merchant)) {
    return c.json({ error: "Body field merchant must be a base58 address." }, 400);
  }
  const amount = toBigint(body.amount);
  if (amount === null || amount <= 0n) {
    return c.json(
      { error: "Body field amount must be a positive integer — send it as a decimal string (no precision loss)." },
      400,
    );
  }
  const mintRaw = typeof body.mint === "string" ? body.mint.trim() : "";
  if (mintRaw !== "" && !ADDRESS_RE.test(mintRaw)) {
    return c.json({ error: "Body field mint must be a base58 address." }, 400);
  }
  const mint = mintRaw === "" ? null : mintRaw;
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  if (!SIG_RE.test(signature)) {
    return c.json({ error: "Body field signature must be a base58 transaction signature." }, 400);
  }
  const memoRaw = typeof body.memo === "string" ? body.memo.trim() : "";
  if (memoRaw !== "" && !MEMO_RE.test(memoRaw)) {
    return c.json({ error: "Body field memo must be a printable string (max 200 chars)." }, 400);
  }
  const memo = memoRaw === "" ? null : memoRaw;

  // Honesty gate: the row exists only because the transfer exists on-chain.
  const chain = await verifyPaymentOnChain(signature);
  if (!chain.ok) return c.json({ error: chain.error }, chain.status);

  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  let inserted;
  try {
    inserted = await db
      .insert(payments)
      .values({ merchant, mint, amount, memo, signature })
      .onConflictDoNothing({ target: payments.signature })
      .returning();
  } catch (e) {
    return internalError(c, "record payment", e);
  }
  const row = inserted[0];
  if (row === undefined) {
    // UNIQUE conflict → the signature was already recorded: dedupe, not an error.
    return c.json({ error: "Payment signature already recorded." }, 409);
  }
  return c.json(
    {
      id: row.id,
      merchant: row.merchant,
      mint: row.mint,
      amount: row.amount.toString(),
      memo: row.memo,
      signature: row.signature,
      createdAt: row.createdAt?.toISOString() ?? null,
    },
    201,
  );
});

paymentsApp.get("/", async (c) => {
  const merchant = c.req.query("merchant") ?? "";
  if (!ADDRESS_RE.test(merchant)) {
    return c.json({ error: "Query param merchant must be a base58 address." }, 400);
  }
  const db = getDb();
  if (db === null) return c.json({ error: DB_DOWN }, 503);
  let rows;
  try {
    rows = await db
      .select()
      .from(payments)
      .where(eq(payments.merchant, merchant))
      .orderBy(desc(payments.id))
      .limit(LIST_LIMIT);
  } catch (e) {
    return internalError(c, "list payments", e);
  }
  return c.json({
    merchant,
    payments: rows.map((row) => ({
      id: row.id,
      merchant: row.merchant,
      mint: row.mint,
      amount: row.amount.toString(),
      memo: row.memo,
      signature: row.signature,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
  });
});
