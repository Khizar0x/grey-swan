// RentalTimeline and the phase 2 (arrival) deadline.

mod common;

use {
    anchor_lang::{prelude::Pubkey, solana_program::rent::Rent, Space},
    common::*,
    greyswan::{
        error::ErrorCode,
        instructions::ConfigUpdate,
        state::{HandoverPhase, Rental, RentalStatus, RentalTimeline},
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const DEFAULT_WINDOW: i64 = 432_000;

/// A rental the owner has just shipped, with a Config at default settings.
fn shipped() -> (LiteSVM, Keypair, Keypair, Keypair, Pubkey) {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    (svm, admin, owner, renter, rental)
}

fn phase(svm: &LiteSVM, rental: &Pubkey) -> HandoverPhase {
    read::<Rental>(svm, rental).current_phase
}

#[test]
fn phase1_creates_timeline_paid_by_owner() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    let owner_before = lamports(&svm, &owner.pubkey());

    phase1(&mut svm, rental, &owner).unwrap();

    let timeline = read::<RentalTimeline>(&svm, &timeline_pda(&rental));
    assert_eq!(timeline.rental, rental);
    assert_eq!(timeline.shipped_at, START_TIME);
    assert_eq!(timeline.reserved, [0u8; 64]);

    let size = 8 + RentalTimeline::INIT_SPACE;
    assert_eq!(size, 113);
    let rent = Rent::default().minimum_balance(size);
    assert_eq!(lamports(&svm, &owner.pubkey()), owner_before - rent - 5000);
}

#[test]
fn arrival_within_window_succeeds() {
    let (mut svm, _, _, renter, rental) = shipped();
    // The deadline itself is still inside the window.
    warp(&mut svm, DEFAULT_WINDOW);
    phase2(&mut svm, rental, &renter).unwrap();
    assert_eq!(phase(&svm, &rental), HandoverPhase::OnArrival);
}

#[test]
fn rejection_within_window_succeeds() {
    let (mut svm, _, _, renter, rental) = shipped();
    warp(&mut svm, DEFAULT_WINDOW - 60);
    reject_on_arrival(&mut svm, rental, &renter).unwrap();
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Disputed);
}

#[test]
fn arrival_and_rejection_after_window_are_rejected() {
    let (mut svm, _, _, renter, rental) = shipped();
    warp(&mut svm, DEFAULT_WINDOW + 1);

    assert_program_err(phase2(&mut svm, rental, &renter), ErrorCode::ArrivalWindowClosed);
    assert_program_err(reject_on_arrival(&mut svm, rental, &renter), ErrorCode::ArrivalWindowClosed);

    let state = read::<Rental>(&svm, &rental);
    assert_eq!(state.current_phase, HandoverPhase::BeforeSending);
    assert_eq!(state.status, RentalStatus::Active);
}

#[test]
fn deadline_is_read_from_config_at_check_time() {
    // The window comes from the current Config, not a value fixed when the
    // item shipped, so an admin change applies to rentals already in transit.
    let (mut svm, admin, _, renter, rental) = shipped();
    send(
        &mut svm,
        ix(
            greyswan::instruction::UpdateConfig {
                update: ConfigUpdate { phase2_deadline_secs: Some(2 * 86_400), ..Default::default() },
            },
            greyswan::accounts::UpdateConfig { config: config_pda(), admin: admin.pubkey() },
        ),
        &admin,
        &[&admin],
    )
    .unwrap();

    warp(&mut svm, 2 * 86_400 + 1);
    assert_program_err(phase2(&mut svm, rental, &renter), ErrorCode::ArrivalWindowClosed);
}

#[test]
fn renter_cannot_dodge_deadline_with_another_timeline_address() {
    let (mut svm, _, _, renter, rental) = shipped();
    warp(&mut svm, DEFAULT_WINDOW + 1);

    // Pass an address with nothing at it (it would look like a legacy
    // rental) instead of this rental's real timeline.
    let empty = Pubkey::new_unique();
    let result = send(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 {
                rental,
                timeline: empty,
                config: config_pda(),
                renter: renter.pubkey(),
            },
        ),
        &renter,
        &[&renter],
    );
    // anchor_lang ConstraintSeeds
    assert!(result.unwrap_err().contains("Custom(2006)"));
}

#[test]
fn prefunded_timeline_address_does_not_block_shipping() {
    // Anyone can send lamports to the timeline address before phase 1.
    // That must not stop the owner from shipping.
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    svm.airdrop(&timeline_pda(&rental), 1_000_000).unwrap();

    phase1(&mut svm, rental, &owner).unwrap();
    assert_eq!(read::<RentalTimeline>(&svm, &timeline_pda(&rental)).rental, rental);
}

// ---------- Legacy rentals (shipped before timelines existed) ----------

/// A real devnet rental, dumped read-only with `solana account
/// 5gTKMr7zK5WDfS4wwffGHbKx9TShBYnJaKf3d4Uz56xC --url devnet --output json`.
/// It is Active and at BeforeSending: shipped under the old program, so it
/// has no timeline. It shipped in September 2026, far outside any window.
fn legacy_shipped_rental() -> (LiteSVM, Pubkey, Pubkey) {
    let mut svm = devnet_svm();
    set_time(&mut svm, START_TIME + 60 * 86_400);
    init_test_config(&mut svm);
    let rental = load_fixture(
        &mut svm,
        include_str!("fixtures/devnet_legacy_shipped_rental.json"),
    );
    let state = read::<Rental>(&svm, &rental);
    assert_eq!(state.status, RentalStatus::Active);
    assert_eq!(state.current_phase, HandoverPhase::BeforeSending);
    assert!(svm.get_account(&timeline_pda(&rental)).is_none());
    svm.airdrop(&state.renter, 1_000_000_000).unwrap();
    (svm, rental, state.renter)
}

#[test]
fn legacy_rental_without_timeline_can_still_arrive() {
    let (mut svm, rental, renter) = legacy_shipped_rental();
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 {
                rental,
                timeline: timeline_pda(&rental),
                config: config_pda(),
                renter,
            },
        ),
        renter,
    )
    .unwrap();
    assert_eq!(phase(&svm, &rental), HandoverPhase::OnArrival);
}

#[test]
fn legacy_rental_without_timeline_can_still_be_rejected() {
    let (mut svm, rental, renter) = legacy_shipped_rental();
    send_as(&mut svm, reject_on_arrival_ix(rental, renter), renter).unwrap();
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Disputed);
}
