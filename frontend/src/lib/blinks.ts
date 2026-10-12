// ---------------------------------------------------------------------------
// Blink URL builders. A Blink is `solana-action:<https url>` consumed directly
// by wallets (Phantom, Solflare) — no gateway involved. The Actions GET/POST
// endpoints this module points at serve the Blink-compatible JSON metadata
// (GET) and the signed transaction (POST) from our own backend.
//
// History: this module used to expose dialToUrl(), a builder for dial.to
// gateway preview links. The gateway dependency was removed — wallets parse
// `solana-action:` natively, so the primary shareable URL is always
// blinkUrl(endpoint).
// ---------------------------------------------------------------------------
import { readEnv } from "./chain.js";

export const SITE_URL = readEnv("PUBLIC_SITE_URL", "http://localhost:4321").replace(/\/$/, "");

export type ActionKind = "plan" | "subscribe" | "cancel" | "charge" | "invoice" | "batch" | "report";

export function actionUrl(kind: ActionKind, params: Record<string, string>): string {
  const qs = new URLSearchParams({
    cluster: readEnv("PUBLIC_SOLANA_CLUSTER", "devnet"),
    ...params,
  });
  return `${SITE_URL}/api/actions/${kind}?${qs.toString()}`;
}

/**
 * Explicit self-hosted Blink URL — the primary shareable form. Wallets consume
 * `solana-action:` URLs directly, so this works without registry approval and
 * without any third-party gateway.
 */
export function blinkUrl(actionEndpoint: string): string {
  return `solana-action:${actionEndpoint}`;
}

export function subscribeActionUrl(plan: string, mint: string, amount: string): string {
  return actionUrl("subscribe", {
    plan,
    mint,
    amount,
    programId: readEnv("PUBLIC_SUBSCRIPTIONS_PROGRAM_ID", "SubScribe1111111111111111111111111111111111"),
  });
}

export function invoiceActionUrl(params: {
  plan: string;
  subscription: string;
  invoiceId: string;
  memo: string;
}): string {
  return actionUrl("invoice", {
    ...params,
    programId: readEnv("PUBLIC_SUBSCRIPTIONS_PROGRAM_ID", "SubScribe1111111111111111111111111111111111"),
  });
}

export function batchActionUrl(): string {
  return actionUrl("batch", {
    programId: readEnv("PUBLIC_SUBSCRIPTIONS_PROGRAM_ID", "SubScribe1111111111111111111111111111111111"),
  });
}

export function reportActionUrl(invoice: string): string {
  return actionUrl("report", {
    invoice,
    programId: readEnv("PUBLIC_SUBSCRIPTIONS_PROGRAM_ID", "SubScribe1111111111111111111111111111111111"),
  });
}
