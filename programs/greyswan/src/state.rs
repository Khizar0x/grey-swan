use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Category {
    PhotographyVideo,
    MusicAudio,
    ToolsEquipment,
    SportsOutdoor,
    Other,
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
    #[max_len(500)]
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
pub enum DisputeKind {
    None,
    ReturnIssue,
    ArrivalIssue,
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