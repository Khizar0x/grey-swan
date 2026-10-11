// Regression tests for two security bugs:
//
// Bug A: claim_refund only looked at elapsed time, so a renter who had
// already received (and used) the item could still take a full refund
// after 7 days. The refund is only meant for "the owner never shipped".
//
// Bug B: confirm_return, claim_refund and resolve_dispute never checked that
// the `listing` passed in is the one the rental belongs to, so a caller
// could flip is_available on an unrelated listing that is out on rent,
// letting it be rented twice.

mod common;

use {
    anchor_lang::solana_program::system_program,
    common::*,
    greyswan::{
        error::ErrorCode,
        state::{Listing, Rental, RentalStatus},
    },
    solana_signer::Signer,
};

const SEVEN_DAYS: i64 = 7 * 24 * 60 * 60;

fn claim_refund(
    svm: &mut litesvm::LiteSVM,
    listing: anchor_lang::prelude::Pubkey,
    rental: anchor_lang::prelude::Pubkey,
    renter: &solana_keypair::Keypair,
) -> Result<(), String> {
    send(
        svm,
        ix(
            greyswan::instruction::ClaimRefund {},
            greyswan::accounts::ClaimRefund {
                listing,
                rental,
                renter: renter.pubkey(),
                system_program: system_program::ID,
            },
        ),
        renter,
        &[renter],
    )
}

// ---------- Bug A ----------

#[test]
fn claim_refund_rejected_after_renter_received_item() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);

    // Owner ships, renter confirms arrival: the renter now has the item.
    phase1(&mut svm, rental, &owner).unwrap();
    phase2(&mut svm, rental, &renter).unwrap();

    warp(&mut svm, SEVEN_DAYS + 1);
    let held_before = lamports(&svm, &rental);

    let result = claim_refund(&mut svm, listing, rental, &renter);
    assert_program_err(result, ErrorCode::OwnerAlreadyShipped);
    assert_eq!(lamports(&svm, &rental), held_before, "funds must stay held");
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Active);
}

#[test]
fn claim_refund_rejected_once_owner_has_shipped() {
    let mut svm = setup();
    init_test_config(&mut svm);
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);

    // Shipped but not yet confirmed as arrived: the renter's remedy is
    // reject_on_arrival, not a unilateral refund.
    phase1(&mut svm, rental, &owner).unwrap();
    warp(&mut svm, SEVEN_DAYS + 1);

    assert_program_err(
        claim_refund(&mut svm, listing, rental, &renter),
        ErrorCode::OwnerAlreadyShipped,
    );
}

#[test]
fn claim_refund_still_works_when_owner_never_ships() {
    let mut svm = setup();
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);

    warp(&mut svm, SEVEN_DAYS + 1);
    let renter_before = lamports(&svm, &renter.pubkey());

    claim_refund(&mut svm, listing, rental, &renter).unwrap();

    // Full rental cost plus deposit, less the 5000 lamport signature fee.
    assert_eq!(lamports(&svm, &renter.pubkey()), renter_before + TOTAL_HELD - 5000);
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::RefundedAuto);
    assert!(read::<Listing>(&svm, &listing).is_available);
}

// ---------- Bug B ----------

/// Two independent rentals: A (the caller's) and B (someone else's, out on
/// rent, so its listing is unavailable).
struct TwoRentals {
    svm: litesvm::LiteSVM,
    owner_a: solana_keypair::Keypair,
    renter_a: solana_keypair::Keypair,
    listing_a: anchor_lang::prelude::Pubkey,
    rental_a: anchor_lang::prelude::Pubkey,
    listing_b: anchor_lang::prelude::Pubkey,
    admin: solana_keypair::Keypair,
}

fn two_rentals() -> TwoRentals {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    let (owner_a, renter_a) = (funded(&mut svm), funded(&mut svm));
    let (owner_b, renter_b) = (funded(&mut svm), funded(&mut svm));
    let listing_a = list_item(&mut svm, &owner_a, "Canon R5");
    let listing_b = list_item(&mut svm, &owner_b, "Fender Strat");
    let rental_a = rent(&mut svm, listing_a, &renter_a);
    rent(&mut svm, listing_b, &renter_b);
    TwoRentals { svm, owner_a, renter_a, listing_a, rental_a, listing_b, admin }
}

fn assert_listing_b_untouched(t: &TwoRentals) {
    assert!(
        !read::<Listing>(&t.svm, &t.listing_b).is_available,
        "EXPLOIT: an unrelated listing that is out on rent was marked available"
    );
}

#[test]
fn confirm_return_rejects_unrelated_listing() {
    let mut t = two_rentals();
    all_phases(&mut t.svm, t.rental_a, &t.owner_a, &t.renter_a);

    let result = send(
        &mut t.svm,
        ix(
            greyswan::instruction::ConfirmReturn {},
            greyswan::accounts::ConfirmReturn {
                listing: t.listing_b,
                rental: t.rental_a,
                owner: t.owner_a.pubkey(),
                renter: t.renter_a.pubkey(),
                platform_wallet: greyswan::PLATFORM_WALLET,
                system_program: system_program::ID,
            },
        ),
        &t.owner_a,
        &[&t.owner_a],
    );
    assert_listing_b_untouched(&t);
    assert_program_err(result, ErrorCode::ListingMismatch);
}

#[test]
fn claim_refund_rejects_unrelated_listing() {
    let mut t = two_rentals();
    warp(&mut t.svm, SEVEN_DAYS + 1);

    let result = claim_refund(&mut t.svm, t.listing_b, t.rental_a, &t.renter_a);
    assert_listing_b_untouched(&t);
    assert_program_err(result, ErrorCode::ListingMismatch);
}

#[test]
fn resolve_dispute_rejects_unrelated_listing() {
    let mut t = two_rentals();
    all_phases(&mut t.svm, t.rental_a, &t.owner_a, &t.renter_a);
    flag_return_issue(&mut t.svm, t.rental_a, &t.owner_a).unwrap();

    let result = send(
        &mut t.svm,
        ix(
            greyswan::instruction::ResolveDispute { owner_amount: TOTAL_HELD, renter_amount: 0 },
            greyswan::accounts::ResolveDispute {
                config: config_pda(),
                listing: t.listing_b,
                rental: t.rental_a,
                admin: t.admin.pubkey(),
                owner: t.owner_a.pubkey(),
                renter: t.renter_a.pubkey(),
                system_program: system_program::ID,
            },
        ),
        &t.admin,
        &[&t.admin],
    );
    assert_listing_b_untouched(&t);
    assert_program_err(result, ErrorCode::ListingMismatch);
}

#[test]
fn matching_listing_is_still_accepted() {
    // Sanity check that the fix doesn't reject the honest call.
    let mut t = two_rentals();
    all_phases(&mut t.svm, t.rental_a, &t.owner_a, &t.renter_a);
    send(
        &mut t.svm,
        ix(
            greyswan::instruction::ConfirmReturn {},
            greyswan::accounts::ConfirmReturn {
                listing: t.listing_a,
                rental: t.rental_a,
                owner: t.owner_a.pubkey(),
                renter: t.renter_a.pubkey(),
                platform_wallet: greyswan::PLATFORM_WALLET,
                system_program: system_program::ID,
            },
        ),
        &t.owner_a,
        &[&t.owner_a],
    )
    .unwrap();
    assert!(read::<Listing>(&t.svm, &t.listing_a).is_available);
}
