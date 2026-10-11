use anchor_lang::prelude::*;
use crate::constants::{CONFIG_SEED, SECONDS_PER_WEEK, TIMELINE_SEED};
use crate::state::{Config, HandoverPhase, Rental, RentalStatus, RentalTimeline};

/// The rental's timeline, or None for a rental shipped before timelines
/// existed. The address is pinned by seeds in each accounts struct, so a
/// caller can't swap in another account or leave a real one out: it is
/// either our account or an address nothing was ever created at.
pub(crate) fn load_timeline(timeline: &AccountInfo) -> Result<Option<RentalTimeline>> {
    if timeline.owner == &crate::ID {
        let data = timeline.try_borrow_data()?;
        Ok(Some(RentalTimeline::try_deserialize(&mut &data[..])?))
    } else {
        require!(timeline.data_is_empty(), crate::error::ErrorCode::InvalidTimelineAccount);
        Ok(None)
    }
}

/// Writes back a timeline that load_timeline returned as Some.
fn save_timeline(info: &AccountInfo, timeline: &RentalTimeline) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = &mut data[..];
    timeline.try_serialize(&mut writer)
}

fn require_within_arrival_window(timeline: &RentalTimeline) -> Result<()> {
    require!(
        Clock::get()?.unix_timestamp <= timeline.arrival_deadline,
        crate::error::ErrorCode::ArrivalWindowClosed
    );
    Ok(())
}

/// Enforces the phase 2 deadline (arrival or rejection) when the rental has
/// a timeline. Legacy rentals have none, so no deadline.
pub(crate) fn check_arrival_deadline(timeline: &AccountInfo) -> Result<()> {
    if let Some(timeline) = load_timeline(timeline)? {
        require_within_arrival_window(&timeline)?;
    }
    Ok(())
}

/// Starts the rental period: it runs from when the renter has the item.
/// Also fixes when the owner may report the item as not returned, from the
/// grace period in Config at this moment.
fn record_arrival(timeline: &mut RentalTimeline, arrived_at: i64, weeks: u16, config: &Config) -> Result<()> {
    timeline.arrived_at = arrived_at;
    timeline.return_due_at = (weeks as i64)
        .checked_mul(SECONDS_PER_WEEK)
        .and_then(|period| arrived_at.checked_add(period))
        .ok_or(crate::error::ErrorCode::MathOverflow)?;
    timeline.not_returned_after = timeline
        .return_due_at
        .checked_add(config.not_returned_grace_secs)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;
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

    // Read once here to fix this rental's arrival deadline.
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

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
    let now = Clock::get()?.unix_timestamp;
    let timeline = &mut ctx.accounts.timeline;
    timeline.rental = rental_key;
    timeline.shipped_at = now;
    timeline.bump = ctx.bumps.timeline;
    timeline.arrival_deadline = now
        .checked_add(ctx.accounts.config.phase2_deadline_secs)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    Ok(())
}

// ---------- Phase 2: Renter, on arrival ----------

#[derive(Accounts)]
pub struct SubmitPhase2<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    /// CHECK: may not exist (legacy rentals); see load_timeline.
    #[account(mut, seeds = [TIMELINE_SEED, rental.key().as_ref()], bump)]
    pub timeline: UncheckedAccount<'info>,

    // Read once here to fix this rental's not-returned date.
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

    if let Some(mut timeline) = load_timeline(&ctx.accounts.timeline)? {
        require_within_arrival_window(&timeline)?;
        record_arrival(
            &mut timeline,
            Clock::get()?.unix_timestamp,
            ctx.accounts.rental.weeks,
            &ctx.accounts.config,
        )?;
        save_timeline(&ctx.accounts.timeline, &timeline)?;
    }

    let rental = &mut ctx.accounts.rental;
    rental.phase2_photos = photos;
    rental.current_phase = HandoverPhase::OnArrival;

    Ok(())
}

// ---------- Phase 2 fallback: Owner, after the arrival deadline ----------

// If the renter neither confirms arrival nor rejects the item by the
// deadline, receipt counts as confirmed and the owner can move the rental
// on. Without this the rental would be stuck: the renter can no longer act,
// and the owner's later steps all need phase 2 done.

#[derive(Accounts)]
pub struct ConfirmArrivalAfterDeadline<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    // Typed, so a rental with no timeline (shipped before timelines existed,
    // so it has no deadline) fails here.
    #[account(mut, seeds = [TIMELINE_SEED, rental.key().as_ref()], bump = timeline.bump)]
    pub timeline: Account<'info, RentalTimeline>,

    // Read once here to fix this rental's not-returned date.
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    pub owner: Signer<'info>,
}

pub fn handle_confirm_arrival_after_deadline(ctx: Context<ConfirmArrivalAfterDeadline>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotOwnerForPhase,
    );
    // A rejection moves the rental to Disputed, so it fails here.
    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );
    // A renter confirmation moves it past BeforeSending, so it fails here.
    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::BeforeSending,
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    // Strictly after: the renter can still act at the deadline itself.
    require!(
        Clock::get()?.unix_timestamp > ctx.accounts.timeline.arrival_deadline,
        crate::error::ErrorCode::ArrivalWindowStillOpen,
    );

    // Same phase state as submit_phase2. phase2_photos stays empty, which is
    // how this path can be told apart from a renter confirmation.
    ctx.accounts.rental.current_phase = HandoverPhase::OnArrival;

    // Arrival counts from the deadline the renter missed, not from whenever
    // the owner gets round to calling this, so a late call can't push the
    // renter's return date later (or earlier).
    let deadline = ctx.accounts.timeline.arrival_deadline;
    record_arrival(&mut ctx.accounts.timeline, deadline, ctx.accounts.rental.weeks, &ctx.accounts.config)?;

    Ok(())
}

// ---------- Phase 3: Renter, before returning ----------

#[derive(Accounts)]
pub struct SubmitPhase3<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    /// CHECK: may not exist (legacy rentals); see load_timeline.
    #[account(mut, seeds = [TIMELINE_SEED, rental.key().as_ref()], bump)]
    pub timeline: UncheckedAccount<'info>,

    // Read once here to fix this rental's inspection deadline.
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

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

    // Legacy rentals have no timeline, so no inspection deadline either.
    if let Some(mut timeline) = load_timeline(&ctx.accounts.timeline)? {
        let now = Clock::get()?.unix_timestamp;
        timeline.return_shipped_at = now;
        timeline.inspection_deadline = now
            .checked_add(ctx.accounts.config.inspection_deadline_secs)
            .ok_or(crate::error::ErrorCode::MathOverflow)?;
        save_timeline(&ctx.accounts.timeline, &timeline)?;
    }

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