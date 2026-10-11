use anchor_lang::prelude::*;

pub const COUNTER_SEED: &[u8] = b"counter";

pub const HELLO_WORLD_LAMPORTS: u64 = 1;

pub const MAX_COUNT: u64 = 10;

pub const PLATFORM_FEE_PERCENT: u64 = 10;

pub const PLATFORM_WALLET: Pubkey = pubkey!("32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD");

pub const AUTO_REFUND_TIMEOUT_SECONDS: i64 = 7 * 24 * 60 * 60;

pub const MIN_RENTAL_WEEKS: u16 = 1;

pub const MAX_RENTAL_WEEKS: u16 = 12;

pub const MAX_DISPUTE_REASON_LEN: usize = 300;

// ---------- Config (version 2) ----------

pub const CONFIG_SEED: &[u8] = b"config";

/// Version written by migrate_config and init_config. A Config at version 1
/// is the original 41-byte layout (discriminator + admin + bump), which has
/// no version byte at all.
pub const CONFIG_VERSION: u8 = 2;

pub const LEGACY_CONFIG_LEN: usize = 8 + 32 + 1;

pub const MAX_BPS: u16 = 10_000;

pub const MAX_REVIEWERS: usize = 10;

/// Damage tiers, in rubric_bps order: NormalWear, Cosmetic,
/// FunctionalDamage, Major, DestroyedOrMissing.
pub const RUBRIC_TIERS: usize = 5;

/// Floor for appeal_window_secs. update_config can never set it lower.
pub const MIN_APPEAL_WINDOW_SECS: i64 = 86_400;

/// Floor for phase2_deadline_secs, so the arrival window can never be
/// shortened to the point where an honest renter cannot meet it.
pub const MIN_PHASE2_DEADLINE_SECS: i64 = 86_400;

pub const DEFAULT_RUBRIC_BPS: [u16; RUBRIC_TIERS] = [0, 1_500, 5_000, 8_000, 10_000];
pub const DEFAULT_EXTRA_FINDING_BPS: u16 = 500;
pub const DEFAULT_AUTO_RELEASE_MAX_TIER: u8 = 2;
pub const DEFAULT_APPEAL_WINDOW_SECS: i64 = 86_400;
pub const DEFAULT_APPEAL_EXPIRY_SECS: i64 = 604_800;
pub const DEFAULT_PHASE2_DEADLINE_SECS: i64 = 432_000;
// TODO(dispute-2b): placeholder bond values, to be tuned.
pub const DEFAULT_BOND_BPS: u16 = 1_000;
pub const DEFAULT_BOND_MIN_LAMPORTS: u64 = 10_000_000;
// TODO(dispute-2b): placeholder thresholds, not yet read by any instruction.
pub const DEFAULT_LARGE_DEPOSIT_THRESHOLD_LAMPORTS: u64 = 5_000_000_000;
pub const DEFAULT_TWO_REVIEWER_THRESHOLD_LAMPORTS: u64 = 10_000_000_000;

pub const TIMELINE_SEED: &[u8] = b"timeline";
