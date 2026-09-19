use anchor_lang::prelude::*;
use crate::state::Listing;

#[derive(Accounts)]
pub struct RemoveListing<'info> {
    // `close = owner` reclaims the listing's rent-exempt lamports back to
    // the owner and zeroes the account — but only takes effect if the
    // handler below returns Ok, so the ownership/availability checks still
    // gate it. Rental accounts are untouched: they only reference the
    // listing by pubkey, and never needed it to still exist to be read.
    #[account(mut, close = owner)]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

pub fn handle_remove_listing(ctx: Context<RemoveListing>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.listing.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotListingOwner,
    );

    // Reuses ListingNotAvailable ("This listing is not currently
    // available") — here read as "still rented, so it can't be removed".
    require!(
        ctx.accounts.listing.is_available,
        crate::error::ErrorCode::ListingNotAvailable
    );

    Ok(())
}
