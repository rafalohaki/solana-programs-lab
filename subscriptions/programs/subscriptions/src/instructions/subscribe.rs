use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::SubscriptionError;
use crate::events::Subscribed;
use crate::state::{Subscription, SubscriptionPlan, SubscriptionStatus};

/// Subscribe to a plan. Creates the Subscription PDA that later acts as the
/// SPL delegate for recurring charges (Model B).
///
/// Model B delegation (off-chain, NOT a CPI here): after subscribing, the
/// subscriber signs an off-chain `approve(subscription_pda, amount)` on their
/// ATA (exact-amount or allowance). `charge()` then CPIs `transfer_checked`
/// with the Subscription PDA as signer. Keeping `approve` off-chain lets the
/// user cap/revoke allowance in their wallet without an extra program step.
///
/// Re-subscribe after cancel: this uses plain `init`, NOT `reinit`. A
/// cancelled subscription account persists, so re-subscribing to the same
/// (plan, subscriber) pair fails until the old account is closed (subscriber
/// closes via `close` or cancel-flow cleanup) — preserving the cancel audit
/// trail. `reinit` would silently resurrect the account and is deliberately
/// avoided.
pub fn handle_subscribe(ctx: Context<Subscribe>) -> Result<()> {
    let subscription = &mut ctx.accounts.subscription;
    subscription.plan = ctx.accounts.plan.key();
    subscription.subscriber = ctx.accounts.subscriber.key();
    // Zero = never charged, so the first `charge()` is due immediately
    // (`now >= 0 + period` always holds). Keeps tests simple with no
    // start-timestamp plumbing.
    subscription.last_paid_at = 0;
    subscription.status = SubscriptionStatus::Active;
    subscription.bump = ctx.bumps.subscription;

    emit!(Subscribed {
        subscription: subscription.key(),
        plan: subscription.plan,
        subscriber: subscription.subscriber,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Subscribe<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,

    /// Genuine plan PDA (seed check binds it to its merchant + plan_id).
    #[account(
        seeds = [b"plan", plan.merchant.as_ref(), &plan.plan_id.to_le_bytes()],
        bump = plan.bump,
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    #[account(
        init,
        payer = subscriber,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [b"sub", plan.key().as_ref(), subscriber.key().as_ref()],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    /// Subscriber-owned ATA denominated in the plan's mint. Owner/mint
    /// binding is enforced so charges cannot point at a wrong account.
    #[account(
        constraint = subscriber_ata.owner == subscriber.key() @ SubscriptionError::Unauthorized,
        constraint = subscriber_ata.mint == plan.mint @ SubscriptionError::InvalidMint,
    )]
    pub subscriber_ata: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}
