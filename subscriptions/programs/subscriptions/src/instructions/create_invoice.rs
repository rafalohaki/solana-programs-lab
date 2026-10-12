use anchor_lang::prelude::*;

use crate::errors::SubscriptionError;
use crate::events::InvoiceCreated;
use crate::state::{Invoice, InvoiceStatus, Subscription, SubscriptionPlan, SubscriptionStatus};

/// Create a verifiable invoice for one billing period of a subscription.
///
/// Merchant-only. The subscription must be `Active`. `amount` is snapshotted
/// from the plan (variable pricing stays a non-goal). `memo_hash` is a
/// sha256 over the off-chain invoice metadata (buyer, BoL / line items,
/// dates) — the bytes live off-chain, the hash makes the paid record a
/// verifiable receipt.
///
/// PDA seeds: `[b"invoice", subscription_pubkey, invoice_id.to_le_bytes()]`.
pub fn handle_create_invoice(
    ctx: Context<CreateInvoice>,
    invoice_id: u64,
    memo_hash: [u8; 32],
) -> Result<()> {
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::NotActive
    );

    let invoice = &mut ctx.accounts.invoice;
    invoice.plan = ctx.accounts.plan.key();
    invoice.subscription = ctx.accounts.subscription.key();
    invoice.merchant = ctx.accounts.merchant.key();
    invoice.subscriber = ctx.accounts.subscription.subscriber;
    invoice.invoice_id = invoice_id;
    invoice.amount = ctx.accounts.plan.amount;
    invoice.memo_hash = memo_hash;
    invoice.paid_at = 0;
    invoice.status = InvoiceStatus::Unpaid;
    invoice.bump = ctx.bumps.invoice;

    emit!(InvoiceCreated {
        invoice: invoice.key(),
        plan: invoice.plan,
        subscription: invoice.subscription,
        merchant: invoice.merchant,
        subscriber: invoice.subscriber,
        invoice_id,
        amount: invoice.amount,
        memo_hash,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(invoice_id: u64)]
pub struct CreateInvoice<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,

    #[account(
        seeds = [b"plan", plan.merchant.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(
        has_one = plan @ SubscriptionError::Unauthorized,
        seeds = [b"sub", plan.key().as_ref(), subscription.subscriber.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        init,
        payer = merchant,
        space = 8 + Invoice::INIT_SPACE,
        seeds = [b"invoice", subscription.key().as_ref(), &invoice_id.to_le_bytes()],
        bump
    )]
    pub invoice: Account<'info, Invoice>,

    pub system_program: Program<'info, System>,
}
