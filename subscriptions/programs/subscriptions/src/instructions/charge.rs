use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::SubscriptionError;
use crate::events::Charged;
use crate::fees::fee_for;
use crate::state::{Subscription, SubscriptionPlan, SubscriptionStatus};

/// Charge one billing period (merchant-initiated, Model B).
///
/// The subscriber pre-approved this Subscription PDA as SPL delegate on
/// their ATA off-chain (`approve(subscription_pda, amount)`). This handler
/// CPIs `transfer_checked` with the Subscription PDA as signer, so the
/// subscriber never needs to sign a charge.
///
/// Preconditions: subscription is `Active`, the caller is the plan's
/// merchant, `now - last_paid_at >= period`, and the subscriber ATA still
/// delegates at least `plan.amount` to this PDA. Post: `last_paid_at = now`.
pub fn handle_charge(ctx: Context<Charge>) -> Result<()> {
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::NotActive,
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
    // Collection fee: floored, min 0. `fee < amount` always holds
    // (FEE_BPS < FEE_DENOMINATOR), so the merchant leg is never zero and
    // `merchant_share + fee == amount` — the pre-approved allowance covering
    // `amount` covers the split exactly.
    let fee = fee_for(amount);
    let merchant_share = amount - fee;
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
    token::transfer_checked(cpi_ctx, merchant_share, decimals)?;

    // Dust path: fee rounds to 0, skip the second CPI entirely.
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

    ctx.accounts.subscription.last_paid_at = now;

    emit!(Charged {
        subscription: ctx.accounts.subscription.key(),
        plan: plan_key,
        subscriber: subscriber_key,
        amount,
        fee,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Charge<'info> {
    /// Plan merchant; only the merchant can pull a charge.
    #[account(
        mut,
        constraint = merchant.key() == plan.merchant @ SubscriptionError::Unauthorized,
    )]
    pub merchant: Signer<'info>,

    /// Genuine plan PDA (seed check binds it to its merchant + plan_id).
    #[account(
        seeds = [b"plan", plan.merchant.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    /// Genuine subscription PDA for (plan, subscriber); the SPL delegate.
    #[account(
        mut,
        has_one = plan @ SubscriptionError::Unauthorized,
        seeds = [b"sub", plan.key().as_ref(), subscription.subscriber.as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// Plan mint (decimals source for `transfer_checked`).
    #[account(
        constraint = mint.key() == plan.mint @ SubscriptionError::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,

    /// Subscriber ATA: owner + mint bound, delegate must be this
    /// subscription PDA with allowance covering the charge.
    #[account(
        mut,
        constraint = subscriber_ata.owner == subscription.subscriber @ SubscriptionError::Unauthorized,
        constraint = subscriber_ata.mint == plan.mint @ SubscriptionError::InvalidMint,
        constraint = subscriber_ata.delegate == COption::Some(subscription.key()) @ SubscriptionError::Unauthorized,
        constraint = subscriber_ata.delegated_amount >= plan.amount @ SubscriptionError::Unauthorized,
    )]
    pub subscriber_ata: Account<'info, TokenAccount>,

    /// Merchant ATA (created on first charge, paid by the merchant).
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
