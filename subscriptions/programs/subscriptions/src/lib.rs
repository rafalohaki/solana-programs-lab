use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod fees;
pub mod instructions;
pub mod state;

// Anchor 0.31 #[program] codegen emits `pub use crate::__client_accounts_*`
// at the crate root (anchor_syn segments[0] rule), so the derive-generated
// modules and the Accounts structs must be reachable from the root.
pub use instructions::*;

// Testnet program ID (target/deploy/subscriptions-testnet.json).
// Must match the `subscriptions` entry under [programs.testnet] in Anchor.toml.
// Localnet/devnet still use the Fg6Pa placeholder until their own deploys.
declare_id!("2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw");

#[program]
pub mod subscriptions {
    use super::*;

    /// Create a recurring-payment plan (merchant-owned PDA).
    ///
    /// PDA seeds: `[b"plan", merchant_pubkey, plan_id.to_le_bytes()]`.
    pub fn create_plan(
        ctx: Context<CreatePlan>,
        plan_id: u64,
        amount: u64,
        period_seconds: i64,
    ) -> Result<()> {
        instructions::create_plan::handle_create_plan(ctx, plan_id, amount, period_seconds)
    }

    /// Subscribe to a plan. Creates the Subscription PDA that later acts as
    /// the SPL delegate for recurring charges (Model B: user `approve()`s the
    /// Subscription PDA off-chain; `charge()` CPIs `transfer_checked` with
    /// the PDA as signer).
    ///
    /// PDA seeds: `[b"sub", plan_pubkey, subscriber_pubkey]`.
    pub fn subscribe(ctx: Context<Subscribe>) -> Result<()> {
        instructions::subscribe::handle_subscribe(ctx)
    }

    /// Charge one billing period via delegate-signed `transfer_checked`.
    ///
    /// Requires status `Active` and `now >= last_paid_at + period`.
    pub fn charge(ctx: Context<Charge>) -> Result<()> {
        instructions::charge::handle_charge(ctx)
    }

    /// Create a verifiable invoice for one subscription period.
    ///
    /// PDA seeds: `[b"invoice", subscription_pubkey, invoice_id.to_le_bytes()]`.
    /// `memo_hash` = sha256 over the off-chain invoice metadata.
    pub fn create_invoice(
        ctx: Context<CreateInvoice>,
        invoice_id: u64,
        memo_hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_invoice::handle_create_invoice(ctx, invoice_id, memo_hash)
    }

    /// Charge one invoice via the subscription-PDA delegate.
    ///
    /// Same clock + allowance gates as `charge()`, plus invoice binding.
    /// Emits `InvoiceCharged` (receipt) and advances `last_paid_at`.
    pub fn charge_invoice(ctx: Context<ChargeInvoice>) -> Result<()> {
        instructions::charge_invoice::handle_charge_invoice(ctx)
    }

    /// Void an unpaid invoice (merchant only). Paid invoices are final.
    pub fn void_invoice(ctx: Context<VoidInvoice>) -> Result<()> {
        instructions::void_invoice::handle_void_invoice(ctx)
    }

    /// Cancel a subscription (subscriber only). Sets status `Cancelled`;
    /// the subscriber revokes the SPL delegate off-chain, and the program
    /// also revokes via CPI where allowance remains.
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        instructions::cancel::handle_cancel(ctx)
    }
}
