use anchor_lang::prelude::*;

/// Recurring-billing plan owned by a merchant.
///
/// PDA seeds: `[b"plan", merchant_pubkey, plan_id.to_le_bytes()]`
/// (`plan_id` is a merchant-chosen namespace so one merchant can run many plans).
#[account]
#[derive(InitSpace)]
pub struct SubscriptionPlan {
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub period_seconds: i64,
    pub plan_id: u64,
    pub bump: u8,
}

/// Active subscription of one subscriber to one plan.
///
/// PDA seeds: `[b"sub", plan_pubkey, subscriber_pubkey]`.
/// This PDA is the SPL delegate on the subscriber's ATA (Model B):
/// the user `approve()`s this PDA off-chain, and `charge()` CPIs
/// `transfer_checked` with this PDA as signer.
#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    /// Unix timestamp of the last successful charge. Zero = never charged,
    /// so the first `charge()` is due immediately.
    pub last_paid_at: i64,
    pub status: SubscriptionStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum SubscriptionStatus {
    Active,
    Cancelled,
}

/// Verifiable recurring-billing invoice bound to one subscription.
///
/// PDA seeds: `[b"invoice", subscription_pubkey, invoice_id.to_le_bytes()]`.
/// `amount` is snapshotted from the plan at creation (must equal
/// `plan.amount` — variable pricing stays a non-goal). `memo_hash` is a
/// sha256 over the off-chain invoice metadata (buyer, BoL, line items,
/// dates); the bytes live off-chain (or in the Blink URL), the hash makes
/// the on-chain record a verifiable receipt once paid.
#[account]
#[derive(InitSpace)]
pub struct Invoice {
    pub plan: Pubkey,
    pub subscription: Pubkey,
    pub merchant: Pubkey,
    pub subscriber: Pubkey,
    pub invoice_id: u64,
    pub amount: u64,
    pub memo_hash: [u8; 32],
    /// Unix timestamp of the successful charge. Zero = unpaid.
    pub paid_at: i64,
    pub status: InvoiceStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum InvoiceStatus {
    Unpaid,
    Paid,
    Voided,
}
