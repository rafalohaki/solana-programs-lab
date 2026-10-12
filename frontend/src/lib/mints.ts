// ---------------------------------------------------------------------------
// Known SPL mints: pick from a list instead of pasting addresses.
// `custom` is a sentinel — the form then shows a manual address field.
// ---------------------------------------------------------------------------

import { USDC_DEVNET_MINT } from "./chain.js";

export interface KnownMint {
  symbol: string;
  /** Base58 mint address, or the `CUSTOM_MINT` sentinel for manual input. */
  mint: string;
  decimals: number;
  cluster: string;
  label: string;
}

/** Sentinel select value meaning "let the user type a mint address". */
export const CUSTOM_MINT = "custom";

/**
 * VERIFIED devnet USDC (Circle): developers.circle.com/stablecoins/
 * usdc-contract-addresses lists 4zMMC…ncDU; cross-checked live on 2026-10-08
 * with getAccountInfo (owner Tokenkeg…VQ5DA, parsed mint, 6 decimals).
 * The previous stand-in address was an unverified lookalike — never present
 * an unverified token as "USDC".
 */
export const DEVNET_USDC_MINT = USDC_DEVNET_MINT;

export const KNOWN_MINTS: KnownMint[] = [
  {
    symbol: "USDC",
    mint: DEVNET_USDC_MINT,
    decimals: 6,
    cluster: "devnet",
    label: "USDC · devnet",
  },
  {
    symbol: "CUSTOM",
    mint: CUSTOM_MINT,
    decimals: 6,
    cluster: "devnet",
    // Never rendered: consumers substitute the mform.customMint/blinkb.customMint
    // i18n key for the sentinel — kept only to satisfy the KnownMint shape.
    label: "Custom…",
  },
];

/** Decimals from the list, or null when the mint is unknown / custom. */
export function decimalsFor(mint: string): number | null {
  const hit = KNOWN_MINTS.find((m) => m.mint === mint && m.mint !== CUSTOM_MINT);
  return hit?.decimals ?? null;
}

/**
 * Exact UI-units → raw-units conversion (no float math).
 * Returns null for non-numeric input, dust beyond `decimals`, or zero.
 */
export function parseUiAmountToRaw(input: string, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) return null;
  const text = input.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole = "0", frac = ""] = text.split(".") as [string, string?];
  if ((frac ?? "").length > decimals) return null;
  const padded = ((frac ?? "") + "0".repeat(decimals)).slice(0, decimals) || "0";
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded);
  return raw > 0n ? raw : null;
}
