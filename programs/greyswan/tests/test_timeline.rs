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
    assert_eq!(timeline.arrival_deadline, START_TIME + DEFAULT_WINDOW);
    assert_eq!(timeline.reserved, [0u8; 56]);

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

fn set_phase2_window(svm: &mut LiteSVM, admin: &Keypair, seconds: i64) {
    send(
        svm,
        ix(
            greyswan::instruction::UpdateConfig {
                update: ConfigUpdate { phase2_deadline_secs: Some(seconds), ..Default::default() },
            },
            greyswan::accounts::UpdateConfig { config: config_pda(), admin: admin.pubkey() },
        ),
        admin,
        &[admin],
    )
    .unwrap();
}

#[test]
fn deadline_is_fixed_when_shipped() {
    // The window is copied into the timeline at phase 1, so a later Config
    // change doesn't move the deadline for items already in transit.
    let (mut svm, admin, owner, renter, in_transit) = shipped();
    set_phase2_window(&mut svm, &admin, 2 * 86_400);

    // Shipped before the change: still gets the original 5 days.
    warp(&mut svm, 2 * 86_400 + 1);
    phase2(&mut svm, in_transit, &renter).unwrap();

    // Shipped after the change: gets the new 2 days.
    let listing = list_item(&mut svm, &owner, "Fender Strat");
    let later = rent(&mut svm, listing, &renter);
    phase1(&mut svm, later, &owner).unwrap();
    let timeline = read::<RentalTimeline>(&svm, &timeline_pda(&later));
    assert_eq!(timeline.arrival_deadline, timeline.shipped_at + 2 * 86_400);
    warp(&mut svm, 2 * 86_400 + 1);
    assert_program_err(phase2(&mut svm, later, &renter), ErrorCode::ArrivalWindowClosed);
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

// ---------- confirm_arrival_after_deadline ----------

fn confirm_after_deadline_ix(rental: Pubkey, owner: Pubkey) -> anchor_lang::solana_program::instruction::Instruction {
    ix(
        greyswan::instruction::ConfirmArrivalAfterDeadline {},
        greyswan::accounts::ConfirmArrivalAfterDeadline { rental, timeline: timeline_pda(&rental), owner },
    )
}

fn confirm_after_deadline(svm: &mut LiteSVM, rental: Pubkey, signer: &Keypair) -> Result<(), String> {
    send(svm, confirm_after_deadline_ix(rental, signer.pubkey()), signer, &[signer])
}

#[test]
fn owner_confirms_arrival_after_deadline_and_rental_completes() {
    let (mut svm, _, owner, renter, rental) = shipped();
    warp(&mut svm, DEFAULT_WINDOW + 1);

    confirm_after_deadline(&mut svm, rental, &owner).unwrap();
    let state = read::<Rental>(&svm, &rental);
    assert_eq!(state.current_phase, HandoverPhase::OnArrival);
    assert_eq!(state.status, RentalStatus::Active);
    assert_eq!(state.phase2_photos, "");

    // The rest of the rental runs normally.
    phase3(&mut svm, rental, &renter).unwrap();
    phase4(&mut svm, rental, &owner).unwrap();
    send(
        &mut svm,
        ix(
            greyswan::instruction::ConfirmReturn {},
            greyswan::accounts::ConfirmReturn {
                listing: state.listing,
                rental,
                owner: owner.pubkey(),
                renter: renter.pubkey(),
                platform_wallet: greyswan::PLATFORM_WALLET,
                system_program: anchor_lang::solana_program::system_program::ID,
            },
        ),
        &owner,
        &[&owner],
    )
    .unwrap();
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Completed);
}

#[test]
fn confirm_after_deadline_rejected_before_it_passes() {
    let (mut svm, _, owner, _, rental) = shipped();
    assert_program_err(confirm_after_deadline(&mut svm, rental, &owner), ErrorCode::ArrivalWindowStillOpen);
    // At the deadline itself the renter still has time.
    warp(&mut svm, DEFAULT_WINDOW);
    assert_program_err(confirm_after_deadline(&mut svm, rental, &owner), ErrorCode::ArrivalWindowStillOpen);
    assert_eq!(phase(&svm, &rental), HandoverPhase::BeforeSending);
}

#[test]
fn confirm_after_deadline_rejected_for_non_owner() {
    let (mut svm, _, _, renter, rental) = shipped();
    let stranger = funded(&mut svm);
    warp(&mut svm, DEFAULT_WINDOW + 1);
    assert_program_err(confirm_after_deadline(&mut svm, rental, &renter), ErrorCode::NotOwnerForPhase);
    assert_program_err(confirm_after_deadline(&mut svm, rental, &stranger), ErrorCode::NotOwnerForPhase);
    assert_eq!(phase(&svm, &rental), HandoverPhase::BeforeSending);
}

#[test]
fn confirm_after_deadline_rejected_if_renter_already_confirmed() {
    let (mut svm, _, owner, renter, rental) = shipped();
    phase2(&mut svm, rental, &renter).unwrap();
    warp(&mut svm, DEFAULT_WINDOW + 1);
    assert_program_err(confirm_after_deadline(&mut svm, rental, &owner), ErrorCode::PhaseOutOfOrder);
    assert_eq!(read::<Rental>(&svm, &rental).phase2_photos, "ipfs://QmPhase2");
}

#[test]
fn confirm_after_deadline_rejected_if_renter_rejected() {
    let (mut svm, _, owner, renter, rental) = shipped();
    reject_on_arrival(&mut svm, rental, &renter).unwrap();
    warp(&mut svm, DEFAULT_WINDOW + 1);
    assert_program_err(confirm_after_deadline(&mut svm, rental, &owner), ErrorCode::InvalidRentalStatus);
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Disputed);
}

#[test]
fn confirm_after_deadline_not_available_for_legacy_rental() {
    // No timeline means no deadline, so there is nothing to have missed.
    let (mut svm, rental, _) = legacy_shipped_rental();
    let owner = read::<Rental>(&svm, &rental).owner;
    let err = send_as(&mut svm, confirm_after_deadline_ix(rental, owner), owner).unwrap_err();
    // anchor_lang AccountNotInitialized
    assert!(err.contains("Custom(3012)"), "got {err}");
    assert_eq!(phase(&svm, &rental), HandoverPhase::BeforeSending);
}
