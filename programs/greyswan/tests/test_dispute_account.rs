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
    // Verdict, appeal and outcome fields all start empty.
    assert_eq!(dispute.tier_count, 0);
    assert_eq!(dispute.verdict_posted_at, 0);
    assert_eq!(dispute.owner_bond + dispute.renter_bond, 0);
    assert_eq!(dispute.resolved_by, [Pubkey::default(); 2]);
    assert_eq!(dispute.reserved, [0u8; 193]);
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
fn resolve_dispute_marks_the_dispute_account_resolved() {
    // dispute-2b: resolve_dispute now closes out the Dispute account it
    // settles (previously it left it Open).
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    reject_on_arrival(&mut svm, rental, &renter).unwrap();
    warp(&mut svm, 100);

    // A full refund (more than the deposit back) needs a second reviewer.
    let second = add_reviewer(&mut svm, &admin);
    send(
        &mut svm,
        resolve_dispute_with_ix(
            listing,
            rental,
            admin.pubkey(),
            Some(second.pubkey()),
            owner.pubkey(),
            renter.pubkey(),
            0,
            TOTAL_HELD,
        ),
        &admin,
        &[&admin, &second],
    )
    .unwrap();
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Resolved);
    let dispute = read::<Dispute>(&svm, &dispute_pda(&rental));
    assert_eq!(dispute.status, DisputeStatus::Resolved);
    assert_eq!(dispute.resolved_by, [admin.pubkey(), second.pubkey()]);
    assert_eq!(dispute.resolved_at, START_TIME + 100);
}

#[test]
fn resolve_dispute_refuses_a_damage_dispute_with_a_dispute_account() {
    // dispute-2b: ReturnIssue disputes go through the verdict engine
    // (reviewer_resolve), which enforces the second reviewer for Major
    // damage and takes the platform fee. Previously this resolved it.
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    all_phases(&mut svm, rental, &owner, &renter);
    flag_return_issue(&mut svm, rental, &owner).unwrap();

    let result = send(
        &mut svm,
        resolve_dispute_ix(listing, rental, admin.pubkey(), owner.pubkey(), renter.pubkey(), TOTAL_HELD, 0),
        &admin,
        &[&admin],
    );
    assert_program_err(result, greyswan::error::ErrorCode::WrongDisputeKind);
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Disputed);
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

    // The migrated Config has no reviewers. A full refund needs a second
    // one, so one is added first (a deploy step).
    let second = Pubkey::new_unique();
    send_as(&mut svm, set_reviewers_ix(admin, vec![second]), admin).unwrap();

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
                dispute: common::dispute_pda(&rental),
                second_reviewer: Some(second),
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
