use anchor_lang::prelude::*;
use crate::constants::{CONFIG_SEED, TIMELINE_SEED};
use crate::state::{Config, HandoverPhase, Rental, RentalStatus, RentalTimeline};

/// Enforces the phase 2 deadline (arrival or rejection) when the rental has
/// a timeline. The timeline address is pinned by seeds in the accounts
/// struct, so a caller can't dodge the deadline by leaving it out: it is
/// either our account (enforce) or an address nothing was ever created at,
/// which only happens for rentals shipped before timelines existed.
pub(crate) fn check_arrival_deadline(timeline: &AccountInfo, config: &Config) -> Result<()> {
    if timeline.owner == &crate::ID {
        let data = timeline.try_borrow_data()?;
        let timeline = RentalTimeline::try_deserialize(&mut &data[..])?;
        let deadline = timeline
            .shipped_at
            .checked_add(config.phase2_deadline_secs)
            .ok_or(crate::error::ErrorCode::MathOverflow)?;
        require!(
            Clock::get()?.unix_timestamp <= deadline,
            crate::error::ErrorCode::ArrivalWindowClosed
        );
    } else {
        require!(timeline.data_is_empty(), crate::error::ErrorCode::InvalidTimelineAccount);
    }
    Ok(())
}

// ---------- Phase 1: Owner, before sending ----------

#[derive(Accounts)]
pub struct SubmitPhase1<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    // Only ever created here, and phase 1 can only happen once per rental.
    #[account(
        init,
        payer = owner,
        space = 8 + RentalTimeline::INIT_SPACE,
        seeds = [TIMELINE_SEED, rental.key().as_ref()],
        bump
    )]
    pub timeline: Account<'info, RentalTimeline>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
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

    let rental_key = rental.key();
    let timeline = &mut ctx.accounts.timeline;
    timeline.rental = rental_key;
    timeline.shipped_at = Clock::get()?.unix_timestamp;
    timeline.bump = ctx.bumps.timeline;

    Ok(())
}

// ---------- Phase 2: Renter, on arrival ----------

#[derive(Accounts)]
pub struct SubmitPhase2<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    /// CHECK: may not exist (legacy rentals); see check_arrival_deadline.
    #[account(seeds = [TIMELINE_SEED, rental.key().as_ref()], bump)]
    pub timeline: UncheckedAccount<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

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
    check_arrival_deadline(&ctx.accounts.timeline, &ctx.accounts.config)?;

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