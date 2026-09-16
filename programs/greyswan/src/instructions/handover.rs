use anchor_lang::prelude::*;
use crate::state::{HandoverPhase, Rental, RentalStatus};

// ---------- Phase 1: Owner, before sending ----------

#[derive(Accounts)]
pub struct SubmitPhase1<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,
    pub owner: Signer<'info>,
}

pub fn handle_submit_phase1(
    ctx: Context<SubmitPhase1>,
    photos: String,
    tracking_number: String,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotOwnerForPhase,
    );
    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );
    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::None,
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    require!(!photos.is_empty(), crate::error::ErrorCode::PhotosLinkRequired);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);
    require!(
        !tracking_number.is_empty(),
        crate::error::ErrorCode::TrackingNumberRequired
    );
    require!(
        tracking_number.len() <= 40,
        crate::error::ErrorCode::TrackingNumberTooLong
    );

    let rental = &mut ctx.accounts.rental;
    rental.phase1_photos = photos;
    rental.outbound_tracking = tracking_number;
    rental.current_phase = HandoverPhase::BeforeSending;

    Ok(())
}

// ---------- Phase 2: Renter, on arrival ----------

#[derive(Accounts)]
pub struct SubmitPhase2<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,
    pub renter: Signer<'info>,
}

pub fn handle_submit_phase2(ctx: Context<SubmitPhase2>, photos: String) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotRenterForPhase,
    );
    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );
    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::BeforeSending,
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    require!(!photos.is_empty(), crate::error::ErrorCode::PhotosLinkRequired);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);

    let rental = &mut ctx.accounts.rental;
    rental.phase2_photos = photos;
    rental.current_phase = HandoverPhase::OnArrival;

    Ok(())
}

// ---------- Phase 3: Renter, before returning ----------

#[derive(Accounts)]
pub struct SubmitPhase3<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,
    pub renter: Signer<'info>,
}

pub fn handle_submit_phase3(
    ctx: Context<SubmitPhase3>,
    photos: String,
    tracking_number: String,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotRenterForPhase,
    );
    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );
    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::OnArrival,
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    require!(!photos.is_empty(), crate::error::ErrorCode::PhotosLinkRequired);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);
    require!(
        !tracking_number.is_empty(),
        crate::error::ErrorCode::TrackingNumberRequired
    );
    require!(
        tracking_number.len() <= 40,
        crate::error::ErrorCode::TrackingNumberTooLong
    );

    let rental = &mut ctx.accounts.rental;
    rental.phase3_photos = photos;
    rental.return_tracking = tracking_number;
    rental.current_phase = HandoverPhase::BeforeReturning;

    Ok(())
}

// ---------- Phase 4: Owner, on return ----------

#[derive(Accounts)]
pub struct SubmitPhase4<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,
    pub owner: Signer<'info>,
}

pub fn handle_submit_phase4(ctx: Context<SubmitPhase4>, photos: String) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotOwnerForPhase,
    );
    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );
    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::BeforeReturning,
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    require!(!photos.is_empty(), crate::error::ErrorCode::PhotosLinkRequired);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);

    let rental = &mut ctx.accounts.rental;
    rental.phase4_photos = photos;
    rental.current_phase = HandoverPhase::OnReturn;

    Ok(())
}