use anchor_lang::prelude::*;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(ctx: Context<InitConfig>, admin: Pubkey) -> Result<()> {
    // A fresh deployment starts at the current version, so it never needs
    // migrate_config.
    ctx.accounts
        .config
        .set_inner(Config::with_defaults(admin, ctx.bumps.config));
    Ok(())
}