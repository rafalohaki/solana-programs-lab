use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::errors::SubscriptionError;
use crate::events::PlanCreated;
use crate::state::SubscriptionPlan;

/// Create a recurring-payment plan (merchant-owned PDA).
///
/// PDA seeds: `[b"plan", merchant_pubkey, plan_id_le8]` — `plan_id` is a
/// merchant-chosen namespace so one merchant can run many plans.
pub fn handle_create_plan(ctx: Context<CreatePlan>, plan_id: u64, amount: u64, period_seconds: i64) -> Result<()> {
    // MVP floor keeps LiteSVM/devnet tests fast (e.g. 30s periods).
    // Mainnet deployments SHOULD raise this (e.g. >= 1 day) to bound
    // charge frequency and rent/fee griefing.
    require!(amount > 0, SubscriptionError::InvalidAmount);
    require!(period_seconds >= 30, SubscriptionError::PeriodTooShort);

    let plan = &mut ctx.accounts.plan;
    plan.merchant = ctx.accounts.merchant.key();
    plan.mint = ctx.accounts.mint.key();
    plan.amount = amount;
    plan.period_seconds = period_seconds;
    plan.plan_id = plan_id;
    plan.bump = ctx.bumps.plan;

    emit!(PlanCreated {
        plan: plan.key(),
        merchant: plan.merchant,
        mint: plan.mint,
        amount,
        period_seconds,
        plan_id,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(plan_id: u64)]
pub struct CreatePlan<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,

    #[account(
        init,
        payer = merchant,
        space = 8 + SubscriptionPlan::INIT_SPACE,
        seeds = [b"plan", merchant.key().as_ref(), &plan_id.to_le_bytes()],
        bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,

    /// Any SPL mint; plan prices in this mint's smallest units.
    pub mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}
