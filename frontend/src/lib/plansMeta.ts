import bs58 from "bs58";
import { signMessage } from "./wallet.js";

// ---------------------------------------------------------------------------
// Plan metadata registry client (merchant-DECLARED display copy: title,
// description, category badge, optional handle).
//
// CONTRACT MIRROR: backend/src/plans-meta.ts owns the canonical message,
// the category vocabulary and the field bounds — keep both files in sync
// (no shared package). The canonical plan-meta message is a NEW grammar
// (label `plan-meta`); the widget-bind / media-put / receipt-bind grammars
// are separate contracts and are not modified by plan-meta changes.
// ---------------------------------------------------------------------------

/** Fixed category vocabulary — mirror of backend PLAN_CATEGORIES. */
export const PLAN_CATEGORIES = ["saas", "rpc", "ai", "community", "devtools"] as const;
export type PlanCategory = (typeof PLAN_CATEGORIES)[number];

/** i18n key for a category label (dictionaries live in i18n-home2.ts):
 * saas → "home2.catSaas", community → "home2.catCommunity", … */
export function planCategoryKey(category: PlanCategory): string {
  return `home2.cat${category[0]?.toUpperCase() ?? ""}${category.slice(1)}`;
}

/** Field bounds — mirror of backend TITLE_MAX / DESCRIPTION_MAX / HANDLE_MAX. */
export const META_TITLE_MAX = 80;
export const META_DESCRIPTION_MAX = 280;
/** Mirror of the backend's printable single-line rule: no control chars, no
 *  line breaks — declared copy lands in the canonical signed message, where
 *  a newline would forge a field boundary. */
const PRINTABLE_RE = /^[^\u0000-\u001f\u007f]+$/;

/** One metadata row as served by GET /api/plans/meta (absent fields = null). */
export interface PlanMeta {
  plan: string;
  merchant: string;
  title: string | null;
  description: string | null;
  category: PlanCategory | null;
  handle: string | null;
  updatedAt: string;
}

/** Canonical plan-meta message — EXACTLY what the wallet signs (mirror of
 *  backend planMetaMessage; unset fields carry an empty value slot). */
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

/**
 * Batch-read metadata for plan PDAs. Plans without metadata are absent from
 * the result — callers fall back to the on-chain-only card ("Plan #N").
 * Fail-soft at the CALLER: this throws on HTTP errors so the grid can decide
 * (render without metadata beats fabricating any).
 */
export async function fetchPlansMeta(plans: string[]): Promise<Record<string, PlanMeta>> {
  const unique = [...new Set(plans.map((p) => p.trim()).filter((p) => p !== ""))];
  if (unique.length === 0) return {};
  const res = await fetch(`/api/plans/meta?plans=${encodeURIComponent(unique.join(","))}`);
  const json = (await res.json()) as { metas?: PlanMeta[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? `Plan metadata fetch failed (HTTP ${res.status}).`);
  const out: Record<string, PlanMeta> = {};
  for (const meta of json.metas ?? []) out[meta.plan] = meta;
  return out;
}

export interface PublishPlanMetaFields {
  merchant: string;
  /** Plan PDA (base58) — must already exist on-chain and be owned by merchant. */
  plan: string;
  title: string;
  description: string;
  /** "" = not declared. Must be one of PLAN_CATEGORIES when non-empty. */
  category: string;
  handle: string;
}

/**
 * Sign the canonical plan-meta message with the connected merchant wallet and
 * POST the upsert. Throws on any failure; the message is fully deterministic
 * (same timestamp), so the SAME signed payload is retried once when the
 * on-chain ownership read lags the just-confirmed create tx (404/502) — an
 * identical upsert, not a duplicate.
 */
export async function publishPlanMeta(fields: PublishPlanMetaFields): Promise<PlanMeta> {
  // Pre-sign guard (mirror of the backend gate): reject doomed payloads BEFORE
  // the wallet popup, so the merchant never signs copy the server must refuse.
  const declared: Array<[string, string, number]> = [
    ["title", fields.title.trim(), META_TITLE_MAX],
    ["description", fields.description.trim(), META_DESCRIPTION_MAX],
  ];
  for (const [name, value, max] of declared) {
    if (value !== "" && (value.length > max || !PRINTABLE_RE.test(value))) {
      throw new Error(`${name} must be a printable single-line string (max ${max} chars).`);
    }
  }
  const timestamp = Date.now();
  const message = planMetaMessage(
    fields.merchant,
    fields.plan,
    fields.title.trim(),
    fields.description.trim(),
    fields.category.trim(),
    fields.handle.trim(),
    timestamp,
  );
  const signature = bs58.encode(await signMessage(new TextEncoder().encode(message)));
  const body = JSON.stringify({
    merchant: fields.merchant,
    plan: fields.plan,
    title: fields.title.trim(),
    description: fields.description.trim(),
    category: fields.category.trim(),
    handle: fields.handle.trim(),
    signature,
    timestamp,
  });

  let res = await fetch("/api/plans/meta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  // Devnet RPC can serve a pre-create snapshot to the server's ownership read
  // right after a confirmed create — one idempotent retry (same signature),
  // then surface the error honestly.
  if (res.status === 404 || res.status === 502) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    res = await fetch("/api/plans/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }
  const json = (await res.json()) as { meta?: PlanMeta; error?: string };
  if (!res.ok || json.meta === undefined) {
    throw new Error(json.error ?? `Plan metadata publish failed (HTTP ${res.status}).`);
  }
  return json.meta;
}
