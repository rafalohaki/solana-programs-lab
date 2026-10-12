// ---------------------------------------------------------------------------
// Pyth Hermes USD estimates for plan prices. REST, no key:
// https://hermes.pyth.network/v2/updates/price/latest — the response carries
// `parsed[0].price.{price, expo}` (price is an integer string, value =
// price * 10^expo), so no extra metadata call is needed.
//
// Mint → feed map (devnet-only, from repo config — never invented):
// - devnet USDC: stablecoin, exactly 1 USD — returned WITHOUT any fetch.
// - wSOL: SOL/USD feed ef0d8b6f…2c5ab (live fetch, 60 s in-memory cache).
// - anything else: null (no price source — never a fake number).
// Any fetch/parse failure is null as well: the card simply shows no estimate.
// ---------------------------------------------------------------------------

import { DEVNET_USDC_MINT } from "./mints.js";

/** Wrapped SOL mint — the only "SOL" symbol claimed truthfully (cf. PlanCard). */
const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** Pyth SOL/USD price feed id. */
export const SOL_USD_FEED_ID = "ef0d8b6fda2ce5efd6d5b2b567e63759479b0a1c136a6e003d8656c32a2c5ab";

const HERMES_LATEST = "https://hermes.pyth.network/v2/updates/price/latest";
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  usdPerToken: number;
  fetchedAt: number;
}

const cache: Record<string, CacheEntry | undefined> = {};
const inflight: Record<string, Promise<number | null> | undefined> = {};

/** Live USD price of one token for a feed id (cached 60 s, shared in-flight). */
async function fetchUsdPerToken(feedId: string): Promise<number | null> {
  const hit = cache[feedId];
  if (hit !== undefined && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.usdPerToken;
  const ongoing = inflight[feedId];
  if (ongoing !== undefined) return ongoing;
  const job = (async (): Promise<number | null> => {
    try {
      const res = await fetch(`${HERMES_LATEST}?ids[]=${feedId}`);
      if (!res.ok) return null;
      const json = (await res.json()) as {
        parsed?: Array<{ price?: { price?: string | number; expo?: string | number } }>;
      };
      const raw = json?.parsed?.[0]?.price;
      const price = Number(raw?.price);
      const expo = Number(raw?.expo);
      if (!Number.isFinite(price) || !Number.isFinite(expo)) return null;
      const usd = price * 10 ** expo;
      if (!Number.isFinite(usd) || usd <= 0) return null;
      cache[feedId] = { usdPerToken: usd, fetchedAt: Date.now() };
      return usd;
    } catch {
      return null;
    } finally {
      delete inflight[feedId];
    }
  })();
  inflight[feedId] = job;
  return job;
}

/**
 * USD estimate for `uiAmount` of `mintB58`. USDC is exactly 1 (no fetch);
 * wSOL uses the live SOL/USD feed; unknown mints and any error are null —
 * the caller renders nothing instead of a made-up number.
 */
export async function usdEstimate(mintB58: string, uiAmount: number): Promise<number | null> {
  if (typeof uiAmount !== "number" || !Number.isFinite(uiAmount) || uiAmount <= 0) return null;
  if (mintB58 === DEVNET_USDC_MINT) return uiAmount;
  if (mintB58 === WSOL_MINT) {
    const usd = await fetchUsdPerToken(SOL_USD_FEED_ID);
    return usd === null ? null : usd * uiAmount;
  }
  return null;
}

/**
 * `$X` display for an estimate: 2 decimals down to a cent, `< $0.01` for dust
 * (no fake precision on sub-cent values).
 */
export function formatUsd(value: number): string {
  if (value < 0.01) return "< $0.01";
  if (value < 1000) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
