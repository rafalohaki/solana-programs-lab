use anchor_lang::prelude::*;

#[error_code]
pub enum SubscriptionError {
    #[msg("Billing period too short")]
    PeriodTooShort,
    #[msg("Too early to charge")]
    TooEarlyToCharge,
    #[msg("Subscription already cancelled")]
    AlreadyCancelled,
    #[msg("Subscription not active")]
    NotActive,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invoice already settled")]
    AlreadyPaid,
    #[msg("Invoice does not belong to this subscription")]
    InvoiceMismatch,
}
