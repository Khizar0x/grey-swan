use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::constants::{
    CONFIG_SEED, DISPUTE_SEED, MAX_BPS, MAX_VERDICT_TIERS, PLATFORM_WALLET, POOL_SEED, RUBRIC_TIERS,
};
use crate::instructions::confirm_return::{bps_of, settle_rental};
use crate::state::{Config, Dispute, DisputeKind, DisputeStatus, Listing, Pool, Rental, RentalStatus};

// The damage-dispute engine for ReturnIssue disputes (the owner flagged a
// problem after getting the item back). An off-chain AI compares the
// handover photos and posts severity tiers; the contract turns them into a
// deposit split with Config's rubric. Either party can appeal (with a bond)
// to a human reviewer; otherwise anyone can finalize once the window closes.
// Every other dispute kind goes straight to a reviewer via resolve_dispute.

/// Rubric index of the Major tier. A human decision giving the owner at
/// least rubric_bps[MAJOR_TIER] needs two reviewers, and the AI can never
/// award that much on its own.
pub(crate) const MAJOR_TIER: usize = 3;

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
    // Several smaller findings can add up to a Major share, which a single
    // human reviewer couldn't award either.
    require!(
        owner_bps < config.rubric_bps[MAJOR_TIER],
        crate::error::ErrorCode::NeedsHumanReview,
    );

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
    // The bond comes back only if the outcome moves the appellant's way, which
    // can't happen when the verdict already gives them everything.
    let cannot_win = if by_owner {
        dispute.verdict_owner_bps == MAX_BPS
    } else {
        dispute.verdict_owner_bps == 0
    };
    require!(!cannot_win, crate::error::ErrorCode::AppealCannotWin);

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

// ---------- Paying out the verdict ----------

/// Gives each party back whatever bond they still have held in the
/// dispute, and records that nothing is held any more.
pub(crate) fn refund_bonds<'info>(
    dispute: &mut Account<'info, Dispute>,
    owner: &AccountInfo<'info>,
    renter: &AccountInfo<'info>,
) -> Result<()> {
    let dispute_info = dispute.to_account_info();
    for (bond, to) in [(dispute.owner_bond, owner), (dispute.renter_bond, renter)] {
        if bond > 0 {
            **dispute_info.try_borrow_mut_lamports()? -= bond;
            **to.try_borrow_mut_lamports()? += bond;
        }
    }
    dispute.owner_bond = 0;
    dispute.renter_bond = 0;
    Ok(())
}

/// Accounts for paying out the AI verdict without a reviewer. Anyone may
/// sign (and pay the fee); the money can only go to the rental's recorded
/// owner and renter and the platform wallet. The large accounts are boxed
/// (heap, not stack): unboxed they overflow the 4KB stack frame.
#[derive(Accounts)]
pub struct SettleVerdict<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        mut,
        constraint = listing.key() == rental.listing @ crate::error::ErrorCode::ListingMismatch,
    )]
    pub rental: Box<Account<'info, Rental>>,

    #[account(mut, seeds = [DISPUTE_SEED, rental.key().as_ref()], bump = dispute.bump)]
    pub dispute: Box<Account<'info, Dispute>>,

    /// CHECK: verified against rental.owner in the handler
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: verified against rental.renter in the handler
    #[account(mut)]
    pub renter: UncheckedAccount<'info>,

    /// CHECK: verified against the hardcoded PLATFORM_WALLET constant
    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    pub caller: Signer<'info>,
}

fn pay_out_verdict(accounts: &mut SettleVerdict) -> Result<()> {
    require_keys_eq!(accounts.rental.owner, accounts.owner.key(), crate::error::ErrorCode::NotListingOwner);
    require_keys_eq!(accounts.rental.renter, accounts.renter.key(), crate::error::ErrorCode::NotRenter);
    require!(accounts.rental.status == RentalStatus::Disputed, crate::error::ErrorCode::NotDisputed);

    let owner_bps = accounts.dispute.verdict_owner_bps;
    settle_rental(
        &mut accounts.rental,
        &mut accounts.listing,
        &accounts.owner.to_account_info(),
        &accounts.renter.to_account_info(),
        &accounts.platform_wallet.to_account_info(),
        owner_bps,
        RentalStatus::Completed,
    )?;

    let dispute = &mut accounts.dispute;
    dispute.status = DisputeStatus::Resolved;
    dispute.final_owner_bps = owner_bps;
    dispute.resolved_at = Clock::get()?.unix_timestamp;
    Ok(())
}

// ---------- Anyone finalizes an unappealed verdict ----------

pub fn handle_finalize_verdict(ctx: Context<SettleVerdict>) -> Result<()> {
    require!(!ctx.accounts.config.paused, crate::error::ErrorCode::DisputesPaused);
    // Appealed verdicts wait for a reviewer (or expire_appeal).
    require!(
        ctx.accounts.dispute.status == DisputeStatus::VerdictPosted,
        crate::error::ErrorCode::InvalidDisputeStatus,
    );
    // Strictly after: either party can still appeal at the deadline itself.
    require!(
        Clock::get()?.unix_timestamp > ctx.accounts.dispute.appeal_deadline,
        crate::error::ErrorCode::AppealWindowStillOpen,
    );
    pay_out_verdict(ctx.accounts)
}

// ---------- Anyone settles an appeal no reviewer got to in time ----------

// The delay is the platform's fault, so the verdict stands and every bond
// goes back. Blocked while paused like finalize_verdict, since it pays out
// the AI verdict without a human.
pub fn handle_expire_appeal(ctx: Context<SettleVerdict>) -> Result<()> {
    require!(!ctx.accounts.config.paused, crate::error::ErrorCode::DisputesPaused);
    require!(
        ctx.accounts.dispute.status == DisputeStatus::Appealed,
        crate::error::ErrorCode::InvalidDisputeStatus,
    );
    // Fixed when the verdict was posted (appeal_deadline + appeal_expiry_secs).
    require!(
        Clock::get()?.unix_timestamp > ctx.accounts.dispute.appeal_expires_at,
        crate::error::ErrorCode::AppealNotExpired,
    );
    let accounts = ctx.accounts;
    pay_out_verdict(accounts)?;
    refund_bonds(
        &mut accounts.dispute,
        &accounts.owner.to_account_info(),
        &accounts.renter.to_account_info(),
    )
}

// ---------- Admin sets an AI verdict aside ----------

// For a verdict the admin doesn't trust (a bad model run, a compromised
// verdict key). The dispute goes to Voided rather than back to Open, so
// the AI can't post again and a reviewer decides with reviewer_resolve.
// Only an unappealed verdict can be voided (an appealed one is already
// with a reviewer), so normally no bonds are held; any that are go back.

#[derive(Accounts)]
pub struct VoidVerdict<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ crate::error::ErrorCode::NotAdmin,
    )]
    pub config: Box<Account<'info, Config>>,

    pub rental: Box<Account<'info, Rental>>,

    #[account(mut, seeds = [DISPUTE_SEED, rental.key().as_ref()], bump = dispute.bump)]
    pub dispute: Box<Account<'info, Dispute>>,

    /// CHECK: verified against rental.owner in the handler
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: verified against rental.renter in the handler
    #[account(mut)]
    pub renter: UncheckedAccount<'info>,

    pub admin: Signer<'info>,
}

pub fn handle_void_verdict(ctx: Context<VoidVerdict>) -> Result<()> {
    let accounts = ctx.accounts;
    require_keys_eq!(accounts.rental.owner, accounts.owner.key(), crate::error::ErrorCode::NotListingOwner);
    require_keys_eq!(accounts.rental.renter, accounts.renter.key(), crate::error::ErrorCode::NotRenter);
    require!(
        accounts.dispute.status == DisputeStatus::VerdictPosted,
        crate::error::ErrorCode::InvalidDisputeStatus,
    );
    refund_bonds(&mut accounts.dispute, &accounts.owner.to_account_info(), &accounts.renter.to_account_info())?;
    accounts.dispute.status = DisputeStatus::Voided;
    Ok(())
}

// ---------- A reviewer decides a damage dispute ----------

/// Checks the second reviewer when one is required (or supplied): it must
/// be a reviewer (or the admin) and not the first reviewer. Returns the key
/// to record, or Pubkey::default() when there is none.
pub(crate) fn second_reviewer_key(
    config: &Config,
    first: &Pubkey,
    second: Option<&Signer>,
    required: bool,
) -> Result<Pubkey> {
    match second {
        Some(second) => {
            let key = second.key();
            require!(
                config.is_reviewer(&key) && key != *first,
                crate::error::ErrorCode::SecondReviewerRequired,
            );
            Ok(key)
        }
        None => {
            require!(!required, crate::error::ErrorCode::SecondReviewerRequired);
            Ok(Pubkey::default())
        }
    }
}

#[derive(Accounts)]
pub struct ReviewerResolve<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    // Receives any forfeited bonds.
    #[account(mut, seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        mut,
        constraint = listing.key() == rental.listing @ crate::error::ErrorCode::ListingMismatch,
    )]
    pub rental: Box<Account<'info, Rental>>,

    #[account(mut, seeds = [DISPUTE_SEED, rental.key().as_ref()], bump = dispute.bump)]
    pub dispute: Box<Account<'info, Dispute>>,

    /// CHECK: verified against rental.owner in the handler
    #[account(mut)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: verified against rental.renter in the handler
    #[account(mut)]
    pub renter: UncheckedAccount<'info>,

    /// CHECK: verified against the hardcoded PLATFORM_WALLET constant
    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    pub reviewer: Signer<'info>,

    // Needed for Major-tier decisions and large deposits.
    pub second_reviewer: Option<Signer<'info>>,
}

pub fn handle_reviewer_resolve(ctx: Context<ReviewerResolve>, owner_bps: u16) -> Result<()> {
    let accounts = ctx.accounts;
    let config = &accounts.config;
    let reviewer = accounts.reviewer.key();
    require!(config.is_reviewer(&reviewer), crate::error::ErrorCode::NotReviewer);
    require_keys_eq!(accounts.rental.owner, accounts.owner.key(), crate::error::ErrorCode::NotListingOwner);
    require_keys_eq!(accounts.rental.renter, accounts.renter.key(), crate::error::ErrorCode::NotRenter);
    require!(accounts.rental.status == RentalStatus::Disputed, crate::error::ErrorCode::NotDisputed);
    require!(
        accounts.dispute.kind == DisputeKind::ReturnIssue,
        crate::error::ErrorCode::WrongDisputeKind,
    );
    // Open: the AI never posted. Appealed: a party asked for a human.
    // Voided: the admin set the AI verdict aside. An unappealed verdict is
    // finalize_verdict's (or void_verdict's) to handle.
    require!(
        matches!(
            accounts.dispute.status,
            DisputeStatus::Open | DisputeStatus::Appealed | DisputeStatus::Voided
        ),
        crate::error::ErrorCode::InvalidDisputeStatus,
    );
    require!(owner_bps <= MAX_BPS, crate::error::ErrorCode::BpsOutOfRange);

    let needs_two = owner_bps >= config.rubric_bps[MAJOR_TIER]
        || accounts.rental.deposit_amount > config.two_reviewer_threshold_lamports;
    let second = second_reviewer_key(config, &reviewer, accounts.second_reviewer.as_ref(), needs_two)?;

    settle_rental(
        &mut accounts.rental,
        &mut accounts.listing,
        &accounts.owner.to_account_info(),
        &accounts.renter.to_account_info(),
        &accounts.platform_wallet.to_account_info(),
        owner_bps,
        RentalStatus::Resolved,
    )?;

    // An appeal that moved the outcome in the appellant's favour gets its
    // bond back; otherwise the bond goes to the user-protection pool.
    let ai_bps = accounts.dispute.verdict_owner_bps;
    let owner_bond = accounts.dispute.owner_bond;
    let renter_bond = accounts.dispute.renter_bond;
    let owner_refund = if owner_bps > ai_bps { owner_bond } else { 0 };
    let renter_refund = if owner_bps < ai_bps { renter_bond } else { 0 };
    let forfeited = (owner_bond - owner_refund)
        .checked_add(renter_bond - renter_refund)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let dispute_info = accounts.dispute.to_account_info();
    for (amount, to) in [
        (owner_refund, accounts.owner.to_account_info()),
        (renter_refund, accounts.renter.to_account_info()),
        (forfeited, accounts.pool.to_account_info()),
    ] {
        if amount > 0 {
            **dispute_info.try_borrow_mut_lamports()? -= amount;
            **to.try_borrow_mut_lamports()? += amount;
        }
    }
    accounts.pool.total_received = accounts
        .pool
        .total_received
        .checked_add(forfeited)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let dispute = &mut accounts.dispute;
    dispute.owner_bond = 0;
    dispute.renter_bond = 0;
    dispute.status = DisputeStatus::Resolved;
    dispute.final_owner_bps = owner_bps;
    dispute.resolved_by = [reviewer, second];
    dispute.resolved_at = Clock::get()?.unix_timestamp;

    Ok(())
}
