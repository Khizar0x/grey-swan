use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

// Layout rules for Config:
// - `admin` and `bump` stay first, at bytes 8..40 and 40. That is the whole
//   original 41-byte account, which migrate_config grows in place, and
//   server/src/config.ts reads the admin straight from bytes 8..40.
// - Everything is fixed size (reviewers is an array plus a count, not a Vec)
//   so every field sits at a fixed offset.
// - New fields come out of `reserved`, so the account never needs to grow
//   again.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub bump: u8,
    pub version: u8,
    // Stored only; nothing reads it until dispute-2b adds pause handling.
    pub paused: bool,
    // Pubkey::default() means unset.
    pub verdict_key: Pubkey,
    pub reviewer_count: u8,
    pub reviewers: [Pubkey; 10],
    pub rubric_bps: [u16; 5],
    pub extra_finding_bps: u16,
    pub auto_release_max_tier: u8,
    pub appeal_window_secs: i64,
    pub appeal_expiry_secs: i64,
    pub phase2_deadline_secs: i64,
    pub bond_bps: u16,
    pub bond_min_lamports: u64,
    // TODO(dispute-2b): placeholder, not yet read by any instruction.
    pub large_deposit_threshold_lamports: u64,
    // TODO(dispute-2b): placeholder, not yet read by any instruction.
    pub two_reviewer_threshold_lamports: u64,
    // How long after return_due_at the owner waits before flag_not_returned.
    // Read live, at flag time.
    pub not_returned_grace_secs: i64,
    // Copied into the rental's timeline when the renter sends the item back,
    // so a later change doesn't move an inspection already under way.
    pub inspection_deadline_secs: i64,
    pub reserved: [u8; 112],
}

impl Config {
    pub fn with_defaults(admin: Pubkey, bump: u8) -> Self {
        Self {
            admin,
            bump,
            version: CONFIG_VERSION,
            paused: false,
            verdict_key: Pubkey::default(),
            reviewer_count: 0,
            reviewers: [Pubkey::default(); MAX_REVIEWERS],
            rubric_bps: DEFAULT_RUBRIC_BPS,
            extra_finding_bps: DEFAULT_EXTRA_FINDING_BPS,
            auto_release_max_tier: DEFAULT_AUTO_RELEASE_MAX_TIER,
            appeal_window_secs: DEFAULT_APPEAL_WINDOW_SECS,
            appeal_expiry_secs: DEFAULT_APPEAL_EXPIRY_SECS,
            phase2_deadline_secs: DEFAULT_PHASE2_DEADLINE_SECS,
            bond_bps: DEFAULT_BOND_BPS,
            bond_min_lamports: DEFAULT_BOND_MIN_LAMPORTS,
            large_deposit_threshold_lamports: DEFAULT_LARGE_DEPOSIT_THRESHOLD_LAMPORTS,
            two_reviewer_threshold_lamports: DEFAULT_TWO_REVIEWER_THRESHOLD_LAMPORTS,
            not_returned_grace_secs: DEFAULT_NOT_RETURNED_GRACE_SECS,
            inspection_deadline_secs: DEFAULT_INSPECTION_DEADLINE_SECS,
            reserved: [0; 112],
        }
    }

    /// Bounds every admin-tunable value must satisfy. Checked after any
    /// update_config change, against the resulting config as a whole.
    pub fn validate(&self) -> Result<()> {
        require!(self.version == CONFIG_VERSION, ErrorCode::ConfigNotMigrated);
        require!(
            self.rubric_bps.iter().all(|&b| b <= MAX_BPS),
            ErrorCode::BpsOutOfRange
        );
        require!(
            self.rubric_bps.windows(2).all(|w| w[0] <= w[1]),
            ErrorCode::RubricNotAscending
        );
        require!(self.extra_finding_bps <= MAX_BPS, ErrorCode::BpsOutOfRange);
        require!(self.bond_bps <= MAX_BPS, ErrorCode::BpsOutOfRange);
        require!(
            (self.auto_release_max_tier as usize) < RUBRIC_TIERS,
            ErrorCode::InvalidTier
        );
        require!(
            self.appeal_window_secs >= MIN_APPEAL_WINDOW_SECS,
            ErrorCode::AppealWindowTooShort
        );
        require!(
            self.appeal_expiry_secs > 0 && self.appeal_expiry_secs <= MAX_TIMEOUT_SECS,
            ErrorCode::InvalidDuration
        );
        require!(
            (MIN_PHASE2_DEADLINE_SECS..=MAX_TIMEOUT_SECS).contains(&self.phase2_deadline_secs),
            ErrorCode::InvalidDuration
        );
        require!(
            (MIN_TIMEOUT_SECS..=MAX_TIMEOUT_SECS).contains(&self.not_returned_grace_secs),
            ErrorCode::InvalidDuration
        );
        require!(
            (MIN_TIMEOUT_SECS..=MAX_TIMEOUT_SECS).contains(&self.inspection_deadline_secs),
            ErrorCode::InvalidDuration
        );

        let count = self.reviewer_count as usize;
        require!(count <= MAX_REVIEWERS, ErrorCode::TooManyReviewers);
        let active = &self.reviewers[..count];
        require!(
            active.iter().all(|r| *r != Pubkey::default()),
            ErrorCode::InvalidReviewer
        );
        for (i, r) in active.iter().enumerate() {
            require!(!active[i + 1..].contains(r), ErrorCode::InvalidReviewer);
        }
        require!(
            self.reviewers[count..].iter().all(|r| *r == Pubkey::default()),
            ErrorCode::InvalidReviewer
        );
        Ok(())
    }
}

// New variants must always be appended after the existing ones, never
// inserted or reordered — Anchor/Borsh encodes a unit-variant enum as a
// single discriminant byte in declaration order, so reordering would change
// what every already-deployed Listing account's stored `category` byte
// means (e.g. an existing "Other" listing silently becoming "Electronics").
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Category {
    PhotographyVideo,
    MusicAudio,
    ToolsEquipment,
    SportsOutdoor,
    Other,
    Electronics,
    HomeGarden,
    EventsParty,
    FashionCostumes,
    BabyKids,
    DigitalCloud,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RarityTier {
    Common,
    Rare,
    Antique,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub owner: Pubkey,
    #[max_len(50)]
    pub item_name: String,
    #[max_len(1200)]
    pub description: String,
    #[max_len(200)]
    pub photos: String,
    pub rental_price: u64,
    pub deposit_amount: u64,
    pub estimated_value: u64,
    pub category: Category,
    pub rarity_tier: RarityTier,
    pub is_available: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RentalStatus {
    Active,
    AwaitingReturn,
    AwaitingConfirmation,
    Disputed,
    Completed,
    RefundedAuto,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum HandoverPhase {
    None,
    BeforeSending,
    OnArrival,
    BeforeReturning,
    OnReturn,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
// New variants must be appended, never reordered (same reason as Category).
pub enum DisputeKind {
    None,
    ReturnIssue,
    ArrivalIssue,
    NotReturned,
    AdminOpened,
}

#[account]
#[derive(InitSpace)]
pub struct Rental {
    pub listing: Pubkey,
    pub owner: Pubkey,
    pub renter: Pubkey,
    pub weekly_price: u64,
    pub weeks: u16,
    pub total_rental_cost: u64,
    pub deposit_amount: u64,
    pub created_at: i64,
    pub status: RentalStatus,
    pub current_phase: HandoverPhase,
    #[max_len(200)]
    pub phase1_photos: String,
    #[max_len(40)]
    pub outbound_tracking: String,
    #[max_len(200)]
    pub phase2_photos: String,
    #[max_len(200)]
    pub phase3_photos: String,
    #[max_len(40)]
    pub return_tracking: String,
    #[max_len(200)]
    pub phase4_photos: String,
    pub dispute_kind: DisputeKind,
    #[max_len(300)]
    pub dispute_reason: String,
    pub disputed_at: i64,
}

// Rental is full (no spare bytes), so per-rental timestamps live in this
// side account, seeds ["timeline", rental], created by submit_phase1.
// Rentals shipped before this existed have no timeline and no deadlines.
#[account]
#[derive(InitSpace)]
pub struct RentalTimeline {
    pub rental: Pubkey,
    pub shipped_at: i64,
    pub bump: u8,
    // shipped_at + phase2_deadline_secs, fixed at shipping so a later Config
    // change doesn't move the deadline for items already in transit.
    pub arrival_deadline: i64,
    // A zero in any of the four below means that step hasn't happened yet.
    // When the renter had the item: their phase 2 time, or arrival_deadline
    // if the owner confirmed arrival for them after it passed.
    pub arrived_at: i64,
    // arrived_at + weeks. The rental period runs from arrival, not payment.
    pub return_due_at: i64,
    // When the renter submitted phase 3.
    pub return_shipped_at: i64,
    // return_shipped_at + inspection_deadline_secs, fixed at that moment.
    pub inspection_deadline: i64,
    pub reserved: [u8; 24],
}

// Only `Open` for now. New variants must be appended, never reordered (same
// reason as Category above).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DisputeStatus {
    Open,
}

// One per disputed rental, seeds ["dispute", rental], created by
// flag_return_issue or reject_on_arrival and paid for by whoever raised it.
// Rentals disputed before this existed have no Dispute account;
// resolve_dispute doesn't take one, so they stay resolvable.
#[account]
#[derive(InitSpace)]
pub struct Dispute {
    pub rental: Pubkey,
    pub kind: DisputeKind,
    pub opened_at: i64,
    pub status: DisputeStatus,
    pub bump: u8,
    // Room for the verdict, appeal, bond and reviewer fields (dispute-2b).
    pub reserved: [u8; 384],
}
