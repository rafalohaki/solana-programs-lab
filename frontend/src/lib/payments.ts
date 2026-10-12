import { tOr } from "./i18n.js";
import { signAndSendAction } from "./wallet.js";

// ---------------------------------------------------------------------------
// One-time payments (Stripe-style payment links) client. Mirrors the wallet
// round-trip used by subscriptions: the SERVER builds an unsigned, plain
// transfer via /api/actions/pay (SystemProgram.transfer for SOL, SPL
// transferChecked for tokens — no delegation), signAndSendAction asserts the
// blind-signing guard, the wallet signs and sends, and only then is the tx
// signature POSTed to /api/payments/record (the backend re-verifies it
// on-chain before storing). The server never signs anything.
// ---------------------------------------------------------------------------

export interface OneTimePaymentParams {
  /** Merchant (payee) base58 address. */
  merchant: string;
  /** Amount in BASE UNITS (lamports for SOL, mint decimals otherwise). */
  amount: bigint;
  /** SPL mint address — omit for native SOL. */
  mint?: string;
  /** Optional display label carried through the actions metadata. */
  label?: string;
  /** Optional memo carried through the actions metadata and the receipt row. */
  memo?: string;
}

export interface PayOneTimeResult {
  /** Confirmed transaction signature. */
  signature: string;
  /** Server-built action message, when provided. */
  message?: string;
  /** Whether POST /api/payments/record accepted the row. The transfer itself
   *  is complete either way — false means the receipt list will not show it
   *  (backend down / verification failed), never that the payment failed. */
  recorded: boolean;
}

/** Build the same-origin Actions endpoint for this payment. */
function payActionUrl(params: OneTimePaymentParams): string {
  const qs = new URLSearchParams({
    merchant: params.merchant,
    amount: params.amount.toString(),
  });
  if (params.mint !== undefined && params.mint !== "") qs.set("mint", params.mint);
  if (params.label !== undefined && params.label !== "") qs.set("label", params.label);
  if (params.memo !== undefined && params.memo !== "") qs.set("memo", params.memo);
  return `/api/actions/pay?${qs.toString()}`;
}

/**
 * Full one-time round-trip: build (server) → assert → sign → send → confirm
 * (signAndSendAction) → record the signature (best-effort: the transfer has
 * already landed, so a recording failure is reported, not fatal).
 */
export async function payOneTime(params: OneTimePaymentParams): Promise<PayOneTimeResult> {
  const { signature, message } = await signAndSendAction(payActionUrl(params));
  let recorded = false;
  try {
    const body: Record<string, unknown> = {
      merchant: params.merchant,
      amount: params.amount.toString(),
      signature,
    };
    if (params.mint !== undefined && params.mint !== "") body.mint = params.mint;
    if (params.memo !== undefined && params.memo !== "") body.memo = params.memo;
    const res = await fetch("/api/payments/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    recorded = res.ok;
  } catch {
    recorded = false; // backend unreachable — the on-chain payment still stands
  }
  return { signature, message, recorded };
}

/**
 * Notify the opener (widget popup flow) that the one-time payment landed.
 * Same discipline as pay-checkout.ts: the target origin is the SSR-validated
 * ?host= value only — never "*". No-op without a well-formed host param, so
 * standalone /pay?mode=pay links simply skip the notification.
 */
export function notifyOpenerPaid(signature: string): void {
  try {
    if (typeof window === "undefined" || window.opener === null) return;
    const host = new URLSearchParams(window.location.search).get("host");
    if (host === null || host === "" || /[/@\s]/.test(host)) return;
    window.opener.postMessage({ type: "solhack:paid", signature }, `https://${host}`);
  } catch {
    /* opener gone */
  }
}

/** Localized payment-status text with inline-EN fallback ({param} filled).
 *  Used by /pay?mode=pay with the pay1.status* keys from i18n-port4. */
export function payStatusText(key: string, fallbackEn: string, params?: Record<string, string>): string {
  const template = tOr(key, fallbackEn);
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
