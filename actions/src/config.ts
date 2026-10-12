import { PublicKey } from "@solana/web3.js";

/**
 * Deployed program ID (testnet, slot 449647765).
 *
 * Must match [programs.testnet] in subscriptions/Anchor.toml and
 * declare_id! in subscriptions/programs/subscriptions/src/lib.rs
 * (`solana program show 2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw --url testnet`).
 * Every handler below takes programId as an optional override so
 * Blinks can be re-pointed without a code change.
 */
export const SUBSCRIPTIONS_PROGRAM_ID = new PublicKey(
  "2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw",
);

/** Default RPC cluster for Blinks. Override per-request via `?cluster=`. */
export const DEFAULT_CLUSTER = "devnet" as const;
export type ClusterSlug = "devnet" | "testnet" | "mainnet-beta";

const RPC_ENV: Record<ClusterSlug, string | undefined> = {
  // Set these in the hosting environment (e.g. Vercel env vars).
  devnet: process.env.SOLANA_DEVNET_RPC,
  testnet: process.env.SOLANA_TESTNET_RPC,
  "mainnet-beta": process.env.SOLANA_MAINNET_RPC,
};

const PUBLIC_FALLBACK: Record<ClusterSlug, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function rpcEndpointFor(cluster: string | null): string {
  const slug = (cluster ?? DEFAULT_CLUSTER) as ClusterSlug;
  return RPC_ENV[slug] ?? PUBLIC_FALLBACK[slug] ?? PUBLIC_FALLBACK.devnet;
}

/**
 * Solana CAIP chain ids used by actions.json / wallets to confirm the
 * network. Devnet and mainnet have fixed genesis hashes:
 * - devnet:  solana:devnet     (EtW6BP...v6p)
 * - testnet: solana:testnet    (4uhcV...Wzm)
 * - mainnet: solana:mainnet    (5eykt4...XA9)
 * See README snippet for the devnet-vs-mainnet note.
 */
export function chainIdFor(cluster: string | null): string {
  switch (cluster ?? DEFAULT_CLUSTER) {
    case "mainnet-beta":
      return "solana:mainnet";
    case "testnet":
      return "solana:testnet";
    default:
      return "solana:devnet";
  }
}

/** Shared Blink icon — swap for a hosted absolute HTTPS URL in production. */
export const DEFAULT_ICON =
  "https://raw.githubusercontent.com/solana-developers/opos-asset/main/assets/OpOS-Solana-Logo.png";

/**
 * Public origin for absolute links returned to wallets (href / icon URLs).
 *
 * WHY THIS EXISTS: the backend is reached through the frontend's `/api/*`
 * proxy (frontend/src/pages/api/[...path].ts), which fetches
 * `${BACKEND_URL}/api...`. So at the backend, `new URL(req.url).origin` is the
 * Docker-internal service name — `http://backend:3001` — not the origin the
 * wallet actually called. A wallet that follows an href built from that origin
 * would try to resolve `backend:3001` on the public internet and fail, so the
 * multi-step Blink flow would break *after* a first response that looks
 * perfectly correct.
 *
 * `PUBLIC_SITE_URL` is therefore preferred. The request-derived origin is used
 * ONLY as a fallback when the variable is unset (local dev, direct-to-backend
 * calls, tests), which also avoids hardcoding a production domain in source.
 *
 * Setting this variable has a second benefit: it removes a Host-header
 * dependence. Deriving absolute links from the request origin lets a spoofed
 * Host influence URLs we hand back; an explicit public origin cannot be
 * influenced by the caller.
 */
export function publicOrigin(requestUrl: URL): string {
  const configured = process.env.PUBLIC_SITE_URL?.trim();
  if (configured !== undefined && configured.length > 0) {
    // Tolerate a trailing slash (or several) so `${origin}${pathname}` never
    // produces a doubled slash.
    return configured.replace(/\/+$/, "");
  }
  return requestUrl.origin;
}

