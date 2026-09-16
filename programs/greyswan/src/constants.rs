use anchor_lang::prelude::*;

pub const COUNTER_SEED: &[u8] = b"counter";

pub const HELLO_WORLD_LAMPORTS: u64 = 1;

pub const MAX_COUNT: u64 = 10;

pub const PLATFORM_FEE_PERCENT: u64 = 10;

pub const PLATFORM_WALLET: Pubkey = pubkey!("32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD");

pub const AUTO_REFUND_TIMEOUT_SECONDS: i64 = 7 * 24 * 60 * 60;

pub const MIN_RENTAL_WEEKS: u16 = 1;

pub const MAX_RENTAL_WEEKS: u16 = 12;

pub const MAX_DISPUTE_REASON_LEN: usize = 300;