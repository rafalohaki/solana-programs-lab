use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::SubscriptionError;
use crate::events::InvoiceCharged;
use crate::fees::fee_for;
use crate::state::{Invoice, InvoiceStatus, Subscription, SubscriptionPlan, SubscriptionStatus};

/// Charge one invoice: same delegate gate as `charge()`, plus the invoice.
///
/// Merchant-only. Requires: subscription `Active`, invoice `Unpaid` and bound
/// to this subscription, `now >= last_paid_at + period` (one period per
/// charge — the invoice does not bypass the clock), and the subscriber ATA
/// still delegating `plan.amount` to the Subscription PDA. Post:
/// `transfer_checked(plan.amount)`, `invoice = Paid`, `paid_at = now`,
/// `subscription.last_paid_at = now`. The emitted event carries `memo_hash`,
/// so the paid invoice + off-chain metadata = verifiable receipt.
pub fn handle_charge_invoice(ctx: Context<ChargeInvoice>) -> Result<()> {
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::NotActive
    );
    require!(
        ctx.accounts.invoice.status == InvoiceStatus::Unpaid,
        SubscriptionError::AlreadyPaid
    );
    require!(
        ctx.accounts.invoice.subscription == ctx.accounts.subscription.key(),
        SubscriptionError::InvoiceMismatch
    );
    require!(
        ctx.accounts.invoice.amount == ctx.accounts.plan.amount,
        SubscriptionError::InvalidAmount
    );

    let now = ctx.accounts.clock.unix_timestamp;
    let elapsed = now
        .checked_sub(ctx.accounts.subscription.last_paid_at)
        .ok_or(SubscriptionError::TooEarlyToCharge)?;
    require!(
        elapsed >= ctx.accounts.plan.period_seconds,
        SubscriptionError::TooEarlyToCharge
    );

    let amount = ctx.accounts.plan.amount;
    let decimals = ctx.accounts.mint.decimals;
    let plan_key = ctx.accounts.plan.key();
    let subscriber_key = ctx.accounts.subscription.subscriber;
    let bump = ctx.accounts.subscription.bump;
    let seeds: &[&[u8]] = &[
        b"sub",
        plan_key.as_ref(),
        subscriber_key.as_ref(),
        &[bump],
    ];
    let signer_seeds = &[seeds];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.subscriber_ata.to_account_info(),
        to: ctx.accounts.merchant_ata.to_account_info(),
        authority: ctx.accounts.subscription.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    // Collection fee: same 40 bps split as `charge()`; legs sum to `amount`.
    let fee = fee_for(amount);
    token::transfer_checked(cpi_ctx, amount - fee, decimals)?;

    if fee > 0 {
        let fee_accounts = TransferChecked {
            from: ctx.accounts.subscriber_ata.to_account_info(),
            to: ctx.accounts.treasury_ata.to_account_info(),
            authority: ctx.accounts.subscription.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
        };
        let fee_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            fee_accounts,
            signer_seeds,
        );
        token::transfer_checked(fee_ctx, fee, decimals)?;
    }

    ctx.accounts.invoice.status = InvoiceStatus::Paid;
    ctx.accounts.invoice.paid_at = now;
    ctx.accounts.subscription.last_paid_at = now;

    emit!(InvoiceCharged {
        invoice: ctx.accounts.invoice.key(),
        subscription: ctx.accounts.subscription.key(),
        plan: ctx.accounts.plan.key(),
        subscriber: ctx.accounts.subscription.subscriber,
        merchant: ctx.accounts.plan.merchant,
        amount,
        memo_hash: ctx.accounts.invoice.memo_hash,
        paid_at: now,
        fee,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ChargeInvoice<'info> {
    #[account(
        mut,
        constraint = merchant.key() == plan.merchant @ SubscriptionError::Unauthorized,
    )]
    pub merchant: Signer<'info>,

    #[account(
        seeds = [b"plan", plan.merchant.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(
        mut,
        has_one = plan @ SubscriptionError::Unauthorized,
        seeds = [b"sub", plan.key().as_ref(), subscription.subscriber.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(
        mut,
        seeds = [
            b"invoice",
            subscription.key().as_ref(),
            &invoice.invoice_id.to_le_bytes()
        ],
        bump = invoice.bump,
    )]
    pub invoice: Account<'info, Invoice>,

    #[account(
        constraint = mint.key() == plan.mint @ SubscriptionError::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = subscriber_ata.owner == subscription.subscriber @ SubscriptionError::Unauthorized,
        constraint = subscriber_ata.mint == plan.mint @ SubscriptionError::InvalidMint,
        constraint = subscriber_ata.delegate == COption::Some(subscription.key()) @ SubscriptionError::Unauthorized,
        constraint = subscriber_ata.delegated_amount >= plan.amount @ SubscriptionError::Unauthorized,
    )]
    pub subscriber_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = merchant,
        associated_token::mint = mint,
        associated_token::authority = merchant,
    )]
    pub merchant_ata: Account<'info, TokenAccount>,

    /// Collection-fee treasury wallet: key pinned to the hardcoded admin.
    /// Read-only anchor for the ATA derivation below — no funds move here.
    #[account(address = crate::fees::TREASURY_WALLET @ SubscriptionError::Unauthorized)]
    pub treasury: SystemAccount<'info>,

    /// Collection-fee treasury ATA (owner = treasury above, per mint).
    /// Double-bound: treasury key + ATA derivation. Only the true treasury
    /// ATA passes. Created on the first fee-bearing charge, paid by merchant.
    #[account(
        init_if_needed,
        payer = merchant,
        associated_token::mint = mint,
        associated_token::authority = treasury,
    )]
    pub treasury_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}
