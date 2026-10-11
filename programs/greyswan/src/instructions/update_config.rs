use anchor_lang::prelude::*;
use crate::constants::{CONFIG_SEED, MAX_REVIEWERS};
use crate::error::ErrorCode;
use crate::state::Config;

/// Each field left as None keeps its current value.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ConfigUpdate {
    pub paused: Option<bool>,
    pub verdict_key: Option<Pubkey>,
    /// Replaces the whole reviewer list.
    pub reviewers: Option<Vec<Pubkey>>,
    pub rubric_bps: Option<[u16; 5]>,
    pub extra_finding_bps: Option<u16>,
    pub auto_release_max_tier: Option<u8>,
    pub appeal_window_secs: Option<i64>,
    pub appeal_expiry_secs: Option<i64>,
    pub phase2_deadline_secs: Option<i64>,
    pub bond_bps: Option<u16>,
    pub bond_min_lamports: Option<u64>,
    pub large_deposit_threshold_lamports: Option<u64>,
    pub two_reviewer_threshold_lamports: Option<u64>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ErrorCode::NotAdmin,
    )]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,
}

pub fn handle_update_config(ctx: Context<UpdateConfig>, update: ConfigUpdate) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(v) = update.paused {
        config.paused = v;
    }
    if let Some(v) = update.verdict_key {
        config.verdict_key = v;
    }
    if let Some(list) = update.reviewers {
        require!(list.len() <= MAX_REVIEWERS, ErrorCode::TooManyReviewers);
        config.reviewers = [Pubkey::default(); MAX_REVIEWERS];
        config.reviewers[..list.len()].copy_from_slice(&list);
        config.reviewer_count = list.len() as u8;
    }
    if let Some(v) = update.rubric_bps {
        config.rubric_bps = v;
    }
    if let Some(v) = update.extra_finding_bps {
        config.extra_finding_bps = v;
    }
    if let Some(v) = update.auto_release_max_tier {
        config.auto_release_max_tier = v;
    }
    if let Some(v) = update.appeal_window_secs {
        config.appeal_window_secs = v;
    }
    if let Some(v) = update.appeal_expiry_secs {
        config.appeal_expiry_secs = v;
    }
    if let Some(v) = update.phase2_deadline_secs {
        config.phase2_deadline_secs = v;
    }
    if let Some(v) = update.bond_bps {
        config.bond_bps = v;
    }
    if let Some(v) = update.bond_min_lamports {
        config.bond_min_lamports = v;
    }
    if let Some(v) = update.large_deposit_threshold_lamports {
        config.large_deposit_threshold_lamports = v;
    }
    if let Some(v) = update.two_reviewer_threshold_lamports {
        config.two_reviewer_threshold_lamports = v;
    }

    // Validated as a whole, so a change is checked against the other values
    // as they will actually be stored (e.g. rubric ordering).
    config.validate()
}
