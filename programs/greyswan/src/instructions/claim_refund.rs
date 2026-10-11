use anchor_lang::prelude::*;
use crate::constants::AUTO_REFUND_TIMEOUT_SECONDS;
use crate::state::{HandoverPhase, Listing, Rental, RentalStatus};

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        constraint = listing.key() == rental.listing @ crate::error::ErrorCode::ListingMismatch,
    )]
    pub rental: Account<'info, Rental>,

    #[account(mut)]
    pub renter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotRenter,
    );

    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );

    // The refund covers one case only: the owner never shipped. Once phase 1
    // is in, the item is (or should be) with the renter, whose remedy is
    // reject_on_arrival, which sends it to admin review instead of paying
    // the renter out unilaterally.
    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::None,
        crate::error::ErrorCode::OwnerAlreadyShipped,
    );

    let now = Clock::get()?.unix_timestamp;
    let elapsed = now - ctx.accounts.rental.created_at;

    require!(
        elapsed >= AUTO_REFUND_TIMEOUT_SECONDS,
        crate::error::ErrorCode::TimeoutNotElapsed,
    );

    let refund_total = ctx
        .accounts
        .rental
        .total_rental_cost
        .checked_add(ctx.accounts.rental.deposit_amount)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let rental_info = ctx.accounts.rental.to_account_info();
    let renter_info = ctx.accounts.renter.to_account_info();

    **rental_info.try_borrow_mut_lamports()? -= refund_total;
    **renter_info.try_borrow_mut_lamports()? += refund_total;

    ctx.accounts.rental.status = RentalStatus::RefundedAuto;
    ctx.accounts.listing.is_available = true;

    Ok(())
}