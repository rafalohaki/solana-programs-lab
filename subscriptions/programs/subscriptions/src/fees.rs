use anchor_lang::prelude::*;

/// Collection fee in basis points: 40 bps = 0.4% of every charge.
///
/// Rationale (see DESIGN.md §11): 0.1% floors to zero on small amounts
/// (`amount < 1000` base units pays nothing), so the fee would be
/// unenforceable exactly where micro-subscriptions live. 0.4% sits an order
/// of magnitude below card rails (Stripe ~2.9% + 30¢) while staying measurable
/// per charge and across batch settlement.
pub const FEE_BPS: u64 = 40;
/// Basis-point denominator (`FEE_BPS / FEE_DENOMINATOR` of `amount`).
pub const FEE_DENOMINATOR: u64 = 10_000;

/// Fee treasury: owner of the per-mint collection ATA (`treasury_ata`).
/// Hardcoded admin wallet — no account input, so callers cannot redirect it.
pub const TREASURY_WALLET: Pubkey = pubkey!("2p1sPBmViJjKhUM1aKCsd25nayKeXRJnpmJAWwfYbucP");

/// Floor(`amount * FEE_BPS / FEE_DENOMINATOR`). u128 math, so no overflow for
/// any u64 `amount`; rounds down with a minimum of 0 (dust pays no fee).
/// Invariant: `fee_for(a) < a` for every `a >= 1`, hence
/// `merchant_share = a - fee >= 1` — the merchant leg is never zero.
pub fn fee_for(amount: u64) -> u64 {
    ((amount as u128 * FEE_BPS as u128) / FEE_DENOMINATOR as u128) as u64
}
