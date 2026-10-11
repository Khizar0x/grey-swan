use anchor_lang::prelude::*;
use crate::constants::{CONFIG_SEED, POOL_SEED};
use crate::state::{Config, Pool};

// ---------- Admin creates the user-protection pool ----------

#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ crate::error::ErrorCode::NotAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_pool(ctx: Context<InitPool>) -> Result<()> {
    ctx.accounts.pool.bump = ctx.bumps.pool;
    Ok(())
}

// ---------- Admin pays a user out of the pool ----------

#[derive(Accounts)]
pub struct WithdrawPool<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ crate::error::ErrorCode::NotAdmin,
    )]
    pub config: Account<'info, Config>,

    #[account(mut, seeds = [POOL_SEED], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    /// CHECK: any account the admin chooses to compensate; only receives
    /// lamports.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub admin: Signer<'info>,
}

pub fn handle_withdraw_pool(ctx: Context<WithdrawPool>, amount: u64) -> Result<()> {
    let pool_info = ctx.accounts.pool.to_account_info();
    // The pool's own rent stays put, so it can't be closed by draining it.
    let rent = Rent::get()?.minimum_balance(pool_info.data_len());
    let available = pool_info.lamports().saturating_sub(rent);
    require!(amount <= available, crate::error::ErrorCode::PoolBalanceTooLow);

    **pool_info.try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.recipient.try_borrow_mut_lamports()? += amount;

    let pool = &mut ctx.accounts.pool;
    pool.total_withdrawn = pool
        .total_withdrawn
        .checked_add(amount)
        .ok_or(crate::error::ErrorCode::MathOverflow)?;
    Ok(())
}
