use anchor_lang::prelude::*;
use crate::state::{Category, Listing, RarityTier};

#[derive(Accounts)]
#[instruction(item_name: String)]
pub struct ListItem<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", owner.key().as_ref(), item_name.as_bytes()],
        bump
    )]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_list_item(
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
    require!(rental_price > 0, crate::error::ErrorCode::InvalidRentalPrice);
    require!(deposit_amount > 0, crate::error::ErrorCode::InvalidDepositAmount);
    require!(item_name.len() <= 50, crate::error::ErrorCode::ItemNameTooLong);
    require!(description.len() <= 1200, crate::error::ErrorCode::DescriptionTooLong);
    require!(photos.len() <= 200, crate::error::ErrorCode::PhotosLinkTooLong);

    // Deposit cap: only applies to Rare and Antique items
    if rarity_tier == RarityTier::Rare || rarity_tier == RarityTier::Antique {
        require!(estimated_value > 0, crate::error::ErrorCode::InvalidEstimatedValue);
        let max_allowed_deposit = estimated_value * 45 / 100;
        require!(
            deposit_amount <= max_allowed_deposit,
            crate::error::ErrorCode::DepositExceedsCap
        );
    }

    let listing = &mut ctx.accounts.listing;
    listing.owner = ctx.accounts.owner.key();
    listing.item_name = item_name;
    listing.description = description;
    listing.photos = photos;
    listing.rental_price = rental_price;
    listing.deposit_amount = deposit_amount;
    listing.estimated_value = estimated_value;
    listing.category = category;
    listing.rarity_tier = rarity_tier;
    listing.is_available = true;
    listing.bump = ctx.bumps.listing;

    Ok(())
}