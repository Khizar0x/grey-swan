use anchor_lang::prelude::*;
use crate::constants::{CONFIG_SEED, DISPUTE_SEED, MAX_BPS, MAX_VERDICT_TIERS, RUBRIC_TIERS};
use crate::state::{Config, Dispute, DisputeKind, DisputeStatus, Rental, RentalStatus};

// The damage-dispute engine for ReturnIssue disputes (the owner flagged a
// problem after getting the item back). An off-chain AI compares the
// handover photos and posts severity tiers; the contract turns them into a
// deposit split with Config's rubric. Either party can appeal (with a bond)
// to a human reviewer; otherwise anyone can finalize once the window closes.
// Every other dispute kind goes straight to a reviewer via resolve_dispute.

/// Deposit share to the owner for a verdict: the rubric value of the worst
/// finding, plus extra_finding_bps for each further finding, capped at 100%.
pub(crate) fn verdict_owner_bps(config: &Config, tiers: &[u8]) -> u16 {
    let worst = tiers.iter().copied().max().unwrap_or(0) as usize;
    let extra_findings = tiers.len().saturating_sub(1) as u32;
    let bps = config.rubric_bps[worst] as u32 + config.extra_finding_bps as u32 * extra_findings;
    bps.min(MAX_BPS as u32) as u16
}

// ---------- The AI service posts its verdict ----------

#[derive(Accounts)]
pub struct PostVerdict<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    pub rental: Account<'info, Rental>,

    #[account(mut, seeds = [DISPUTE_SEED, rental.key().as_ref()], bump = dispute.bump)]
    pub dispute: Account<'info, Dispute>,

    pub verdict_signer: Signer<'info>,
}

pub fn handle_post_verdict(
    ctx: Context<PostVerdict>,
    tiers: Vec<u8>,
    prompt_hash: [u8; 32],
    output_hash: [u8; 32],
) -> Result<()> {
    let config = &ctx.accounts.config;
    // An unset verdict_key is Pubkey::default(), which nobody can sign for.
    require_keys_eq!(
        ctx.accounts.verdict_signer.key(),
        config.verdict_key,
        crate::error::ErrorCode::NotVerdictKey,
    );
    require!(!config.paused, crate::error::ErrorCode::DisputesPaused);

    let rental = &ctx.accounts.rental;
    require!(rental.status == RentalStatus::Disputed, crate::error::ErrorCode::NotDisputed);
    let dispute = &ctx.accounts.dispute;
    require!(dispute.kind == DisputeKind::ReturnIssue, crate::error::ErrorCode::WrongDisputeKind);
    // One verdict per dispute: a voided verdict leaves status Voided, and
    // verdict_posted_at stays set either way.
    require!(
        dispute.status == DisputeStatus::Open && dispute.verdict_posted_at == 0,
        crate::error::ErrorCode::InvalidDisputeStatus,
    );

    require!(
        (1..=MAX_VERDICT_TIERS).contains(&tiers.len()),
        crate::error::ErrorCode::InvalidTierCount,
    );
    require!(
        tiers.iter().all(|&t| (t as usize) < RUBRIC_TIERS),
        crate::error::ErrorCode::TierOutOfRange,
    );
    // Severe damage and large deposits always go to a human.
    let worst = tiers.iter().copied().max().unwrap_or(0);
    require!(worst <= config.auto_release_max_tier, crate::error::ErrorCode::NeedsHumanReview);
    require!(
        rental.deposit_amount <= config.large_deposit_threshold_lamports,
        crate::error::ErrorCode::NeedsHumanReview,
    );

    let now = Clock::get()?.unix_timestamp;
    let appeal_deadline = now
        .checked_add(config.appeal_window_secs)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;
    let appeal_expires_at = appeal_deadline
        .checked_add(config.appeal_expiry_secs)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;
    let owner_bps = verdict_owner_bps(config, &tiers);

    let dispute = &mut ctx.accounts.dispute;
    dispute.tier_count = tiers.len() as u8;
    dispute.tiers = [0; MAX_VERDICT_TIERS];
    dispute.tiers[..tiers.len()].copy_from_slice(&tiers);
    dispute.verdict_owner_bps = owner_bps;
    dispute.prompt_hash = prompt_hash;
    dispute.output_hash = output_hash;
    dispute.verdict_posted_at = now;
    dispute.appeal_deadline = appeal_deadline;
    dispute.appeal_expires_at = appeal_expires_at;
    dispute.status = DisputeStatus::VerdictPosted;

    Ok(())
}
