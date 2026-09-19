pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko");

#[program]
pub mod greyswan {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx)
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        crate::instructions::increment::handle_increment(ctx)
    }

    pub fn init_config(ctx: Context<InitConfig>, admin: Pubkey) -> Result<()> {
        crate::instructions::init_config::handle_init_config(ctx, admin)
    }

    pub fn list_item(
        ctx: Context<ListItem>,
        item_name: String,
        description: String,
        photos: String,
        rental_price: u64,
        deposit_amount: u64,
        estimated_value: u64,
        category: Category,
        rarity_tier: RarityTier,
    ) -> Result<()> {
        crate::instructions::list_item::handle_list_item(
            ctx,
            item_name,
            description,
            photos,
            rental_price,
            deposit_amount,
            estimated_value,
            category,
            rarity_tier,
        )
    }

    pub fn update_listing(
        ctx: Context<UpdateListing>,
        description: String,
        photos: String,
        rental_price: u64,
        deposit_amount: u64,
    ) -> Result<()> {
        crate::instructions::update_listing::handle_update_listing(
            ctx,
            description,
            photos,
            rental_price,
            deposit_amount,
        )
    }

    pub fn remove_listing(ctx: Context<RemoveListing>) -> Result<()> {
        crate::instructions::remove_listing::handle_remove_listing(ctx)
    }

    pub fn rent_item(ctx: Context<RentItem>, weeks: u16) -> Result<()> {
        crate::instructions::rent_item::handle_rent_item(ctx, weeks)
    }

    pub fn submit_phase1(
        ctx: Context<SubmitPhase1>,
        photos: String,
        tracking_number: String,
    ) -> Result<()> {
        crate::instructions::handover::handle_submit_phase1(ctx, photos, tracking_number)
    }

    pub fn submit_phase2(ctx: Context<SubmitPhase2>, photos: String) -> Result<()> {
        crate::instructions::handover::handle_submit_phase2(ctx, photos)
    }

    pub fn submit_phase3(
        ctx: Context<SubmitPhase3>,
        photos: String,
        tracking_number: String,
    ) -> Result<()> {
        crate::instructions::handover::handle_submit_phase3(ctx, photos, tracking_number)
    }

    pub fn submit_phase4(ctx: Context<SubmitPhase4>, photos: String) -> Result<()> {
        crate::instructions::handover::handle_submit_phase4(ctx, photos)
    }

    pub fn confirm_return(ctx: Context<ConfirmReturn>) -> Result<()> {
        crate::instructions::confirm_return::handle_confirm_return(ctx)
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        crate::instructions::claim_refund::handle_claim_refund(ctx)
    }

    pub fn flag_return_issue(ctx: Context<FlagReturnIssue>, reason: String) -> Result<()> {
        crate::instructions::dispute::handle_flag_return_issue(ctx, reason)
    }

    pub fn reject_on_arrival(
        ctx: Context<RejectOnArrival>,
        photos: String,
        reason: String,
    ) -> Result<()> {
        crate::instructions::dispute::handle_reject_on_arrival(ctx, photos, reason)
    }

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        owner_amount: u64,
        renter_amount: u64,
    ) -> Result<()> {
        crate::instructions::dispute::handle_resolve_dispute(ctx, owner_amount, renter_amount)
    }
}