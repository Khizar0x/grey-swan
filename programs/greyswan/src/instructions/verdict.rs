use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::constants::{CONFIG_SEED, DISPUTE_SEED, MAX_BPS, MAX_VERDICT_TIERS, RUBRIC_TIERS};
use crate::instructions::confirm_return::bps_of;
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

// ---------- Owner or renter appeals the verdict ----------

/// What an appeal costs: bond_bps of what the appellant stands to lose
/// under the verdict (for the renter, the owner's deposit share; for the
/// owner, the rest of the deposit), but never less than bond_min_lamports.
pub(crate) fn appeal_bond(config: &Config, deposit: u64, verdict_owner_bps: u16, by_owner: bool) -> Result<u64> {
    let owner_share = bps_of(deposit, verdict_owner_bps)?;
    let at_stake = if by_owner { deposit - owner_share } else { owner_share };
    Ok(bps_of(at_stake, config.bond_bps)?.max(config.bond_min_lamports))
}

#[derive(Accounts)]
pub struct Appeal<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    pub rental: Account<'info, Rental>,

    // Holds the bond until a reviewer refunds or forfeits it.
    #[account(mut, seeds = [DISPUTE_SEED, rental.key().as_ref()], bump = dispute.bump)]
    pub dispute: Account<'info, Dispute>,

    #[account(mut)]
    pub appellant: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Not blocked by pause: appealing only moves the decision to a human.
pub fn handle_appeal(ctx: Context<Appeal>) -> Result<()> {
    let rental = &ctx.accounts.rental;
    let appellant = ctx.accounts.appellant.key();
    let by_owner = appellant == rental.owner;
    require!(by_owner || appellant == rental.renter, crate::error::ErrorCode::NotRentalParty);
    // With one wallet on both sides there is no other party to appeal against,
    // and a bond refund rule that depends on which side appealed is meaningless.
    require_keys_neq!(rental.owner, rental.renter, crate::error::ErrorCode::SameOwnerAndRenter);

    let dispute = &ctx.accounts.dispute;
    require!(
        matches!(dispute.status, DisputeStatus::VerdictPosted | DisputeStatus::Appealed),
        crate::error::ErrorCode::InvalidDisputeStatus,
    );
    require!(
        Clock::get()?.unix_timestamp <= dispute.appeal_deadline,
        crate::error::ErrorCode::AppealWindowClosed,
    );
    let already = if by_owner { dispute.owner_appealed } else { dispute.renter_appealed };
    require!(!already, crate::error::ErrorCode::AlreadyAppealed);

    let bond = appeal_bond(&ctx.accounts.config, rental.deposit_amount, dispute.verdict_owner_bps, by_owner)?;
    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.appellant.to_account_info(),
                to: ctx.accounts.dispute.to_account_info(),
            },
        ),
        bond,
    )?;

    let dispute = &mut ctx.accounts.dispute;
    if by_owner {
        dispute.owner_appealed = true;
        dispute.owner_bond = bond;
    } else {
        dispute.renter_appealed = true;
        dispute.renter_bond = bond;
    }
    dispute.status = DisputeStatus::Appealed;

    Ok(())
}
