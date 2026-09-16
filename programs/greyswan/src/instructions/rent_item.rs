use anchor_lang::prelude::*;
use crate::constants::{MAX_RENTAL_WEEKS, MIN_RENTAL_WEEKS};
use crate::state::{DisputeKind, HandoverPhase, Listing, Rental, RentalStatus};

#[derive(Accounts)]
pub struct RentItem<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        init,
        payer = renter,
        space = 8 + Rental::INIT_SPACE
    )]
    pub rental: Account<'info, Rental>,

    #[account(mut)]
    pub renter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_rent_item(ctx: Context<RentItem>, weeks: u16) -> Result<()> {
    require!(
        ctx.accounts.listing.is_available,
        crate::error::ErrorCode::ListingNotAvailable
    );

    require!(
        weeks >= MIN_RENTAL_WEEKS && weeks <= MAX_RENTAL_WEEKS,
        crate::error::ErrorCode::InvalidRentalDuration
    );

    let listing_key = ctx.accounts.listing.key();
    let listing_owner = ctx.accounts.listing.owner;
    let weekly_price = ctx.accounts.listing.rental_price;
    let deposit_amount = ctx.accounts.listing.deposit_amount;

    let total_rental_cost = weekly_price
        .checked_mul(weeks as u64)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let total_amount = total_rental_cost
        .checked_add(deposit_amount)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let rental = &mut ctx.accounts.rental;
    rental.listing = listing_key;
    rental.owner = listing_owner;
    rental.renter = ctx.accounts.renter.key();
    rental.weekly_price = weekly_price;
    rental.weeks = weeks;
    rental.total_rental_cost = total_rental_cost;
    rental.deposit_amount = deposit_amount;
    rental.created_at = Clock::get()?.unix_timestamp;
    rental.status = RentalStatus::Active;
    rental.current_phase = HandoverPhase::None;
    rental.phase1_photos = String::new();
    rental.outbound_tracking = String::new();
    rental.phase2_photos = String::new();
    rental.phase3_photos = String::new();
    rental.return_tracking = String::new();
    rental.phase4_photos = String::new();
    rental.dispute_kind = DisputeKind::None;
    rental.dispute_reason = String::new();
    rental.disputed_at = 0;

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.renter.key(),
            &ctx.accounts.rental.key(),
            total_amount,
        ),
        &[
            ctx.accounts.renter.to_account_info(),
            ctx.accounts.rental.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    ctx.accounts.listing.is_available = false;

    Ok(())
}