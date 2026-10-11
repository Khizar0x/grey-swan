// Timeout exits after the item has arrived: flag_not_returned (owner, when
// the renter keeps the item), complete_after_inspection_deadline (renter,
// when the owner never checks the returned item) and admin_open_dispute.

mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, rent::Rent, system_program},
        Space,
    },
    common::*,
    greyswan::{
        error::ErrorCode,
        state::{Dispute, DisputeKind, DisputeStatus, HandoverPhase, Listing, Rental, RentalStatus},
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const DAY: i64 = 86_400;
const WEEK: i64 = 7 * DAY;
const ARRIVAL_WINDOW: i64 = 5 * DAY;
const GRACE: i64 = 3 * DAY;

struct Rented {
    svm: LiteSVM,
    admin: Keypair,
    owner: Keypair,
    renter: Keypair,
    listing: Pubkey,
    rental: Pubkey,
}

/// A rental that has been shipped (phase 1) and received (phase 2), both at
/// START_TIME, with a Config at default settings.
fn arrived() -> Rented {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    phase2(&mut svm, rental, &renter).unwrap();
    Rented { svm, admin, owner, renter, listing, rental }
}

fn state(svm: &LiteSVM, rental: &Pubkey) -> Rental {
    read::<Rental>(svm, rental)
}

// ---------- flag_not_returned ----------

/// Return date for a rental received at START_TIME, plus the default grace.
const OVERDUE_AT: i64 = START_TIME + WEEKS as i64 * WEEK + GRACE;

fn flag_not_returned_ix(rental: Pubkey, owner: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::FlagNotReturned {},
        greyswan::accounts::FlagNotReturned {
            rental,
            timeline: timeline_pda(&rental),
            config: config_pda(),
            dispute: dispute_pda(&rental),
            owner,
            system_program: system_program::ID,
        },
    )
}

fn flag_not_returned(svm: &mut LiteSVM, rental: Pubkey, signer: &Keypair) -> Result<(), String> {
    send(svm, flag_not_returned_ix(rental, signer.pubkey()), signer, &[signer])
}

#[test]
fn not_returned_after_grace_opens_dispute_that_resolve_settles() {
    let Rented { mut svm, admin, owner, renter, listing, rental } = arrived();
    set_time(&mut svm, OVERDUE_AT + 1);
    let owner_before = lamports(&svm, &owner.pubkey());

    flag_not_returned(&mut svm, rental, &owner).unwrap();

    let s = state(&svm, &rental);
    assert_eq!(s.status, RentalStatus::Disputed);
    assert_eq!(s.dispute_kind, DisputeKind::NotReturned);
    assert_eq!(s.disputed_at, OVERDUE_AT + 1);
    let dispute = read::<Dispute>(&svm, &dispute_pda(&rental));
    assert_eq!(dispute.rental, rental);
    assert_eq!(dispute.kind, DisputeKind::NotReturned);
    assert_eq!(dispute.status, DisputeStatus::Open);
    let dispute_rent = Rent::default().minimum_balance(8 + Dispute::INIT_SPACE);
    assert_eq!(lamports(&svm, &owner.pubkey()), owner_before - dispute_rent - 5000);

    // A reviewer settles it with the existing resolve_dispute.
    let owner_before = lamports(&svm, &owner.pubkey());
    let renter_before = lamports(&svm, &renter.pubkey());
    send(
        &mut svm,
        resolve_dispute_ix(listing, rental, admin.pubkey(), owner.pubkey(), renter.pubkey(), TOTAL_HELD, 0),
        &admin,
        &[&admin],
    )
    .unwrap();
    assert_eq!(state(&svm, &rental).status, RentalStatus::Resolved);
    assert_eq!(lamports(&svm, &owner.pubkey()), owner_before + TOTAL_HELD);
    assert_eq!(lamports(&svm, &renter.pubkey()), renter_before);
    assert!(read::<Listing>(&svm, &listing).is_available);
}

#[test]
fn not_returned_rejected_before_and_at_the_grace_deadline() {
    let Rented { mut svm, owner, rental, .. } = arrived();
    // On the return date itself, and inside the grace period.
    set_time(&mut svm, START_TIME + WEEKS as i64 * WEEK);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::ReturnWindowStillOpen);
    set_time(&mut svm, OVERDUE_AT - 1);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::ReturnWindowStillOpen);
    // At the deadline itself the renter still has time.
    set_time(&mut svm, OVERDUE_AT);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::ReturnWindowStillOpen);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
    assert!(svm.get_account(&dispute_pda(&rental)).is_none());
}

#[test]
fn not_returned_rejected_for_anyone_but_the_owner() {
    let Rented { mut svm, renter, rental, .. } = arrived();
    let stranger = funded(&mut svm);
    set_time(&mut svm, OVERDUE_AT + 1);
    assert_program_err(flag_not_returned(&mut svm, rental, &renter), ErrorCode::NotOwnerForPhase);
    assert_program_err(flag_not_returned(&mut svm, rental, &stranger), ErrorCode::NotOwnerForPhase);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
}

#[test]
fn not_returned_rejected_once_the_renter_has_sent_it_back() {
    let Rented { mut svm, owner, renter, rental, .. } = arrived();
    // Late, but sent: the owner's remedy is now on return (phase 4).
    set_time(&mut svm, OVERDUE_AT + 1);
    phase3(&mut svm, rental, &renter).unwrap();
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::PhaseOutOfOrder);
}

#[test]
fn not_returned_rejected_before_the_renter_has_the_item() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    set_time(&mut svm, OVERDUE_AT + 1);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::PhaseOutOfOrder);
}

#[test]
fn not_returned_rejected_when_already_disputed() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    reject_on_arrival(&mut svm, rental, &renter).unwrap();
    set_time(&mut svm, OVERDUE_AT + 1);
    // The rental already has its one Dispute PDA, so creating it again fails
    // (system program AccountAlreadyInUse) before the status check is reached.
    let err = flag_not_returned(&mut svm, rental, &owner).unwrap_err();
    assert!(err.contains("Custom(0)"), "{err}");
    assert_eq!(state(&svm, &rental).dispute_kind, DisputeKind::ArrivalIssue);
}

#[test]
fn not_returned_counts_from_forced_arrival_at_the_missed_deadline() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    // The owner confirms arrival four days after the renter's window closed.
    set_time(&mut svm, START_TIME + ARRIVAL_WINDOW + 4 * DAY);
    confirm_after_deadline(&mut svm, rental, &owner).unwrap();

    // The period ran from the missed deadline, not the call.
    let overdue_at = START_TIME + ARRIVAL_WINDOW + WEEKS as i64 * WEEK + GRACE;
    set_time(&mut svm, overdue_at);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::ReturnWindowStillOpen);
    set_time(&mut svm, overdue_at + 1);
    flag_not_returned(&mut svm, rental, &owner).unwrap();
    assert_eq!(state(&svm, &rental).dispute_kind, DisputeKind::NotReturned);
}

#[test]
fn not_returned_unavailable_for_legacy_rental_without_timeline() {
    // No timeline means no return date; admin_open_dispute is the exit.
    let (mut svm, rental, renter) = legacy_shipped_rental();
    let owner = state(&svm, &rental).owner;
    svm.airdrop(&owner, 1_000_000_000).unwrap();
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 { rental, timeline: timeline_pda(&rental), renter },
        ),
        renter,
    )
    .unwrap();
    assert_eq!(state(&svm, &rental).current_phase, HandoverPhase::OnArrival);
    warp(&mut svm, 365 * DAY);
    let err = send_as(&mut svm, flag_not_returned_ix(rental, owner), owner).unwrap_err();
    // anchor_lang AccountNotInitialized
    assert!(err.contains("Custom(3012)"), "{err}");
}
