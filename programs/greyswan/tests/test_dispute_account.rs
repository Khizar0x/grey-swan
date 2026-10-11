// The Dispute PDA opened by flag_return_issue and reject_on_arrival.

mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{rent::Rent, system_program},
        Space,
    },
    common::*,
    greyswan::state::{Dispute, DisputeKind, DisputeStatus, Listing, Rental, RentalStatus},
    solana_signer::Signer,
    std::str::FromStr,
};

fn dispute_rent() -> u64 {
    Rent::default().minimum_balance(8 + Dispute::INIT_SPACE)
}

#[test]
fn dispute_account_size() {
    assert_eq!(8 + Dispute::INIT_SPACE, 435);
}

#[test]
fn flag_return_issue_opens_dispute_paid_by_owner() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    all_phases(&mut svm, rental, &owner, &renter);
    warp(&mut svm, 100);

    let owner_before = lamports(&svm, &owner.pubkey());
    flag_return_issue(&mut svm, rental, &owner).unwrap();

    let dispute = read::<Dispute>(&svm, &dispute_pda(&rental));
    assert_eq!(dispute.rental, rental);
    assert_eq!(dispute.kind, DisputeKind::ReturnIssue);
    assert_eq!(dispute.opened_at, START_TIME + 100);
    assert_eq!(dispute.status, DisputeStatus::Open);
    assert_eq!(dispute.reserved, [0u8; 384]);
    assert_eq!(lamports(&svm, &owner.pubkey()), owner_before - dispute_rent() - 5000);

    // Existing behaviour on the rental itself is unchanged.
    let state = read::<Rental>(&svm, &rental);
    assert_eq!(state.status, RentalStatus::Disputed);
    assert_eq!(state.dispute_kind, DisputeKind::ReturnIssue);
    assert_eq!(state.disputed_at, dispute.opened_at);
}

#[test]
fn reject_on_arrival_opens_dispute_paid_by_renter() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();

    let renter_before = lamports(&svm, &renter.pubkey());
    reject_on_arrival(&mut svm, rental, &renter).unwrap();

    let dispute = read::<Dispute>(&svm, &dispute_pda(&rental));
    assert_eq!(dispute.rental, rental);
    assert_eq!(dispute.kind, DisputeKind::ArrivalIssue);
    assert_eq!(dispute.status, DisputeStatus::Open);
    assert_eq!(lamports(&svm, &renter.pubkey()), renter_before - dispute_rent() - 5000);
    assert_eq!(read::<Rental>(&svm, &rental).dispute_kind, DisputeKind::ArrivalIssue);
}

#[test]
fn resolve_dispute_leaves_dispute_account_open_for_now() {
    // resolve_dispute is deliberately unchanged in this phase; closing out
    // the Dispute account is dispute-2b's job.
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    all_phases(&mut svm, rental, &owner, &renter);
    flag_return_issue(&mut svm, rental, &owner).unwrap();

    send(
        &mut svm,
        ix(
            greyswan::instruction::ResolveDispute { owner_amount: TOTAL_HELD, renter_amount: 0 },
            greyswan::accounts::ResolveDispute {
                config: config_pda(),
                listing,
                rental,
                admin: admin.pubkey(),
                owner: owner.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            },
        ),
        &admin,
        &[&admin],
    )
    .unwrap();
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Resolved);
    assert_eq!(read::<Dispute>(&svm, &dispute_pda(&rental)).status, DisputeStatus::Open);
}

/// A real devnet rental disputed under the old program (no Dispute account)
/// can still be resolved after the upgrade and the Config migration.
/// Fixtures dumped read-only from devnet: the real Config, the rental
/// 77XystXvha8KtUvP7M95VV49WSroVR5zesBaK73fiXdw and its listing.
#[test]
fn legacy_devnet_dispute_without_dispute_account_still_resolves() {
    let mut svm = devnet_svm();
    set_time(&mut svm, START_TIME + 60 * 86_400);
    load_fixture(&mut svm, include_str!("fixtures/devnet_config.json"));
    let rental = load_fixture(&mut svm, include_str!("fixtures/devnet_legacy_disputed_rental.json"));
    let listing = load_fixture(&mut svm, include_str!("fixtures/devnet_legacy_disputed_listing.json"));

    let admin = Pubkey::from_str("76D6XPGqbxcrCddeLtfPLwG1ZfNMkveCpAtDSH3pzTb4").unwrap();
    svm.airdrop(&admin, 1_000_000_000).unwrap();
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::MigrateConfig {},
            greyswan::accounts::MigrateConfig { config: config_pda(), admin, system_program: system_program::ID },
        ),
        admin,
    )
    .unwrap();

    let state = read::<Rental>(&svm, &rental);
    assert_eq!(state.status, RentalStatus::Disputed);
    assert!(svm.get_account(&dispute_pda(&rental)).is_none());
    let held = state.total_rental_cost + state.deposit_amount;
    let renter_before = lamports(&svm, &state.renter);

    send_as(
        &mut svm,
        ix(
            greyswan::instruction::ResolveDispute { owner_amount: 0, renter_amount: held },
            greyswan::accounts::ResolveDispute {
                config: config_pda(),
                listing,
                rental,
                admin,
                owner: state.owner,
                renter: state.renter,
                system_program: system_program::ID,
            },
        ),
        admin,
    )
    .unwrap();

    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Resolved);
    assert!(read::<Listing>(&svm, &listing).is_available);
    assert_eq!(lamports(&svm, &state.renter), renter_before + held);
}
