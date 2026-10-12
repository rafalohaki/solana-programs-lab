use anchor_lang::prelude::*;

#[event]
pub struct PlanCreated {
    pub plan: Pubkey,
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub period_seconds: i64,
    pub plan_id: u64,
}

#[event]
pub struct Subscribed {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
}

#[event]
pub struct Charged {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

#[event]
pub struct Cancelled {
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
}

#[event]
pub struct InvoiceCreated {
    pub invoice: Pubkey,
    pub plan: Pubkey,
    pub subscription: Pubkey,
    pub merchant: Pubkey,
    pub subscriber: Pubkey,
    pub invoice_id: u64,
    pub amount: u64,
    pub memo_hash: [u8; 32],
}

#[event]
pub struct InvoiceCharged {
    pub invoice: Pubkey,
    pub subscription: Pubkey,
    pub plan: Pubkey,
    pub subscriber: Pubkey,
    pub merchant: Pubkey,
    pub amount: u64,
    pub memo_hash: [u8; 32],
    pub paid_at: i64,
    pub fee: u64,
}

#[event]
pub struct InvoiceVoided {
    pub invoice: Pubkey,
    pub subscription: Pubkey,
    pub merchant: Pubkey,
}
