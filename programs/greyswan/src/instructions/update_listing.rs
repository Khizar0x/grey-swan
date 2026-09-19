use anchor_lang::prelude::*;
use crate::state::{Listing, RarityTier};

#[derive(Accounts)]
pub struct UpdateListing<'info> {
    // realloc grows the account if it was created before description's cap
    // was raised (existing listings keep their original, smaller
    // allocation — Solana doesn't resize accounts automatically just
    // because a program upgrade changed a struct's max size). Targeting
    // the full current INIT_SPACE means the owner pays the one-time size
    // difference on their first edit after an upgrade like this one;
    // already-current-size listings get a same-size "realloc" that's a
    // no-op in practice.
    #[account(
        mut,
        realloc = 8 + Listing::INIT_SPACE,
        realloc::payer = owner,
        realloc::zero = false,
    )]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// Editable regardless of is_available — an owner should be able to fix a
// price or swap photos whether or not the item is currently out on rent.
// item_name, category, and rarity_tier are deliberately not editable here:
// item_name is baked into the listing's PDA seeds (changing it means a
// different account, not an edit), and category/rarity weren't asked for.
pub fn handle_update_listing(
    ctx: Context<UpdateListing>,
    description: String,
    photos: String,
    rental_price: u64,
    deposit_amount: u64,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.listing.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotListingOwner,
    );

    require!(rental_price > 0, crate::error::ErrorCode::InvalidRentalPrice);
    require!(deposit_amount > 0, crate::error::ErrorCode::InvalidDepositAmount);
    require!(description.len() <= 1200, crate::error::ErrorCode::DescriptionTooLong);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);

    // Same deposit cap as list_item, re-checked against the listing's
    // existing estimated_value (not editable here, so no need to re-pass it).
    let rarity_tier = ctx.accounts.listing.rarity_tier;
    let estimated_value = ctx.accounts.listing.estimated_value;
    if rarity_tier == RarityTier::Rare || rarity_tier == RarityTier::Antique {
        let max_allowed_deposit = estimated_value * 45 / 100;
        require!(
            deposit_amount <= max_allowed_deposit,
            crate::error::ErrorCode::DepositExceedsCap
        );
    }

    let listing = &mut ctx.accounts.listing;
    listing.description = description;
    listing.photos = photos;
    listing.rental_price = rental_price;
    listing.deposit_amount = deposit_amount;

    Ok(())
}
