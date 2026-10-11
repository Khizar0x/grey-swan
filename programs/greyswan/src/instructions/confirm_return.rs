use anchor_lang::prelude::*;
use crate::constants::{PLATFORM_FEE_PERCENT, PLATFORM_WALLET, TIMELINE_SEED};
use crate::state::{HandoverPhase, Listing, Rental, RentalStatus, RentalTimeline};

#[derive(Accounts)]
pub struct ConfirmReturn<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        constraint = listing.key() == rental.listing @ crate::error::ErrorCode::ListingMismatch,
    )]
    pub rental: Account<'info, Rental>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: verified against rental.renter in the handler
    #[account(mut)]
    pub renter: UncheckedAccount<'info>,

    /// CHECK: verified against the hardcoded PLATFORM_WALLET constant
    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_confirm_return(ctx: Context<ConfirmReturn>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotListingOwner,
    );

    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotListingOwner,
    );

    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );

    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::OnReturn,
        crate::error::ErrorCode::HandoverIncomplete,
    );

    let accounts = ctx.accounts;
    settle_completed_rental(
        &mut accounts.rental,
        &mut accounts.listing,
        &accounts.owner.to_account_info(),
        &accounts.renter.to_account_info(),
        &accounts.platform_wallet.to_account_info(),
    )
}

/// The normal end of a rental, shared by confirm_return and
/// complete_after_inspection_deadline so both pay out identically: the
/// rental fee to the owner minus the platform fee, the platform fee to the
/// platform wallet, the deposit back to the renter. Callers check that
/// owner, renter and platform_wallet are the right accounts.
pub(crate) fn settle_completed_rental<'info>(
    rental: &mut Account<'info, Rental>,
    listing: &mut Account<'info, Listing>,
    owner: &AccountInfo<'info>,
    renter: &AccountInfo<'info>,
    platform_wallet: &AccountInfo<'info>,
) -> Result<()> {
    let total_rental_cost = rental.total_rental_cost;
    let deposit_amount = rental.deposit_amount;

    let platform_fee = total_rental_cost
        .checked_mul(PLATFORM_FEE_PERCENT)
        .ok_or(crate::error::ErrorCode::MathOverflow)?
        / 100;

    let owner_payout = total_rental_cost
        .checked_sub(platform_fee)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let rental_info = rental.to_account_info();

    **rental_info.try_borrow_mut_lamports()? -= owner_payout;
    **owner.try_borrow_mut_lamports()? += owner_payout;

    **rental_info.try_borrow_mut_lamports()? -= platform_fee;
    **platform_wallet.try_borrow_mut_lamports()? += platform_fee;

    **rental_info.try_borrow_mut_lamports()? -= deposit_amount;
    **renter.try_borrow_mut_lamports()? += deposit_amount;

    rental.status = RentalStatus::Completed;
    listing.is_available = true;

    Ok(())
}

// ---------- Renter completes after the owner's inspection deadline ----------

// The renter has sent the item back (phase 3) and the owner has neither
// confirmed the return nor flagged a problem by the inspection deadline, so
// the rental completes exactly as if the owner had confirmed it.

#[derive(Accounts)]
pub struct CompleteAfterInspectionDeadline<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        constraint = listing.key() == rental.listing @ crate::error::ErrorCode::ListingMismatch,
    )]
    pub rental: Account<'info, Rental>,

    // Typed, so a rental with no timeline (shipped before timelines existed,
    // so it has no inspection deadline) fails here.
    #[account(seeds = [TIMELINE_SEED, rental.key().as_ref()], bump = timeline.bump)]
    pub timeline: Account<'info, RentalTimeline>,

    /// CHECK: verified against rental.owner in the handler
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    #[account(mut)]
    pub renter: Signer<'info>,

    /// CHECK: verified against the hardcoded PLATFORM_WALLET constant
    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_complete_after_inspection_deadline(
    ctx: Context<CompleteAfterInspectionDeadline>,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotRenterForPhase,
    );
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotListingOwner,
    );
    // confirm_return moves it to Completed and flag_return_issue to
    // Disputed, so either one fails here.
    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );
    // Sent back (phase 3), whether or not the owner logged it on return.
    require!(
        matches!(
            ctx.accounts.rental.current_phase,
            HandoverPhase::BeforeReturning | HandoverPhase::OnReturn
        ),
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    let inspection_deadline = ctx.accounts.timeline.inspection_deadline;
    require!(inspection_deadline != 0, crate::error::ErrorCode::RentalTimesNotRecorded);
    // Strictly after: the owner can still act at the deadline itself.
    require!(
        Clock::get()?.unix_timestamp > inspection_deadline,
        crate::error::ErrorCode::InspectionWindowStillOpen,
    );

    let accounts = ctx.accounts;
    settle_completed_rental(
        &mut accounts.rental,
        &mut accounts.listing,
        &accounts.owner.to_account_info(),
        &accounts.renter.to_account_info(),
        &accounts.platform_wallet.to_account_info(),
    )
}
