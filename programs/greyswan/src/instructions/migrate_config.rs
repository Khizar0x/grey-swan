use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::constants::{CONFIG_SEED, CONFIG_VERSION, LEGACY_CONFIG_LEN};
use crate::error::ErrorCode;
use crate::state::Config;

// Grows the original 41-byte Config (discriminator + admin + bump) in place
// to the version 2 layout. The account can't be taken as Account<Config>
// because the legacy bytes don't deserialize as the new struct, so it's read
// raw and every check Account<> would have done is done by hand below.

#[derive(Accounts)]
pub struct MigrateConfig<'info> {
    /// CHECK: read as raw bytes. The seeds pin the address; the handler
    /// checks owner, discriminator, length, bump and admin before writing.
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_migrate_config(ctx: Context<MigrateConfig>) -> Result<()> {
    let config = ctx.accounts.config.to_account_info();
    require_keys_eq!(*config.owner, crate::ID, ErrorCode::InvalidConfigAccount);

    let (admin, bump) = {
        let data = config.try_borrow_data()?;
        require!(
            data.len() >= 8 && data[..8] == *Config::DISCRIMINATOR,
            ErrorCode::InvalidConfigAccount
        );
        // Byte 41 is `version` in the new layout and doesn't exist in the
        // legacy one, so length alone tells the two apart.
        if data.len() > LEGACY_CONFIG_LEN {
            require!(data[LEGACY_CONFIG_LEN] >= CONFIG_VERSION, ErrorCode::InvalidConfigAccount);
            return err!(ErrorCode::ConfigAlreadyMigrated);
        }
        require!(data.len() == LEGACY_CONFIG_LEN, ErrorCode::InvalidConfigAccount);
        let admin = Pubkey::try_from(&data[8..40]).map_err(|_| ErrorCode::InvalidConfigAccount)?;
        (admin, data[40])
    };

    require!(bump == ctx.bumps.config, ErrorCode::InvalidConfigAccount);
    require_keys_eq!(admin, ctx.accounts.admin.key(), ErrorCode::NotAdmin);

    // Top up rent for the larger size before resizing, paid by the admin.
    let new_len = 8 + Config::INIT_SPACE;
    let required = Rent::get()?.minimum_balance(new_len);
    let shortfall = required.saturating_sub(config.lamports());
    if shortfall > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program::ID,
                system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: config.clone(),
                },
            ),
            shortfall,
        )?;
    }
    config.resize(new_len)?;

    // Rewrites the discriminator (unchanged) and admin + bump (same values,
    // same offsets), then the new fields after them.
    let migrated = Config::with_defaults(admin, bump);
    let mut data = config.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = &mut data[..];
    migrated.try_serialize(&mut writer)?;

    msg!("Config migrated to version {}", CONFIG_VERSION);
    Ok(())
}
