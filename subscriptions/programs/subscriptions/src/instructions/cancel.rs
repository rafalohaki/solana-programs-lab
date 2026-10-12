use anchor_lang::prelude::*;
use anchor_spl::token::{self, Revoke, Token, TokenAccount};

use crate::errors::SubscriptionError;
use crate::events::Cancelled;
use crate::state::{Subscription, SubscriptionStatus};

/// Cancel a subscription (subscriber only).
///
/// Sets status `Cancelled` so `charge()` rejects afterwards, and revokes
/// the SPL delegate on the subscriber ATA via CPI (the subscriber signs,
/// so the revoke is authorized). The revoke is best-effort: the ATA is an
/// optional account and a failed/needless revoke never bricks cancellation,
/// so the user can always exit even if they already revoked or closed the
/// ATA off-chain. A second cancel errors `AlreadyCancelled`.
pub fn handle_cancel(ctx: Context<Cancel>) -> Result<()> {
    require!(
        ctx.accounts.subscription.status == SubscriptionStatus::Active,
        SubscriptionError::AlreadyCancelled,
    );

    // Best-effort delegate revoke: only attempt when the ATA was passed,
    // is owned by the subscriber, and still carries a delegate.
    if let Some(ata) = &ctx.accounts.subscriber_ata {
        if ata.owner == ctx.accounts.subscriber.key() && ata.delegate.is_some() {
            let cpi_accounts = Revoke {
                source: ata.to_account_info(),
                authority: ctx.accounts.subscriber.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
            );
            // Best-effort: an off-chain revoke racing this tx (or a stale
            // allowance) must not brick cancellation.
            if token::revoke(cpi_ctx).is_err() {
                msg!("Subscription: delegate revoke skipped (already cleared)");
            }
        }
    }

    ctx.accounts.subscription.status = SubscriptionStatus::Cancelled;

    emit!(Cancelled {
        subscription: ctx.accounts.subscription.key(),
        plan: ctx.accounts.subscription.plan,
        subscriber: ctx.accounts.subscription.subscriber,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    /// Only the subscriber can cancel their own subscription.
    #[account(
        constraint = subscriber.key() == subscription.subscriber @ SubscriptionError::Unauthorized,
    )]
    pub subscriber: Signer<'info>,

    /// Genuine subscription PDA for (plan, subscriber).
    #[account(
        mut,
        seeds = [b"sub", subscription.plan.as_ref(), subscriber.key().as_ref()],
        bump = subscription.bump,
    )]
    pub subscription: Account<'info, Subscription>,

    /// Subscriber ATA carrying the delegate. Optional so cancel
    /// never bricks if the ATA was closed or rotated; the handler revokes
    /// only when the owner matches and a delegate is still set.
    // Optional (Option<>) so cancel never bricks if the ATA was closed.
    pub subscriber_ata: Option<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
