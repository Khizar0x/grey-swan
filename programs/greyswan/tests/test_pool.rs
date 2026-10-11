// The user-protection pool: init_pool and withdraw_pool. Forfeited bonds
// arriving in it are covered in test_verdict.rs.

mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, rent::Rent},
        Space,
    },
    common::*,
    greyswan::{error::ErrorCode, state::Pool},
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

fn withdraw_ix(admin: Pubkey, recipient: Pubkey, amount: u64) -> Instruction {
    ix(
        greyswan::instruction::WithdrawPool { amount },
        greyswan::accounts::WithdrawPool { config: config_pda(), pool: pool_pda(), recipient, admin },
    )
}

fn pool_rent() -> u64 {
    Rent::default().minimum_balance(8 + Pool::INIT_SPACE)
}

fn with_pool() -> (LiteSVM, Keypair) {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    init_pool(&mut svm, &admin);
    (svm, admin)
}

#[test]
fn admin_creates_the_pool_once() {
    let (mut svm, admin) = with_pool();
    let pool = read::<Pool>(&svm, &pool_pda());
    assert_eq!((pool.total_received, pool.total_withdrawn), (0, 0));
    assert_eq!(lamports(&svm, &pool_pda()), pool_rent());

    let err = send(&mut svm, init_pool_ix(admin.pubkey()), &admin, &[&admin]).unwrap_err();
    // System program AccountAlreadyInUse: it already exists.
    assert!(err.contains("Custom(0)"), "{err}");
}

#[test]
fn only_the_admin_can_create_the_pool() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let stranger = funded(&mut svm);
    let result = send(&mut svm, init_pool_ix(stranger.pubkey()), &stranger, &[&stranger]);
    assert_program_err(result, ErrorCode::NotAdmin);
    assert!(svm.get_account(&pool_pda()).is_none());
}

#[test]
fn admin_withdraws_to_a_user_but_never_below_rent() {
    let (mut svm, admin) = with_pool();
    // Stands in for forfeited bonds.
    svm.airdrop(&pool_pda(), 5_000_000).unwrap();
    let user = Pubkey::new_unique();

    let too_much = withdraw_ix(admin.pubkey(), user, 5_000_001);
    assert_program_err(send(&mut svm, too_much, &admin, &[&admin]), ErrorCode::PoolBalanceTooLow);

    send(&mut svm, withdraw_ix(admin.pubkey(), user, 3_000_000), &admin, &[&admin]).unwrap();
    assert_eq!(lamports(&svm, &user), 3_000_000);
    send(&mut svm, withdraw_ix(admin.pubkey(), user, 2_000_000), &admin, &[&admin]).unwrap();
    assert_eq!(lamports(&svm, &pool_pda()), pool_rent());
    assert_eq!(read::<Pool>(&svm, &pool_pda()).total_withdrawn, 5_000_000);

    let again = withdraw_ix(admin.pubkey(), user, 1);
    assert_program_err(send(&mut svm, again, &admin, &[&admin]), ErrorCode::PoolBalanceTooLow);
}

#[test]
fn only_the_admin_can_withdraw() {
    let (mut svm, _admin) = with_pool();
    svm.airdrop(&pool_pda(), 5_000_000).unwrap();
    let stranger = funded(&mut svm);
    let result = send(&mut svm, withdraw_ix(stranger.pubkey(), stranger.pubkey(), 1_000_000), &stranger, &[&stranger]);
    assert_program_err(result, ErrorCode::NotAdmin);
    assert_eq!(lamports(&svm, &pool_pda()), pool_rent() + 5_000_000);
}
