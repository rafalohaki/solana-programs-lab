use anchor_lang::prelude::*;

use crate::errors::SubscriptionError;
use crate::events::InvoiceVoided;
use crate::state::{Invoice, InvoiceStatus};

/// Void an unpaid invoice (merchant-only). Paid invoices are immutable —
/// the paid record + `memo_hash` stays a permanent verifiable receipt.
pub fn handle_void_invoice(ctx: Context<VoidInvoice>) -> Result<()> {
    require!(
        ctx.accounts.invoice.status == InvoiceStatus::Unpaid,
        SubscriptionError::AlreadyPaid
    );

    ctx.accounts.invoice.status = InvoiceStatus::Voided;

    emit!(InvoiceVoided {
        invoice: ctx.accounts.invoice.key(),
        subscription: ctx.accounts.invoice.subscription,
        merchant: ctx.accounts.invoice.merchant,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct VoidInvoice<'info> {
    #[account(
        constraint = merchant.key() == invoice.merchant @ SubscriptionError::Unauthorized,
    )]
    pub merchant: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"invoice",
            invoice.subscription.as_ref(),
            &invoice.invoice_id.to_le_bytes()
        ],
        bump = invoice.bump,
    )]
    pub invoice: Account<'info, Invoice>,
}
