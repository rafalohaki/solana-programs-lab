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
