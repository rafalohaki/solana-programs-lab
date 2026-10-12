/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUBSCRIPTIONS_PROGRAM_ID: string;
  readonly PUBLIC_SOLANA_RPC: string;
  readonly PUBLIC_SOLANA_CLUSTER: string;
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by public/widget.js (see widget/README.md). */
interface SolhackPayApi {
  subscribe(options: { plan: string; cluster?: string }): Promise<string>;
  CHECKOUT_ORIGIN: string;
}

interface Window {
  SolhackPay: SolhackPayApi;
}
