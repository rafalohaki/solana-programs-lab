// ---------------------------------------------------------------------------
// Collection-fee math for the protocol fee badge + any island that quotes
// the fee. Mirrors `fee_for()` in
// subscriptions/programs/subscriptions/src/fees.rs — keep FEE_BPS in sync.
// Pure functions, no Svelte imports: safe to use from Astro pages too.
// ---------------------------------------------------------------------------

/** Collection fee in basis points (0.4% of every charge). */
export const FEE_BPS = 40;
/** Basis-point denominator. */
export const FEE_DENOMINATOR = 10_000;
/** Fee treasury: owner of the per-mint collection ATA (admin wallet). */
export const TREASURY_WALLET = "2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAWwfYbucP";

/**
 * Floor(amount * bps / 10_000), min 0. Dust amounts whose fee would be
 * fractional pay no fee; the merchant leg is always `amount - fee`.
 */
export function feeFor(amount: bigint | number, bps: number = FEE_BPS): bigint {
  const whole = typeof amount === "bigint" ? amount : BigInt(Math.max(0, Math.floor(amount)));
  if (whole <= 0n) return 0n;
  return (whole * BigInt(bps)) / BigInt(FEE_DENOMINATOR);
}

/**
 * Base-unit amount → UI string — THE canonical token-amount formatter for
 * the whole app (chain.ts re-exports this; do not fork a second one).
 * Rules: en-US thousands grouping, trailing fraction zeros trimmed, FULL
 * fraction precision (a silently truncated amount would misrepresent money).
 * `4000n` at 6 decimals → `"0.004"`; `1234567n` → `"1.234567"`.
 */
export function formatTokenAmount(amount: bigint | number, decimals: number): string {
  const raw = typeof amount === "bigint" ? amount : BigInt(Math.max(0, Math.floor(amount)));
  if (raw <= 0n) return "0";
  const d = Math.max(0, decimals);
  const base = 10n ** BigInt(d);
  const whole = (raw / base).toLocaleString("en-US");
  if (d === 0) return whole;
  const fracStr = (raw % base).toString().padStart(d, "0").replace(/0+$/, "");
  return fracStr === "" ? whole : `${whole}.${fracStr}`;
}

/** Language-neutral truncated treasury reference (`…ybucP`). */
export function shortTreasury(address: string = TREASURY_WALLET): string {
  return `…${address.slice(-5)}`;
}
