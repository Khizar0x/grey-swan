use anchor_lang::prelude::*;
use crate::constants::{CONFIG_SEED, DISPUTE_SEED, MAX_DISPUTE_REASON_LEN, TIMELINE_SEED};
use crate::instructions::handover::check_arrival_deadline;
use crate::state::{
    Config, Dispute, DisputeKind, DisputeStatus, HandoverPhase, Listing, Rental, RentalStatus,
};

fn open_dispute(dispute: &mut Dispute, rental: Pubkey, kind: DisputeKind, now: i64, bump: u8) {
    dispute.rental = rental;
    dispute.kind = kind;
    dispute.opened_at = now;
    dispute.status = DisputeStatus::Open;
    dispute.bump = bump;
}

// ---------- Owner flags a problem after the item comes back ----------

#[derive(Accounts)]
pub struct FlagReturnIssue<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    #[account(
        init,
        payer = owner,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [DISPUTE_SEED, rental.key().as_ref()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_flag_return_issue(ctx: Context<FlagReturnIssue>, reason: String) -> Result<()> {
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
        ctx.accounts.rental.current_phase == HandoverPhase::OnReturn,
        crate::error::ErrorCode::HandoverIncomplete,
    );
    require!(!reason.is_empty(), crate::error::ErrorCode::DisputeReasonRequired);
    require!(
        reason.len() <= MAX_DISPUTE_REASON_LEN,
        crate::error::ErrorCode::DisputeReasonTooLong
    );

    let now = Clock::get()?.unix_timestamp;
    let rental = &mut ctx.accounts.rental;
    rental.status = RentalStatus::Disputed;
    rental.dispute_kind = DisputeKind::ReturnIssue;
    rental.dispute_reason = reason;
    rental.disputed_at = now;

    open_dispute(&mut ctx.accounts.dispute, rental.key(), DisputeKind::ReturnIssue, now, ctx.bumps.dispute);

    Ok(())
}

// ---------- Renter rejects the item on arrival ----------

#[derive(Accounts)]
pub struct RejectOnArrival<'info> {
    #[account(mut)]
    pub rental: Account<'info, Rental>,

    /// CHECK: may not exist (legacy rentals); see check_arrival_deadline.
    #[account(seeds = [TIMELINE_SEED, rental.key().as_ref()], bump)]
    pub timeline: UncheckedAccount<'info>,

    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = renter,
        space = 8 + Dispute::INIT_SPACE,
        seeds = [DISPUTE_SEED, rental.key().as_ref()],
        bump
    )]
    pub dispute: Account<'info, Dispute>,

    #[account(mut)]
    pub renter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_reject_on_arrival(
    ctx: Context<RejectOnArrival>,
    photos: String,
    reason: String,
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
        ctx.accounts.rental.current_phase == HandoverPhase::BeforeSending,
        crate::error::ErrorCode::PhaseOutOfOrder,
    );
    require!(!photos.is_empty(), crate::error::ErrorCode::PhotosLinkRequired);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);
    require!(!reason.is_empty(), crate::error::ErrorCode::DisputeReasonRequired);
    require!(
        reason.len() <= MAX_DISPUTE_REASON_LEN,
        crate::error::ErrorCode::DisputeReasonTooLong
    );
    check_arrival_deadline(&ctx.accounts.timeline, &ctx.accounts.config)?;

    let now = Clock::get()?.unix_timestamp;
    let rental = &mut ctx.accounts.rental;
    rental.phase2_photos = photos;
    rental.current_phase = HandoverPhase::OnArrival;
    rental.status = RentalStatus::Disputed;
    rental.dispute_kind = DisputeKind::ArrivalIssue;
    rental.dispute_reason = reason;
    rental.disputed_at = now;

    open_dispute(&mut ctx.accounts.dispute, rental.key(), DisputeKind::ArrivalIssue, now, ctx.bumps.dispute);

    Ok(())
}

// ---------- Admin resolves the dispute ----------

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        constraint = listing.key() == rental.listing @ crate::error::ErrorCode::ListingMismatch,
    )]
    pub rental: Account<'info, Rental>,

    pub admin: Signer<'info>,

    /// CHECK: verified against rental.owner in the handler
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: verified against rental.renter in the handler
    #[account(mut)]
    pub renter: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_resolve_dispute(
    ctx: Context<ResolveDispute>,
    owner_amount: u64,
    renter_amount: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.admin.key(),
        ctx.accounts.config.admin,
        crate::error::ErrorCode::NotAdmin,
    );
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotListingOwner,
    );
    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotRenter,
    );
    require!(
        ctx.accounts.rental.status == RentalStatus::Disputed,
        crate::error::ErrorCode::NotDisputed,
    );

    let total_held = ctx
        .accounts
        .rental
        .total_rental_cost
        .checked_add(ctx.accounts.rental.deposit_amount)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let split_total = owner_amount
        .checked_add(renter_amount)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    require!(
        split_total == total_held,
        crate::error::ErrorCode::ResolutionAmountMismatch,
    );

    let rental_info = ctx.accounts.rental.to_account_info();
    let owner_info = ctx.accounts.owner.to_account_info();
    let renter_info = ctx.accounts.renter.to_account_info();

    if owner_amount > 0 {
        **rental_info.try_borrow_mut_lamports()? -= owner_amount;
        **owner_info.try_borrow_mut_lamports()? += owner_amount;
    }

    if renter_amount > 0 {
        **rental_info.try_borrow_mut_lamports()? -= renter_amount;
        **renter_info.try_borrow_mut_lamports()? += renter_amount;
    }

    ctx.accounts.rental.status = RentalStatus::Resolved;
    ctx.accounts.listing.is_available = true;

    Ok(())
}