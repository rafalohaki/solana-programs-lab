import { Connection, PublicKey, type Commitment, type FetchFn } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { formatTokenAmount } from "./fee.js";

// ---------------------------------------------------------------------------
// On-chain reads for the subscriptions program (Model B).
// No IDL needed: account layouts are decoded manually from DESIGN.md.
// ---------------------------------------------------------------------------

/** Re-exported canonical formatter — one implementation for the whole app. */
export { formatTokenAmount };

/** Placeholder program id — replaced after `anchor deploy` (see .env.example). */
const PLACEHOLDER_PROGRAM_ID = "SubScribe1111111111111111111111111111111111";

/** Build-time env with devnet fallbacks so SSR never crashes without .env. */
export function readEnv(name: "PUBLIC_SUBSCRIPTIONS_PROGRAM_ID" | "PUBLIC_SOLANA_RPC" | "PUBLIC_SOLANA_CLUSTER" | "PUBLIC_SITE_URL", fallback: string): string {
  const value = import.meta.env[name] as string | undefined;
  return value !== undefined && value.length > 0 ? value : fallback;
}

/**
 * Verified devnet USDC mint (Circle): developers.circle.com/stablecoins/
 * usdc-contract-addresses — cross-checked live (getAccountInfo → owner
 * Tokenkeg…VQ5DA, parsed mint, 6 decimals). The ONLY address allowed a
 * hardcoded decimals fallback.
 */
export const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * Fail fast with the offending value: a raw bs58 constructor error at module
 * scope gives SSR requests and island imports no clue which env is broken.
 */
function programIdFromEnv(): PublicKey {
  const raw = readEnv("PUBLIC_SUBSCRIPTIONS_PROGRAM_ID", PLACEHOLDER_PROGRAM_ID);
  try {
    return new PublicKey(raw);
  } catch {
    throw new Error(`Invalid PUBLIC_SUBSCRIPTIONS_PROGRAM_ID: ${raw}`);
  }
}

export const PROGRAM_ID = programIdFromEnv();
/**
 * RPC endpoint. Default: OUR OWN JSON-RPC proxy (`/api/rpc`) — same origin in
 * the browser, backend-internal on SSR — so visitors never hammer the public
 * cluster RPC directly (it rate-limits hard). The browser branch ALWAYS uses
 * the proxy: PUBLIC_SOLANA_RPC is honored ONLY on SSR, because every
 * import.meta.env value is public — a key-pinned URL would leak the key to
 * every visitor. Paid RPC belongs behind the backend proxy.
 */
export const RPC_ENDPOINT =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/rpc`
    : readEnv("PUBLIC_SOLANA_RPC", "").length > 0
      ? readEnv("PUBLIC_SOLANA_RPC", "")
      : `${(process.env["BACKEND_URL"] ?? "http://backend:3001").replace(/\/+$/, "")}/api/rpc`;
export const CLUSTER = readEnv("PUBLIC_SOLANA_CLUSTER", "devnet");

export interface Plan {
  address: PublicKey;
  merchant: PublicKey;
  mint: PublicKey;
  amount: bigint;
  periodSeconds: bigint;
  planId: bigint;
  bump: number;
}

export type SubscriptionStatus = "active" | "cancelled";

export interface Subscription {
  address: PublicKey;
  plan: PublicKey;
  subscriber: PublicKey;
  lastPaidAt: bigint;
  status: SubscriptionStatus;
  bump: number;
}

/**
 * Account layout table — the SINGLE source for both the manual decoders and
 * the getProgramAccounts memcmp filters. Keeping filters and decoders on the
 * same constants means a program layout update fails loudly (decode returns
 * null / accounts stop matching) instead of silently rendering an empty list.
 * MUST match DESIGN.md and subscriptions/programs/.../state.rs.
 */
export const LAYOUT = {
  DISCRIMINATOR_LEN: 8,
  PUBKEY_LEN: 32,
  // SubscriptionPlan: 8 disc + 32 merchant + 32 mint + 8 amount + 8 period
  // + 8 planId + 1 bump = 97 bytes.
  PLAN_MERCHANT: 8,
  PLAN_MINT: 40,
  PLAN_AMOUNT: 72,
  PLAN_PERIOD: 80,
  PLAN_ID: 88,
  PLAN_BUMP: 96,
  PLAN_LEN: 97,
  // Subscription: 8 disc + 32 plan + 32 subscriber + 8 lastPaidAt + 1 status
  // + 1 bump = 82 bytes.
  SUB_PLAN: 8,
  SUB_SUBSCRIBER: 40,
  SUB_LAST_PAID: 72,
  SUB_STATUS: 80,
  SUB_BUMP: 81,
  SUB_LEN: 82,
  // Invoice: 8 disc + 32*4 + 8 invoiceId + 8 amount + 32 memoHash + 8 paidAt
  // + 1 status + 1 bump = 194 bytes.
  INV_PLAN: 8,
  INV_SUBSCRIPTION: 40,
  INV_MERCHANT: 72,
  INV_SUBSCRIBER: 104,
  INV_ID: 136,
  INV_AMOUNT: 144,
  INV_MEMO: 152,
  INV_PAID: 184,
  INV_STATUS: 192,
  INV_BUMP: 193,
  INV_LEN: 194,
} as const;

/** Anchor account discriminator: sha256("account:<Name>")[0..8]. */
async function discriminator(accountName: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(`account:${accountName}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(hash).slice(0, 8);
}

function u64(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
}

function i64(view: DataView, offset: number): bigint {
  return view.getBigInt64(offset, true);
}

function pubkeyAt(raw: Uint8Array, offset: number): PublicKey {
  return new PublicKey(raw.slice(offset, offset + LAYOUT.PUBKEY_LEN));
}

/** SubscriptionPlan (see LAYOUT). */
export function decodePlan(address: PublicKey, data: Uint8Array): Plan | null {
  if (data.length < LAYOUT.PLAN_LEN) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    address,
    merchant: pubkeyAt(data, LAYOUT.PLAN_MERCHANT),
    mint: pubkeyAt(data, LAYOUT.PLAN_MINT),
    amount: u64(view, LAYOUT.PLAN_AMOUNT),
    periodSeconds: i64(view, LAYOUT.PLAN_PERIOD),
    planId: u64(view, LAYOUT.PLAN_ID),
    bump: data[LAYOUT.PLAN_BUMP] ?? 0,
  };
}

/** Subscription (see LAYOUT). */
export function decodeSubscription(address: PublicKey, data: Uint8Array): Subscription | null {
  if (data.length < LAYOUT.SUB_LEN) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const statusByte = data[LAYOUT.SUB_STATUS] ?? 1;
  return {
    address,
    plan: pubkeyAt(data, LAYOUT.SUB_PLAN),
    subscriber: pubkeyAt(data, LAYOUT.SUB_SUBSCRIBER),
    lastPaidAt: i64(view, LAYOUT.SUB_LAST_PAID),
    status: statusByte === 0 ? "active" : "cancelled",
    bump: data[LAYOUT.SUB_BUMP] ?? 0,
  };
}

export type InvoiceStatus = "unpaid" | "paid" | "voided" | "unknown";

export interface Invoice {
  address: PublicKey;
  plan: PublicKey;
  subscription: PublicKey;
  merchant: PublicKey;
  subscriber: PublicKey;
  invoiceId: bigint;
  amount: bigint;
  memoHash: string;
  paidAt: bigint;
  status: InvoiceStatus;
  bump: number;
}

/** Invoice (see LAYOUT). */
export function decodeInvoice(address: PublicKey, data: Uint8Array): Invoice | null {
  if (data.length < LAYOUT.INV_LEN) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const statusByte = data[LAYOUT.INV_STATUS] ?? 255;
  const memoBytes = data.slice(LAYOUT.INV_MEMO, LAYOUT.INV_MEMO + LAYOUT.PUBKEY_LEN);
  return {
    address,
    plan: pubkeyAt(data, LAYOUT.INV_PLAN),
    subscription: pubkeyAt(data, LAYOUT.INV_SUBSCRIPTION),
    merchant: pubkeyAt(data, LAYOUT.INV_MERCHANT),
    subscriber: pubkeyAt(data, LAYOUT.INV_SUBSCRIBER),
    invoiceId: u64(view, LAYOUT.INV_ID),
    amount: u64(view, LAYOUT.INV_AMOUNT),
    memoHash: Array.from(memoBytes, (b) => b.toString(16).padStart(2, "0")).join(""),
    paidAt: i64(view, LAYOUT.INV_PAID),
    status: statusByte === 0 ? "unpaid" : statusByte === 1 ? "paid" : statusByte === 2 ? "voided" : "unknown",
    bump: data[LAYOUT.INV_BUMP] ?? 0,
  };
}

export function findInvoicePda(subscription: PublicKey, invoiceId: bigint): [PublicKey, number] {
  const le8 = new Uint8Array(8);
  new DataView(le8.buffer).setBigUint64(0, invoiceId, true);
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("invoice"), subscription.toBytes(), le8],
    PROGRAM_ID,
  );
}

/** Plan PDA — MUST match `[b"plan", merchant, plan_id LE8]` in state.rs. */
export function findPlanPda(merchant: PublicKey, planId: bigint): [PublicKey, number] {
  const le8 = new Uint8Array(8);
  new DataView(le8.buffer).setBigUint64(0, planId, true);
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("plan"), merchant.toBytes(), le8],
    PROGRAM_ID,
  );
}

/** Subscription PDA — MUST match `[b"sub", plan, subscriber]` in state.rs. */
export function findSubscriptionPda(plan: PublicKey, subscriber: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("sub"), plan.toBytes(), subscriber.toBytes()],
    PROGRAM_ID,
  );
}

export async function fetchInvoicesOfMerchant(conn: Connection, merchant: PublicKey): Promise<Invoice[]> {
  const disc = await discriminator("Invoice");
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    encoding: "base64",
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(disc) } },
      // Same offset as decodeInvoice's merchant field (LAYOUT.INV_MERCHANT).
      { memcmp: { offset: LAYOUT.INV_MERCHANT, bytes: merchant.toBase58() } },
    ],
  });
  const invoices: Invoice[] = [];
  for (const acc of accounts) {
    const inv = decodeInvoice(acc.pubkey, new Uint8Array(acc.account.data));
    if (inv !== null) invoices.push(inv);
  }
  invoices.sort((a, b) => (a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0));
  return invoices;
}

/** sha256 hex over UTF-8 (invoice metadata → memoHash). */
export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

// --- RPC connection (singleton per commitment) ------------------------------

const RPC_FETCH_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jittered delay (~±30%) so concurrent islands do not retry in lockstep. */
function jitterBackoff(baseMs: number): number {
  return Math.round(baseMs * (0.7 + Math.random() * 0.6));
}

/** Soft rate-limit hint: providers may answer HTTP 200 with a JSON-RPC error
 * carrying `error.data.try_again_in` (ms). Returns null when absent. */
function tryAgainInMs(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { error?: { data?: { try_again_in?: unknown } } };
    const raw = parsed.error?.data?.try_again_in;
    const ms = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null; // non-JSON body (tunnel error page etc.) — nothing to honor
  }
}

/**
 * Central fetch for the ONE shared Connection: retries 429/5xx/network
 * failures up to 3× with jittered backoff (~1s doubling), honoring
 * Retry-After and `try_again_in` hints. web3.js's own 429 retry stays
 * enabled behind this as a second belt.
 */
const rpcFetch: FetchFn = async (input, init) => {
  let waitMs = jitterBackoff(1000);
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await globalThis.fetch(input, init);
    } catch (err) {
      if (attempt >= RPC_FETCH_RETRIES) throw err;
      await sleep(waitMs);
      waitMs = jitterBackoff(waitMs * 2);
      continue;
    }
    const httpHint = Number(res.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(httpHint) && httpHint > 0 ? httpHint * 1000 : waitMs;
    // Read the body once and hand web3.js a buffered response — this lets us
    // peek `try_again_in` without consuming the stream web3.js needs.
    const text = await res.text();
    const bodyHint = res.ok ? tryAgainInMs(text) : null;
    const throttled = res.status === 429 || res.status >= 500 || bodyHint !== null;
    if (!throttled || attempt >= RPC_FETCH_RETRIES) {
      return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    await sleep(Math.min(bodyHint ?? retryAfterMs, 5000));
    waitMs = jitterBackoff(waitMs * 2);
  }
};

/** One Connection per commitment — every island and payment flow shares it. */
const connections = new Map<Commitment, Connection>();

export function connection(commitment: Commitment = "confirmed"): Connection {
  let conn = connections.get(commitment);
  if (conn === undefined) {
    conn = new Connection(RPC_ENDPOINT, { commitment, fetch: rpcFetch });
    connections.set(commitment, conn);
  }
  return conn;
}

// --- mint decimals -----------------------------------------------------------

/** Mint decimals are immutable — cache the read for a day. */
const DECIMALS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const decimalsCache = new Map<string, { at: number; decimals: number | null }>();

function decimalsFromAccount(info: { data: Uint8Array; owner: PublicKey } | null): number | null {
  // SPL mint layout: decimals sits at byte 44 of an 82-byte mint account.
  if (info === null || !info.owner.equals(TOKEN_PROGRAM_ID) || info.data.length < 45) return null;
  return info.data[44] ?? null;
}

/**
 * Batched decimals for MANY mints in one getMultipleAccounts round trip.
 * Unknown/unreadable mints map to null (render as "unknown" — never a fake
 * default); results are module-cached because decimals never change.
 */
export async function fetchMintDecimalsMany(
  conn: Connection,
  mints: PublicKey[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const missing = new Map<string, PublicKey>();
  const now = Date.now();
  for (const mint of mints) {
    const key = mint.toBase58();
    if (out.has(key)) continue;
    const hit = decimalsCache.get(key);
    if (hit !== undefined && now - hit.at < DECIMALS_CACHE_TTL_MS) {
      out.set(key, hit.decimals);
    } else {
      missing.set(key, mint);
    }
  }
  const queue = [...missing.values()];
  for (let i = 0; i < queue.length; i += 100) {
    const chunk = queue.slice(i, i + 100);
    let response: Array<{ data: Uint8Array; owner: PublicKey } | null>;
    try {
      response = await conn.getMultipleAccountsInfo(chunk);
    } catch {
      // RPC failure → unknown for this chunk (no silent defaults, no cache).
      for (const mint of chunk) out.set(mint.toBase58(), null);
      continue;
    }
    chunk.forEach((mint, index) => {
      const info = response[index] ?? null;
      const decimals = decimalsFromAccount(
        info === null ? null : { data: new Uint8Array(info.data), owner: info.owner },
      );
      out.set(mint.toBase58(), decimals);
      decimalsCache.set(mint.toBase58(), { at: now, decimals });
    });
  }
  return out;
}

/**
 * Single-mint decimals. Fails loudly (throws) instead of mapping every RPC
 * failure to a fake 6 — the hardcoded 6 applies ONLY to the known Circle
 * USDC address. Consumers that cannot throw should use
 * {@link fetchMintDecimalsMany} and render "unknown" themselves.
 */
export async function fetchMintDecimals(conn: Connection, mint: PublicKey): Promise<number> {
  const map = await fetchMintDecimalsMany(conn, [mint]);
  const decimals = map.get(mint.toBase58());
  if (typeof decimals === "number") return decimals;
  if (mint.toBase58() === USDC_DEVNET_MINT) return 6;
  throw new Error(`Mint ${mint.toBase58()} has no readable account on this cluster (decimals unknown).`);
}

export async function fetchPlans(conn: Connection): Promise<Plan[]> {
  const disc = await discriminator("SubscriptionPlan");
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    encoding: "base64",
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc) } }],
  });
  const plans: Plan[] = [];
  for (const acc of accounts) {
    const plan = decodePlan(acc.pubkey, new Uint8Array(acc.account.data));
    if (plan !== null) plans.push(plan);
  }
  plans.sort((a, b) => (a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0));
  return plans;
}

export async function fetchSubscriptionsOf(conn: Connection, subscriber: PublicKey): Promise<Subscription[]> {
  const disc = await discriminator("Subscription");
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    encoding: "base64",
    filters: [
      { memcmp: { offset: 0, bytes: bs58.encode(disc) } },
      // Same offset as decodeSubscription's subscriber field.
      { memcmp: { offset: LAYOUT.SUB_SUBSCRIBER, bytes: subscriber.toBase58() } },
    ],
  });
  const subs: Subscription[] = [];
  for (const acc of accounts) {
    const sub = decodeSubscription(acc.pubkey, new Uint8Array(acc.account.data));
    if (sub !== null) subs.push(sub);
  }
  return subs;
}

// --- formatting -------------------------------------------------------------

export type PeriodLang = "en" | "pl";

const PERIOD_UNITS: Record<PeriodLang, [string, string, string, string, string]> = {
  en: ["sec", "min", "h", "days", "mo"],
  pl: ["sek", "min", "godz", "dni", "mies"],
};

export function formatPeriod(totalSeconds: bigint, lang: PeriodLang = "en"): string {
  const [sec, min, hr, days, mo] = PERIOD_UNITS[lang];
  const s = Number(totalSeconds);
  if (s < 90) return `${s} ${sec}`;
  if (s < 5400) return `${Math.round(s / 60)} ${min}`;
  if (s < 129600) return `${Math.round(s / 3600)} ${hr}`;
  const d = Math.round(s / 86400);
  if (d < 60) return `${d} ${days}`;
  return `${Math.round(d / 30)} ${mo}`;
}

/** Seconds until `now >= lastPaidAt + period` (0 = charge due now). */
export function secondsUntilCharge(lastPaidAt: bigint, periodSeconds: bigint, nowSec: number): number {
  if (lastPaidAt === 0n) return 0;
  const dueAt = Number(lastPaidAt) + Number(periodSeconds);
  return Math.max(0, Math.ceil(dueAt - nowSec));
}

export function shortAddr(key: PublicKey, chars = 4): string {
  const s = key.toBase58();
  return `${s.slice(0, chars)}…${s.slice(-chars)}`;
}

export function explorerTxUrl(signature: string): string {
  const cluster = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

/**
 * Explorer link for an ACCOUNT — identity surfaces pair the short `4+4`
 * label with a one-click full-address verification (address poisoning makes
 * lookalike addresses cheap). Callers should offer the full base58 address
 * for copying (ui.ts copyText) alongside this link.
 */
export function explorerAccountUrl(address: string | PublicKey): string {
  const addr = typeof address === "string" ? address : address.toBase58();
  const cluster = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
  return `https://explorer.solana.com/account/${addr}${cluster}`;
}
