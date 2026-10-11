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
        instructions::ConfigUpdate,
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

fn set_grace(svm: &mut LiteSVM, admin: &Keypair, seconds: i64) {
    send(
        svm,
        ix(
            greyswan::instruction::UpdateConfig {
                update: ConfigUpdate { not_returned_grace_secs: Some(seconds), ..Default::default() },
            },
            greyswan::accounts::UpdateConfig { config: config_pda(), admin: admin.pubkey() },
        ),
        admin,
        &[admin],
    )
    .unwrap();
}

#[test]
fn grace_change_after_arrival_does_not_move_the_not_returned_date() {
    let Rented { mut svm, admin, owner, rental, .. } = arrived();
    // Received under the 3-day grace; the admin then lengthens it to 10.
    set_grace(&mut svm, &admin, 10 * DAY);
    set_time(&mut svm, OVERDUE_AT);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::ReturnWindowStillOpen);
    set_time(&mut svm, OVERDUE_AT + 1);
    flag_not_returned(&mut svm, rental, &owner).unwrap();
}

#[test]
fn grace_change_before_arrival_applies_to_that_rental() {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    phase1(&mut svm, rental, &owner).unwrap();
    // Changed while in transit: arrival is when the date is fixed.
    set_grace(&mut svm, &admin, 10 * DAY);
    phase2(&mut svm, rental, &renter).unwrap();

    let overdue_at = START_TIME + WEEKS as i64 * WEEK + 10 * DAY;
    set_time(&mut svm, overdue_at);
    assert_program_err(flag_not_returned(&mut svm, rental, &owner), ErrorCode::ReturnWindowStillOpen);
    set_time(&mut svm, overdue_at + 1);
    flag_not_returned(&mut svm, rental, &owner).unwrap();
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
            greyswan::accounts::SubmitPhase2 { rental, timeline: timeline_pda(&rental), config: config_pda(), renter },
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

// ---------- complete_after_inspection_deadline ----------

const INSPECTION: i64 = 7 * DAY;

fn complete_ix(listing: Pubkey, rental: Pubkey, owner: Pubkey, renter: Pubkey, platform_wallet: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::CompleteAfterInspectionDeadline {},
        greyswan::accounts::CompleteAfterInspectionDeadline {
            listing,
            rental,
            timeline: timeline_pda(&rental),
            owner,
            renter,
            platform_wallet,
            system_program: system_program::ID,
        },
    )
}

fn complete(svm: &mut LiteSVM, listing: Pubkey, rental: Pubkey, owner: &Keypair, signer: &Keypair) -> Result<(), String> {
    send(
        svm,
        complete_ix(listing, rental, owner.pubkey(), signer.pubkey(), greyswan::PLATFORM_WALLET),
        signer,
        &[signer],
    )
}

fn confirm_return_ix(listing: Pubkey, rental: Pubkey, owner: Pubkey, renter: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::ConfirmReturn {},
        greyswan::accounts::ConfirmReturn {
            listing,
            rental,
            owner,
            renter,
            platform_wallet: greyswan::PLATFORM_WALLET,
            system_program: system_program::ID,
        },
    )
}

/// An arrived() rental the renter sent back at START_TIME, so its
/// inspection deadline is START_TIME + 7 days.
fn sent_back() -> Rented {
    let mut r = arrived();
    phase3(&mut r.svm, r.rental, &r.renter).unwrap();
    r
}

#[test]
fn completes_after_the_inspection_deadline() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    complete(&mut svm, listing, rental, &owner, &renter).unwrap();
    assert_eq!(state(&svm, &rental).status, RentalStatus::Completed);
    assert!(read::<Listing>(&svm, &listing).is_available);
}

#[test]
fn completes_when_owner_logged_the_return_but_went_silent() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    complete(&mut svm, listing, rental, &owner, &renter).unwrap();
    assert_eq!(state(&svm, &rental).status, RentalStatus::Completed);
}

#[test]
fn completion_rejected_before_and_at_the_inspection_deadline() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    set_time(&mut svm, START_TIME + INSPECTION - 1);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::InspectionWindowStillOpen);
    // At the deadline itself the owner still has time.
    set_time(&mut svm, START_TIME + INSPECTION);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::InspectionWindowStillOpen);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
}

#[test]
fn completion_rejected_for_anyone_but_the_renter() {
    let Rented { mut svm, owner, listing, rental, .. } = sent_back();
    let stranger = funded(&mut svm);
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &owner), ErrorCode::NotRenterForPhase);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &stranger), ErrorCode::NotRenterForPhase);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
}

#[test]
fn completion_rejected_before_the_item_is_sent_back() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = arrived();
    set_time(&mut svm, START_TIME + 365 * DAY);
    // Phase 3 not done, so there is no inspection to have missed.
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::PhaseOutOfOrder);
}

#[test]
fn completion_rejected_after_owner_flags_a_problem() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    flag_return_issue(&mut svm, rental, &owner).unwrap();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::InvalidRentalStatus);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Disputed);
}

#[test]
fn completion_rejected_after_owner_confirms_and_cannot_pay_twice() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    send(&mut svm, confirm_return_ix(listing, rental, owner.pubkey(), renter.pubkey()), &owner, &[&owner])
        .unwrap();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::InvalidRentalStatus);

    // And a timed-out completion can't be repeated either.
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    complete(&mut svm, listing, rental, &owner, &renter).unwrap();
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::InvalidRentalStatus);
}

#[test]
fn completion_rejects_substituted_accounts() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    let other_listing = list_item(&mut svm, &owner, "Fender Strat");
    let stranger = funded(&mut svm);
    let renter_key = renter.pubkey();

    let wrong_listing = complete_ix(other_listing, rental, owner.pubkey(), renter_key, greyswan::PLATFORM_WALLET);
    assert_program_err(send(&mut svm, wrong_listing, &renter, &[&renter]), ErrorCode::ListingMismatch);

    let wrong_owner = complete_ix(listing, rental, stranger.pubkey(), renter_key, greyswan::PLATFORM_WALLET);
    assert_program_err(send(&mut svm, wrong_owner, &renter, &[&renter]), ErrorCode::NotListingOwner);

    let wrong_platform = complete_ix(listing, rental, owner.pubkey(), renter_key, stranger.pubkey());
    let err = send(&mut svm, wrong_platform, &renter, &[&renter]).unwrap_err();
    // anchor_lang ConstraintAddress
    assert!(err.contains("Custom(2012)"), "{err}");

    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
}

#[test]
fn completion_pays_out_exactly_like_confirm_return() {
    // Two identical rentals of the same owner's items by the same renter:
    // one confirmed by the owner, one completed by the renter after the
    // inspection deadline. A separate fee payer keeps fees out of the sums.
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter, fee_payer) = (funded(&mut svm), funded(&mut svm), funded(&mut svm));
    let listing_a = list_item(&mut svm, &owner, "Canon R5");
    let listing_b = list_item(&mut svm, &owner, "Canon R6");
    let rental_a = rent(&mut svm, listing_a, &renter);
    let rental_b = rent(&mut svm, listing_b, &renter);
    all_phases(&mut svm, rental_a, &owner, &renter);
    all_phases(&mut svm, rental_b, &owner, &renter);
    set_time(&mut svm, START_TIME + INSPECTION + 1);

    let balances = |svm: &LiteSVM, rental: &Pubkey| {
        [
            lamports(svm, &owner.pubkey()),
            lamports(svm, &renter.pubkey()),
            lamports(svm, &greyswan::PLATFORM_WALLET),
            lamports(svm, rental),
        ]
    };
    let delta = |before: [u64; 4], after: [u64; 4]| -> [i128; 4] {
        std::array::from_fn(|i| after[i] as i128 - before[i] as i128)
    };

    let before = balances(&svm, &rental_a);
    send(
        &mut svm,
        confirm_return_ix(listing_a, rental_a, owner.pubkey(), renter.pubkey()),
        &fee_payer,
        &[&fee_payer, &owner],
    )
    .unwrap();
    let confirmed = delta(before, balances(&svm, &rental_a));

    let before = balances(&svm, &rental_b);
    send(
        &mut svm,
        complete_ix(listing_b, rental_b, owner.pubkey(), renter.pubkey(), greyswan::PLATFORM_WALLET),
        &fee_payer,
        &[&fee_payer, &renter],
    )
    .unwrap();
    let timed_out = delta(before, balances(&svm, &rental_b));

    assert_eq!(confirmed, timed_out);
    let rental_fee = (WEEKLY_PRICE * WEEKS as u64) as i128;
    let platform_fee = rental_fee / 10;
    assert_eq!(timed_out, [rental_fee - platform_fee, DEPOSIT as i128, platform_fee, -(TOTAL_HELD as i128)]);

    for (rental, listing) in [(rental_a, listing_a), (rental_b, listing_b)] {
        assert_eq!(state(&svm, &rental).status, RentalStatus::Completed);
        assert!(read::<Listing>(&svm, &listing).is_available);
    }
}

#[test]
fn completion_unavailable_for_legacy_rental_without_timeline() {
    let (mut svm, rental, renter) = legacy_shipped_rental();
    let s = state(&svm, &rental);
    stand_in_listing(&mut svm, &s);
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 { rental, timeline: timeline_pda(&rental), config: config_pda(), renter },
        ),
        renter,
    )
    .unwrap();
    phase3_as(&mut svm, rental, renter);
    warp(&mut svm, 365 * DAY);
    let err = send_as(&mut svm, complete_ix(s.listing, rental, s.owner, renter, greyswan::PLATFORM_WALLET), renter)
        .unwrap_err();
    // anchor_lang AccountNotInitialized: the listing is there (a stand-in),
    // so it's the missing timeline that stops it.
    assert!(err.contains("Custom(3012)"), "{err}");
}

fn phase3_as(svm: &mut LiteSVM, rental: Pubkey, renter: Pubkey) {
    send_as(
        svm,
        ix(
            greyswan::instruction::SubmitPhase3 {
                photos: "ipfs://QmPhase3".to_string(),
                tracking_number: "RM987654321GB".to_string(),
            },
            greyswan::accounts::SubmitPhase3 { rental, timeline: timeline_pda(&rental), config: config_pda(), renter },
        ),
        renter,
    )
    .unwrap();
}

// ---------- admin_open_dispute ----------

fn admin_open_ix(rental: Pubkey, admin: Pubkey, reason: &str) -> Instruction {
    ix(
        greyswan::instruction::AdminOpenDispute { reason: reason.to_string() },
        greyswan::accounts::AdminOpenDispute {
            config: config_pda(),
            rental,
            dispute: dispute_pda(&rental),
            admin,
            system_program: system_program::ID,
        },
    )
}

fn admin_open(svm: &mut LiteSVM, rental: Pubkey, signer: &Keypair, reason: &str) -> Result<(), String> {
    send(svm, admin_open_ix(rental, signer.pubkey(), reason), signer, &[signer])
}

#[test]
fn admin_can_open_a_dispute_at_every_active_phase() {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let dispute_rent = Rent::default().minimum_balance(8 + Dispute::INIT_SPACE);

    // Steps to bring a fresh rental to each phase before the admin steps in.
    let steps: [&dyn Fn(&mut LiteSVM, Pubkey); 5] = [
        &|_, _| {},
        &|svm, r| phase1(svm, r, &owner).unwrap(),
        &|svm, r| {
            phase1(svm, r, &owner).unwrap();
            phase2(svm, r, &renter).unwrap();
        },
        &|svm, r| {
            phase1(svm, r, &owner).unwrap();
            phase2(svm, r, &renter).unwrap();
            phase3(svm, r, &renter).unwrap();
        },
        &|svm, r| all_phases(svm, r, &owner, &renter),
    ];
    for (i, step) in steps.iter().enumerate() {
        let listing = list_item(&mut svm, &owner, &format!("Item {i}"));
        let rental = rent(&mut svm, listing, &renter);
        step(&mut svm, rental);

        let admin_before = lamports(&svm, &admin.pubkey());
        admin_open(&mut svm, rental, &admin, "Owner reports no contact for three weeks").unwrap();

        let s = state(&svm, &rental);
        assert_eq!(s.status, RentalStatus::Disputed, "phase step {i}");
        assert_eq!(s.dispute_kind, DisputeKind::AdminOpened);
        assert_eq!(s.dispute_reason, "Owner reports no contact for three weeks");
        let dispute = read::<Dispute>(&svm, &dispute_pda(&rental));
        assert_eq!(dispute.kind, DisputeKind::AdminOpened);
        assert_eq!(dispute.status, DisputeStatus::Open);
        assert_eq!(lamports(&svm, &admin.pubkey()), admin_before - dispute_rent - 5000);
    }
}

#[test]
fn admin_open_dispute_rejected_for_anyone_but_the_admin() {
    let Rented { mut svm, owner, renter, rental, .. } = arrived();
    let stranger = funded(&mut svm);
    for signer in [&owner, &renter, &stranger] {
        assert_program_err(admin_open(&mut svm, rental, signer, "Stuck"), ErrorCode::NotAdmin);
    }
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
    assert!(svm.get_account(&dispute_pda(&rental)).is_none());
}

#[test]
fn admin_open_dispute_requires_a_reason_within_the_limit() {
    let Rented { mut svm, admin, rental, .. } = arrived();
    assert_program_err(admin_open(&mut svm, rental, &admin, ""), ErrorCode::DisputeReasonRequired);
    assert_program_err(admin_open(&mut svm, rental, &admin, &"x".repeat(301)), ErrorCode::DisputeReasonTooLong);
    admin_open(&mut svm, rental, &admin, &"x".repeat(300)).unwrap();
}

#[test]
fn admin_open_dispute_rejected_once_the_rental_is_over() {
    let Rented { mut svm, admin, owner, renter, listing, rental } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    send(&mut svm, confirm_return_ix(listing, rental, owner.pubkey(), renter.pubkey()), &owner, &[&owner]).unwrap();
    assert_program_err(admin_open(&mut svm, rental, &admin, "Too late"), ErrorCode::InvalidRentalStatus);
}

#[test]
fn admin_open_dispute_rejected_on_real_legacy_disputed_rental() {
    // Already Disputed under the old program, with no Dispute PDA, so it's
    // the status check (not the PDA already existing) that stops it.
    let mut svm = devnet_svm();
    let admin = migrated_devnet_config(&mut svm);
    let rental = load_fixture(&mut svm, include_str!("fixtures/devnet_legacy_disputed_rental.json"));
    let err = send_as(&mut svm, admin_open_ix(rental, admin, "Already open"), admin);
    assert_program_err(err, ErrorCode::InvalidRentalStatus);
}

/// Loads the real devnet Config and migrates it, as the upgrade will.
/// Returns the real devnet admin (signed for with sigverify off).
fn migrated_devnet_config(svm: &mut LiteSVM) -> Pubkey {
    use std::str::FromStr;
    set_time(svm, START_TIME + 60 * DAY);
    load_fixture(svm, include_str!("fixtures/devnet_config.json"));
    let admin = Pubkey::from_str("76D6XPGqbxcrCddeLtfPLwG1ZfNMkveCpAtDSH3pzTb4").unwrap();
    svm.airdrop(&admin, 1_000_000_000).unwrap();
    send_as(
        svm,
        ix(
            greyswan::instruction::MigrateConfig {},
            greyswan::accounts::MigrateConfig { config: config_pda(), admin, system_program: system_program::ID },
        ),
        admin,
    )
    .unwrap();
    admin
}

#[test]
fn admin_opens_and_resolves_real_legacy_devnet_rental() {
    // The real devnet rental shipped under the old program: no timeline, so
    // neither timeout applies to it and this is its only exit.
    let mut svm = devnet_svm();
    let admin = migrated_devnet_config(&mut svm);
    let rental = load_fixture(&mut svm, include_str!("fixtures/devnet_legacy_shipped_rental.json"));
    let s = state(&svm, &rental);
    assert_eq!(s.status, RentalStatus::Active);
    assert!(svm.get_account(&timeline_pda(&rental)).is_none());
    stand_in_listing(&mut svm, &s);

    send_as(&mut svm, admin_open_ix(rental, admin, "Shipped before deadlines existed; no arrival recorded"), admin)
        .unwrap();
    let opened = state(&svm, &rental);
    assert_eq!(opened.status, RentalStatus::Disputed);
    assert_eq!(opened.dispute_kind, DisputeKind::AdminOpened);
    assert_eq!(read::<Dispute>(&svm, &dispute_pda(&rental)).kind, DisputeKind::AdminOpened);

    // Owner and renter are the same wallet in this fixture, so it receives
    // both shares.
    let held = s.total_rental_cost + s.deposit_amount;
    let rental_before = lamports(&svm, &rental);
    let wallet_before = lamports(&svm, &s.renter);
    send_as(
        &mut svm,
        resolve_dispute_ix(s.listing, rental, admin, s.owner, s.renter, held / 2, held - held / 2),
        admin,
    )
    .unwrap();
    assert_eq!(state(&svm, &rental).status, RentalStatus::Resolved);
    assert_eq!(lamports(&svm, &s.renter), wallet_before + held);
    assert_eq!(lamports(&svm, &rental), rental_before - held);
    assert!(read::<Listing>(&svm, &s.listing).is_available);
}

// ---------- flag_return_issue closes at the inspection deadline ----------

#[test]
fn return_issue_can_be_flagged_up_to_and_at_the_inspection_deadline() {
    let Rented { mut svm, owner, rental, .. } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    set_time(&mut svm, START_TIME + INSPECTION);
    flag_return_issue(&mut svm, rental, &owner).unwrap();
    assert_eq!(state(&svm, &rental).dispute_kind, DisputeKind::ReturnIssue);
}

#[test]
fn return_issue_rejected_after_the_inspection_deadline() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    assert_program_err(flag_return_issue(&mut svm, rental, &owner), ErrorCode::InspectionWindowClosed);
    assert!(svm.get_account(&dispute_pda(&rental)).is_none());
    // Only the renter's completion applies now.
    complete(&mut svm, listing, rental, &owner, &renter).unwrap();
    assert_eq!(state(&svm, &rental).status, RentalStatus::Completed);
}

#[test]
fn legacy_rental_without_timeline_can_still_be_flagged_on_return() {
    // No timeline means no inspection deadline, so nothing changes for it.
    let (mut svm, rental, renter) = legacy_shipped_rental();
    let owner = state(&svm, &rental).owner;
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 { rental, timeline: timeline_pda(&rental), config: config_pda(), renter },
        ),
        renter,
    )
    .unwrap();
    phase3_as(&mut svm, rental, renter);
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase4 { photos: "ipfs://QmPhase4".to_string() },
            greyswan::accounts::SubmitPhase4 { rental, owner },
        ),
        owner,
    )
    .unwrap();
    warp(&mut svm, 365 * DAY);
    send_as(&mut svm, flag_return_issue_ix(rental, owner), owner).unwrap();
    assert_eq!(state(&svm, &rental).dispute_kind, DisputeKind::ReturnIssue);
}

// ---------- flag_return_not_received ----------

fn not_received_ix(rental: Pubkey, owner: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::FlagReturnNotReceived {},
        greyswan::accounts::FlagReturnNotReceived {
            rental,
            timeline: timeline_pda(&rental),
            dispute: dispute_pda(&rental),
            owner,
            system_program: system_program::ID,
        },
    )
}

fn not_received(svm: &mut LiteSVM, rental: Pubkey, signer: &Keypair) -> Result<(), String> {
    send(svm, not_received_ix(rental, signer.pubkey()), signer, &[signer])
}

#[test]
fn not_received_opens_dispute_and_blocks_timed_out_completion() {
    let Rented { mut svm, admin, owner, renter, listing, rental } = sent_back();
    // At the deadline itself the owner can still report it.
    set_time(&mut svm, START_TIME + INSPECTION);
    let owner_before = lamports(&svm, &owner.pubkey());
    not_received(&mut svm, rental, &owner).unwrap();

    let s = state(&svm, &rental);
    assert_eq!(s.status, RentalStatus::Disputed);
    assert_eq!(s.dispute_kind, DisputeKind::ReturnNotReceived);
    assert_eq!(s.disputed_at, START_TIME + INSPECTION);
    let dispute = read::<Dispute>(&svm, &dispute_pda(&rental));
    assert_eq!(dispute.kind, DisputeKind::ReturnNotReceived);
    assert_eq!(dispute.status, DisputeStatus::Open);
    let dispute_rent = Rent::default().minimum_balance(8 + Dispute::INIT_SPACE);
    assert_eq!(lamports(&svm, &owner.pubkey()), owner_before - dispute_rent - 5000);

    // The renter can no longer complete it by timeout; a reviewer decides.
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    assert_program_err(complete(&mut svm, listing, rental, &owner, &renter), ErrorCode::InvalidRentalStatus);
    send(
        &mut svm,
        resolve_dispute_ix(listing, rental, admin.pubkey(), owner.pubkey(), renter.pubkey(), TOTAL_HELD, 0),
        &admin,
        &[&admin],
    )
    .unwrap();
    assert_eq!(state(&svm, &rental).status, RentalStatus::Resolved);
}

#[test]
fn not_received_rejected_after_the_inspection_deadline() {
    let Rented { mut svm, owner, rental, .. } = sent_back();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    assert_program_err(not_received(&mut svm, rental, &owner), ErrorCode::InspectionWindowClosed);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
    assert!(svm.get_account(&dispute_pda(&rental)).is_none());
}

#[test]
fn not_received_rejected_for_anyone_but_the_owner() {
    let Rented { mut svm, renter, rental, .. } = sent_back();
    let stranger = funded(&mut svm);
    assert_program_err(not_received(&mut svm, rental, &renter), ErrorCode::NotOwnerForPhase);
    assert_program_err(not_received(&mut svm, rental, &stranger), ErrorCode::NotOwnerForPhase);
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
}

#[test]
fn not_received_rejected_once_owner_logged_the_return() {
    let Rented { mut svm, owner, rental, .. } = sent_back();
    phase4(&mut svm, rental, &owner).unwrap();
    assert_program_err(not_received(&mut svm, rental, &owner), ErrorCode::PhaseOutOfOrder);
}

#[test]
fn not_received_rejected_before_the_renter_sends_it_back() {
    let Rented { mut svm, owner, rental, .. } = arrived();
    assert_program_err(not_received(&mut svm, rental, &owner), ErrorCode::PhaseOutOfOrder);
}

#[test]
fn not_received_rejected_once_the_rental_is_over() {
    let Rented { mut svm, owner, renter, listing, rental, .. } = sent_back();
    set_time(&mut svm, START_TIME + INSPECTION + 1);
    complete(&mut svm, listing, rental, &owner, &renter).unwrap();
    assert_program_err(not_received(&mut svm, rental, &owner), ErrorCode::InvalidRentalStatus);
}

#[test]
fn not_received_unavailable_for_legacy_rental_without_timeline() {
    // Unchanged for legacy rentals: no timeline, so this fails and the owner
    // keeps phase 4 then flag_return_issue (or admin_open_dispute).
    let (mut svm, rental, renter) = legacy_shipped_rental();
    let owner = state(&svm, &rental).owner;
    send_as(
        &mut svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 { rental, timeline: timeline_pda(&rental), config: config_pda(), renter },
        ),
        renter,
    )
    .unwrap();
    phase3_as(&mut svm, rental, renter);
    let err = send_as(&mut svm, not_received_ix(rental, owner), owner).unwrap_err();
    // anchor_lang AccountNotInitialized
    assert!(err.contains("Custom(3012)"), "{err}");
    assert_eq!(state(&svm, &rental).status, RentalStatus::Active);
}
