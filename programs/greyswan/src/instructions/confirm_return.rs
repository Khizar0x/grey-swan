use anchor_lang::prelude::*;
use crate::constants::{PLATFORM_FEE_PERCENT, PLATFORM_WALLET};
use crate::state::{HandoverPhase, Listing, Rental, RentalStatus};

#[derive(Accounts)]
pub struct ConfirmReturn<'info> {
    #[account(mut)]
    pub listing: Account<'info, Listing>,

    #[account(mut)]
    pub rental: Account<'info, Rental>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: verified against rental.renter in the handler
    #[account(mut)]
    pub renter: UncheckedAccount<'info>,

    /// CHECK: verified against the hardcoded PLATFORM_WALLET constant
    #[account(mut, address = PLATFORM_WALLET)]
    pub platform_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_confirm_return(ctx: Context<ConfirmReturn>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.rental.owner,
        ctx.accounts.owner.key(),
        crate::error::ErrorCode::NotListingOwner,
    );

    require_keys_eq!(
        ctx.accounts.rental.renter,
        ctx.accounts.renter.key(),
        crate::error::ErrorCode::NotListingOwner,
    );

    require!(
        ctx.accounts.rental.status == RentalStatus::Active,
        crate::error::ErrorCode::InvalidRentalStatus,
    );

    require!(
        ctx.accounts.rental.current_phase == HandoverPhase::OnReturn,
        crate::error::ErrorCode::HandoverIncomplete,
    );

    let total_rental_cost = ctx.accounts.rental.total_rental_cost;
    let deposit_amount = ctx.accounts.rental.deposit_amount;

    let platform_fee = total_rental_cost
        .checked_mul(PLATFORM_FEE_PERCENT)
        .ok_or(crate::error::ErrorCode::MathOverflow)?
        / 100;

    let owner_payout = total_rental_cost
        .checked_sub(platform_fee)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;

    let rental_info = ctx.accounts.rental.to_account_info();
    let owner_info = ctx.accounts.owner.to_account_info();
    let renter_info = ctx.accounts.renter.to_account_info();
    let platform_info = ctx.accounts.platform_wallet.to_account_info();

    **rental_info.try_borrow_mut_lamports()? -= owner_payout;
    **owner_info.try_borrow_mut_lamports()? += owner_payout;

    **rental_info.try_borrow_mut_lamports()? -= platform_fee;
    **platform_info.try_borrow_mut_lamports()? += platform_fee;

    **rental_info.try_borrow_mut_lamports()? -= deposit_amount;
    **renter_info.try_borrow_mut_lamports()? += deposit_amount;

    ctx.accounts.rental.status = RentalStatus::Completed;
    ctx.accounts.listing.is_available = true;

    Ok(())
}