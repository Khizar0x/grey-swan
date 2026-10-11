// The ReturnIssue dispute engine: post_verdict, appeal, finalize_verdict,
// expire_appeal, void_verdict and reviewer_resolve.

mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
    },
    common::*,
    greyswan::{
        error::ErrorCode,
        instructions::ConfigUpdate,
        state::{Dispute, DisputeKind, DisputeStatus, Listing, Pool, Rental, RentalStatus},
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

const DAY: i64 = 86_400;
const APPEAL_WINDOW: i64 = DAY;
const APPEAL_EXPIRY: i64 = 7 * DAY;
const PROMPT_HASH: [u8; 32] = [1; 32];
const OUTPUT_HASH: [u8; 32] = [2; 32];

/// The parties to one ReturnIssue dispute. The svm is returned separately
/// so tests can borrow both freely.
struct Case {
    admin: Keypair,
    verdict: Keypair,
    reviewer: Keypair,
    reviewer2: Keypair,
    owner: Keypair,
    renter: Keypair,
    listing: Pubkey,
    rental: Pubkey,
}

fn configure(svm: &mut LiteSVM, admin: &Keypair, update: ConfigUpdate) {
    send(
        svm,
        ix(
            greyswan::instruction::UpdateConfig { update },
            greyswan::accounts::UpdateConfig { config: config_pda(), admin: admin.pubkey() },
        ),
        admin,
        &[admin],
    )
    .unwrap();
}

/// A rental the owner flagged on return at START_TIME, with a verdict key,
/// two reviewers and the pool set up. Config otherwise at defaults.
fn flagged() -> (LiteSVM, Case) {
    let mut svm = setup();
    let admin = init_test_config(&mut svm);
    init_pool(&mut svm, &admin);
    let (verdict, reviewer, reviewer2) = (funded(&mut svm), funded(&mut svm), funded(&mut svm));
    configure(
        &mut svm,
        &admin,
        ConfigUpdate {
            verdict_key: Some(verdict.pubkey()),
            reviewers: Some(vec![reviewer.pubkey(), reviewer2.pubkey()]),
            ..Default::default()
        },
    );
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    all_phases(&mut svm, rental, &owner, &renter);
    flag_return_issue(&mut svm, rental, &owner).unwrap();
    (svm, Case { admin, verdict, reviewer, reviewer2, owner, renter, listing, rental })
}

fn dispute(svm: &LiteSVM, rental: &Pubkey) -> Dispute {
    read::<Dispute>(svm, &dispute_pda(rental))
}

fn rental_state(svm: &LiteSVM, rental: &Pubkey) -> Rental {
    read::<Rental>(svm, rental)
}

// ---------- post_verdict ----------

fn post_ix(rental: Pubkey, signer: Pubkey, tiers: &[u8]) -> Instruction {
    ix(
        greyswan::instruction::PostVerdict {
            tiers: tiers.to_vec(),
            prompt_hash: PROMPT_HASH,
            output_hash: OUTPUT_HASH,
        },
        greyswan::accounts::PostVerdict {
            config: config_pda(),
            rental,
            dispute: dispute_pda(&rental),
            verdict_signer: signer,
        },
    )
}

fn post(svm: &mut LiteSVM, rental: Pubkey, signer: &Keypair, tiers: &[u8]) -> Result<(), String> {
    send(svm, post_ix(rental, signer.pubkey(), tiers), signer, &[signer])
}

#[test]
fn verdict_is_scored_on_chain_and_opens_the_appeal_window() {
    let (mut svm, c) = flagged();
    warp(&mut svm, 100);
    // Worst finding tier 1 (1500) plus one more finding (+500).
    post(&mut svm, c.rental, &c.verdict, &[1, 0]).unwrap();

    let d = dispute(&svm, &c.rental);
    assert_eq!(d.status, DisputeStatus::VerdictPosted);
    assert_eq!(d.tier_count, 2);
    assert_eq!(d.tiers, [1, 0, 0, 0, 0, 0, 0, 0]);
    assert_eq!(d.verdict_owner_bps, 2_000);
    assert_eq!(d.prompt_hash, PROMPT_HASH);
    assert_eq!(d.output_hash, OUTPUT_HASH);
    assert_eq!(d.verdict_posted_at, START_TIME + 100);
    assert_eq!(d.appeal_deadline, START_TIME + 100 + APPEAL_WINDOW);
    assert_eq!(d.appeal_expires_at, START_TIME + 100 + APPEAL_WINDOW + APPEAL_EXPIRY);
    // Funds haven't moved.
    assert_eq!(rental_state(&svm, &c.rental).status, RentalStatus::Disputed);
}

#[test]
fn verdict_score_is_capped_at_the_whole_deposit() {
    let (mut svm, c) = flagged();
    configure(
        &mut svm,
        &c.admin,
        ConfigUpdate { rubric_bps: Some([0, 1_500, 9_000, 9_500, 10_000]), ..Default::default() },
    );
    // 9000 + 7 * 500 = 12500, capped to 10000.
    post(&mut svm, c.rental, &c.verdict, &[2; 8]).unwrap();
    assert_eq!(dispute(&svm, &c.rental).verdict_owner_bps, 10_000);
}

#[test]
fn verdict_rejected_from_anyone_but_the_verdict_key() {
    let (mut svm, c) = flagged();
    for signer in [&c.admin, &c.reviewer, &c.owner, &c.renter] {
        assert_program_err(post(&mut svm, c.rental, signer, &[1]), ErrorCode::NotVerdictKey);
    }
    assert_eq!(dispute(&svm, &c.rental).status, DisputeStatus::Open);
}

#[test]
fn verdict_cannot_be_posted_twice() {
    let (mut svm, c) = flagged();
    post(&mut svm, c.rental, &c.verdict, &[1]).unwrap();
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[0]), ErrorCode::InvalidDisputeStatus);
    assert_eq!(dispute(&svm, &c.rental).verdict_owner_bps, 1_500);
}

#[test]
fn verdict_rejected_for_other_dispute_kinds() {
    let (mut svm, c) = flagged();
    // Arrival rejection.
    let listing = list_item(&mut svm, &c.owner, "Fender Strat");
    let arrival = rent(&mut svm, listing, &c.renter);
    phase1(&mut svm, arrival, &c.owner).unwrap();
    reject_on_arrival(&mut svm, arrival, &c.renter).unwrap();
    assert_program_err(post(&mut svm, arrival, &c.verdict, &[1]), ErrorCode::WrongDisputeKind);

    // Admin-opened.
    let listing = list_item(&mut svm, &c.owner, "Roland TR-8");
    let stuck = rent(&mut svm, listing, &c.renter);
    send(
        &mut svm,
        ix(
            greyswan::instruction::AdminOpenDispute { reason: "Stuck".to_string() },
            greyswan::accounts::AdminOpenDispute {
                config: config_pda(),
                rental: stuck,
                dispute: dispute_pda(&stuck),
                admin: c.admin.pubkey(),
                system_program: system_program::ID,
            },
        ),
        &c.admin,
        &[&c.admin],
    )
    .unwrap();
    assert_program_err(post(&mut svm, stuck, &c.verdict, &[1]), ErrorCode::WrongDisputeKind);
}

#[test]
fn verdict_rejected_for_a_rental_that_is_not_disputed() {
    let (mut svm, c) = flagged();
    let listing = list_item(&mut svm, &c.owner, "Fender Strat");
    let active = rent(&mut svm, listing, &c.renter);
    let err = post(&mut svm, active, &c.verdict, &[1]).unwrap_err();
    // No Dispute account exists for it: anchor_lang AccountNotInitialized.
    assert!(err.contains("Custom(3012)"), "{err}");
}

#[test]
fn verdict_rejects_bad_tier_lists() {
    let (mut svm, c) = flagged();
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[]), ErrorCode::InvalidTierCount);
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[0; 9]), ErrorCode::InvalidTierCount);
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[1, 5]), ErrorCode::TierOutOfRange);
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[255]), ErrorCode::TierOutOfRange);
    assert_eq!(dispute(&svm, &c.rental).status, DisputeStatus::Open);
    // The limits themselves are fine: 8 findings, tier 0.
    post(&mut svm, c.rental, &c.verdict, &[0; 8]).unwrap();
}

#[test]
fn severe_damage_and_large_deposits_go_to_a_human() {
    let (mut svm, c) = flagged();
    // Default auto_release_max_tier is 2.
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[0, 3]), ErrorCode::NeedsHumanReview);
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[4]), ErrorCode::NeedsHumanReview);

    // A deposit exactly at the threshold is fine; one lamport less and it isn't.
    configure(&mut svm, &c.admin, ConfigUpdate { large_deposit_threshold_lamports: Some(DEPOSIT - 1), ..Default::default() });
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[1]), ErrorCode::NeedsHumanReview);
    configure(&mut svm, &c.admin, ConfigUpdate { large_deposit_threshold_lamports: Some(DEPOSIT), ..Default::default() });
    post(&mut svm, c.rental, &c.verdict, &[2]).unwrap();
}

#[test]
fn verdict_rejected_while_paused() {
    let (mut svm, c) = flagged();
    configure(&mut svm, &c.admin, ConfigUpdate { paused: Some(true), ..Default::default() });
    assert_program_err(post(&mut svm, c.rental, &c.verdict, &[1]), ErrorCode::DisputesPaused);
    configure(&mut svm, &c.admin, ConfigUpdate { paused: Some(false), ..Default::default() });
    post(&mut svm, c.rental, &c.verdict, &[1]).unwrap();
}

// ---------- appeal ----------

fn appeal_ix(rental: Pubkey, appellant: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::Appeal {},
        greyswan::accounts::Appeal {
            config: config_pda(),
            rental,
            dispute: dispute_pda(&rental),
            appellant,
            system_program: system_program::ID,
        },
    )
}

fn appeal(svm: &mut LiteSVM, rental: Pubkey, appellant: &Keypair) -> Result<(), String> {
    send(svm, appeal_ix(rental, appellant.pubkey()), appellant, &[appellant])
}

/// flagged() with a verdict of tiers [1, 0] (2000 bps: the owner would get
/// 4,000,000 of the 20,000,000 deposit) posted at START_TIME.
fn verdict_posted() -> (LiteSVM, Case) {
    let (mut svm, c) = flagged();
    post(&mut svm, c.rental, &c.verdict, &[1, 0]).unwrap();
    (svm, c)
}

const VERDICT_BPS: u16 = 2_000;
const VERDICT_OWNER_SHARE: u64 = DEPOSIT / 5;
const DEFAULT_BOND_MIN: u64 = 10_000_000;

#[test]
fn renter_appeal_moves_the_minimum_bond_into_the_dispute() {
    let (mut svm, c) = verdict_posted();
    let renter_before = lamports(&svm, &c.renter.pubkey());
    let dispute_before = lamports(&svm, &dispute_pda(&c.rental));

    appeal(&mut svm, c.rental, &c.renter).unwrap();

    // 10% of the 4,000,000 at stake is 400,000, below the 10,000,000 floor.
    let d = dispute(&svm, &c.rental);
    assert_eq!(d.status, DisputeStatus::Appealed);
    assert!(d.renter_appealed && !d.owner_appealed);
    assert_eq!((d.renter_bond, d.owner_bond), (DEFAULT_BOND_MIN, 0));
    assert_eq!(lamports(&svm, &c.renter.pubkey()), renter_before - DEFAULT_BOND_MIN - 5000);
    assert_eq!(lamports(&svm, &dispute_pda(&c.rental)), dispute_before + DEFAULT_BOND_MIN);
}

#[test]
fn bond_is_a_share_of_what_each_party_stands_to_lose() {
    let (mut svm, c) = verdict_posted();
    configure(&mut svm, &c.admin, ConfigUpdate { bond_min_lamports: Some(1_000), ..Default::default() });
    // The renter stands to lose the owner's 4,000,000 share; the owner the
    // other 16,000,000. Bond is 10% of each.
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    appeal(&mut svm, c.rental, &c.owner).unwrap();
    let d = dispute(&svm, &c.rental);
    assert_eq!(d.renter_bond, VERDICT_OWNER_SHARE / 10);
    assert_eq!(d.owner_bond, (DEPOSIT - VERDICT_OWNER_SHARE) / 10);
    assert!(d.owner_appealed && d.renter_appealed);
    assert_eq!(d.status, DisputeStatus::Appealed);
}

#[test]
fn each_party_appeals_at_most_once() {
    let (mut svm, c) = verdict_posted();
    appeal(&mut svm, c.rental, &c.owner).unwrap();
    assert_program_err(appeal(&mut svm, c.rental, &c.owner), ErrorCode::AlreadyAppealed);
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    assert_program_err(appeal(&mut svm, c.rental, &c.renter), ErrorCode::AlreadyAppealed);
    assert_eq!(dispute(&svm, &c.rental).owner_bond, DEFAULT_BOND_MIN);
}

#[test]
fn appeal_allowed_up_to_and_at_the_deadline_only() {
    let (mut svm, c) = verdict_posted();
    set_time(&mut svm, START_TIME + APPEAL_WINDOW);
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    assert_program_err(appeal(&mut svm, c.rental, &c.owner), ErrorCode::AppealWindowClosed);
    assert!(!dispute(&svm, &c.rental).owner_appealed);
}

#[test]
fn appeal_rejected_for_anyone_but_owner_or_renter() {
    let (mut svm, c) = verdict_posted();
    let stranger = funded(&mut svm);
    for signer in [&c.admin, &c.verdict, &c.reviewer, &stranger] {
        assert_program_err(appeal(&mut svm, c.rental, signer), ErrorCode::NotRentalParty);
    }
    assert_eq!(dispute(&svm, &c.rental).status, DisputeStatus::VerdictPosted);
}

#[test]
fn appeal_rejected_before_any_verdict() {
    let (mut svm, c) = flagged();
    assert_program_err(appeal(&mut svm, c.rental, &c.renter), ErrorCode::InvalidDisputeStatus);
}

#[test]
fn appeal_still_allowed_while_paused() {
    // Pause stops automatic payouts; appealing only hands the case to a human.
    let (mut svm, c) = verdict_posted();
    configure(&mut svm, &c.admin, ConfigUpdate { paused: Some(true), ..Default::default() });
    appeal(&mut svm, c.rental, &c.renter).unwrap();
}

#[test]
fn appeal_rejected_when_owner_and_renter_are_one_wallet() {
    let (mut svm, c) = flagged();
    let listing = list_item(&mut svm, &c.owner, "Fender Strat");
    let own = rent(&mut svm, listing, &c.owner);
    all_phases(&mut svm, own, &c.owner, &c.owner);
    flag_return_issue(&mut svm, own, &c.owner).unwrap();
    post(&mut svm, own, &c.verdict, &[1]).unwrap();
    assert_program_err(appeal(&mut svm, own, &c.owner), ErrorCode::SameOwnerAndRenter);
}

// ---------- finalize_verdict and expire_appeal ----------

#[derive(Clone, Copy)]
enum Settle {
    Finalize,
    Expire,
}

struct SettleAccounts {
    listing: Pubkey,
    rental: Pubkey,
    owner: Pubkey,
    renter: Pubkey,
    platform_wallet: Pubkey,
}

impl SettleAccounts {
    fn of(c: &Case) -> Self {
        Self {
            listing: c.listing,
            rental: c.rental,
            owner: c.owner.pubkey(),
            renter: c.renter.pubkey(),
            platform_wallet: greyswan::PLATFORM_WALLET,
        }
    }
}

fn settle_ix(which: Settle, a: &SettleAccounts, caller: Pubkey) -> Instruction {
    let accounts = greyswan::accounts::SettleVerdict {
        config: config_pda(),
        listing: a.listing,
        rental: a.rental,
        dispute: dispute_pda(&a.rental),
        owner: a.owner,
        renter: a.renter,
        platform_wallet: a.platform_wallet,
        caller,
    };
    match which {
        Settle::Finalize => ix(greyswan::instruction::FinalizeVerdict {}, accounts),
        Settle::Expire => ix(greyswan::instruction::ExpireAppeal {}, accounts),
    }
}

fn settle(svm: &mut LiteSVM, which: Settle, c: &Case, caller: &Keypair) -> Result<(), String> {
    send(svm, settle_ix(which, &SettleAccounts::of(c), caller.pubkey()), caller, &[caller])
}

/// Balances of owner, renter, platform wallet and rental account.
fn balances(svm: &LiteSVM, c: &Case) -> [u64; 4] {
    [
        lamports(svm, &c.owner.pubkey()),
        lamports(svm, &c.renter.pubkey()),
        lamports(svm, &greyswan::PLATFORM_WALLET),
        lamports(svm, &c.rental),
    ]
}

fn moved(before: [u64; 4], after: [u64; 4]) -> [i128; 4] {
    std::array::from_fn(|i| after[i] as i128 - before[i] as i128)
}

const RENTAL_FEE: u64 = WEEKLY_PRICE * WEEKS as u64;
const PLATFORM_FEE: u64 = RENTAL_FEE / 10;

#[test]
fn anyone_finalizes_after_the_window_and_the_verdict_is_paid_exactly() {
    let (mut svm, c) = verdict_posted();
    let stranger = funded(&mut svm);
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    let before = balances(&svm, &c);

    settle(&mut svm, Settle::Finalize, &c, &stranger).unwrap();

    let owner_gets = (RENTAL_FEE - PLATFORM_FEE + VERDICT_OWNER_SHARE) as i128;
    let renter_gets = (DEPOSIT - VERDICT_OWNER_SHARE) as i128;
    assert_eq!(
        moved(before, balances(&svm, &c)),
        [owner_gets, renter_gets, PLATFORM_FEE as i128, -(TOTAL_HELD as i128)]
    );
    assert_eq!(rental_state(&svm, &c.rental).status, RentalStatus::Completed);
    assert!(read::<Listing>(&svm, &c.listing).is_available);
    let d = dispute(&svm, &c.rental);
    assert_eq!(d.status, DisputeStatus::Resolved);
    assert_eq!(d.final_owner_bps, VERDICT_BPS);
    assert_eq!(d.resolved_at, START_TIME + APPEAL_WINDOW + 1);
    assert_eq!(d.resolved_by, [Pubkey::default(); 2]);
}

#[test]
fn finalize_rounds_the_owner_share_down_and_pays_out_every_lamport() {
    let (mut svm, mut c) = flagged();
    // An odd price and deposit, and a rubric value that doesn't divide evenly.
    configure(
        &mut svm,
        &c.admin,
        ConfigUpdate { rubric_bps: Some([0, 3_333, 5_000, 8_000, 10_000]), ..Default::default() },
    );
    let (price, deposit) = (3_333_333u64, 9_999_999u64);
    let listing = listing_pda(&c.owner.pubkey(), "Odd item");
    send(
        &mut svm,
        ix(
            greyswan::instruction::ListItem {
                item_name: "Odd item".to_string(),
                description: "Odd amounts".to_string(),
                photos: "ipfs://QmOdd".to_string(),
                rental_price: price,
                deposit_amount: deposit,
                estimated_value: 100_000_000,
                category: greyswan::state::Category::Other,
                rarity_tier: greyswan::state::RarityTier::Common,
            },
            greyswan::accounts::ListItem { listing, owner: c.owner.pubkey(), system_program: system_program::ID },
        ),
        &c.owner,
        &[&c.owner],
    )
    .unwrap();
    let rental = rent(&mut svm, listing, &c.renter);
    all_phases(&mut svm, rental, &c.owner, &c.renter);
    flag_return_issue(&mut svm, rental, &c.owner).unwrap();
    post(&mut svm, rental, &c.verdict, &[1]).unwrap();
    c.listing = listing;
    c.rental = rental;
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    let stranger = funded(&mut svm);
    let before = balances(&svm, &c);

    settle(&mut svm, Settle::Finalize, &c, &stranger).unwrap();

    let fee_total = price * WEEKS as u64; // 9,999,999
    let platform_fee = 999_999; // 10%, rounded down
    let owner_deposit = 3_332_999; // 9,999,999 * 0.3333 = 3,332,999.67, rounded down
    let renter_deposit = deposit - owner_deposit; // exactly the remainder
    assert_eq!(fee_total, 9_999_999);
    assert_eq!(
        moved(before, balances(&svm, &c)),
        [
            (fee_total - platform_fee + owner_deposit) as i128,
            renter_deposit as i128,
            platform_fee as i128,
            -((fee_total + deposit) as i128),
        ]
    );
}

#[test]
fn finalize_rejected_before_and_at_the_deadline() {
    let (mut svm, c) = verdict_posted();
    set_time(&mut svm, START_TIME + APPEAL_WINDOW - 1);
    assert_program_err(settle(&mut svm, Settle::Finalize, &c, &c.owner), ErrorCode::AppealWindowStillOpen);
    set_time(&mut svm, START_TIME + APPEAL_WINDOW);
    assert_program_err(settle(&mut svm, Settle::Finalize, &c, &c.owner), ErrorCode::AppealWindowStillOpen);
    assert_eq!(rental_state(&svm, &c.rental).status, RentalStatus::Disputed);
}

#[test]
fn finalize_rejected_while_appealed_or_before_any_verdict() {
    let (mut svm, c) = flagged();
    set_time(&mut svm, START_TIME + 30 * DAY);
    assert_program_err(settle(&mut svm, Settle::Finalize, &c, &c.owner), ErrorCode::InvalidDisputeStatus);

    let (mut svm, c) = verdict_posted();
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    assert_program_err(settle(&mut svm, Settle::Finalize, &c, &c.owner), ErrorCode::InvalidDisputeStatus);
}

#[test]
fn finalize_rejected_while_paused() {
    let (mut svm, c) = verdict_posted();
    configure(&mut svm, &c.admin, ConfigUpdate { paused: Some(true), ..Default::default() });
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    assert_program_err(settle(&mut svm, Settle::Finalize, &c, &c.owner), ErrorCode::DisputesPaused);
    configure(&mut svm, &c.admin, ConfigUpdate { paused: Some(false), ..Default::default() });
    settle(&mut svm, Settle::Finalize, &c, &c.owner).unwrap();
}

#[test]
fn finalize_cannot_pay_twice() {
    let (mut svm, c) = verdict_posted();
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    settle(&mut svm, Settle::Finalize, &c, &c.owner).unwrap();
    let after = balances(&svm, &c);
    assert_program_err(settle(&mut svm, Settle::Finalize, &c, &c.renter), ErrorCode::InvalidDisputeStatus);
    assert_program_err(settle(&mut svm, Settle::Expire, &c, &c.renter), ErrorCode::InvalidDisputeStatus);
    // Only the failed callers' fees moved (owner paid none here).
    assert_eq!(balances(&svm, &c)[0], after[0]);
    assert_eq!(balances(&svm, &c)[3], after[3]);
}

#[test]
fn finalize_rejects_substituted_accounts() {
    let (mut svm, c) = verdict_posted();
    let stranger = funded(&mut svm);
    let other_listing = list_item(&mut svm, &c.owner, "Fender Strat");
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + 1);
    let send_with = |svm: &mut LiteSVM, a: SettleAccounts| {
        send(svm, settle_ix(Settle::Finalize, &a, stranger.pubkey()), &stranger, &[&stranger])
    };

    let mut a = SettleAccounts::of(&c);
    a.owner = stranger.pubkey();
    assert_program_err(send_with(&mut svm, a), ErrorCode::NotListingOwner);
    let mut a = SettleAccounts::of(&c);
    a.renter = stranger.pubkey();
    assert_program_err(send_with(&mut svm, a), ErrorCode::NotRenter);
    let mut a = SettleAccounts::of(&c);
    a.listing = other_listing;
    assert_program_err(send_with(&mut svm, a), ErrorCode::ListingMismatch);
    let mut a = SettleAccounts::of(&c);
    a.platform_wallet = stranger.pubkey();
    let err = send_with(&mut svm, a).unwrap_err();
    // anchor_lang ConstraintAddress
    assert!(err.contains("Custom(2012)"), "{err}");

    assert_eq!(rental_state(&svm, &c.rental).status, RentalStatus::Disputed);
}

#[test]
fn expired_appeal_pays_the_verdict_and_refunds_every_bond() {
    let (mut svm, c) = verdict_posted();
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    appeal(&mut svm, c.rental, &c.owner).unwrap();
    let expires_at = START_TIME + APPEAL_WINDOW + APPEAL_EXPIRY;
    let stranger = funded(&mut svm);

    set_time(&mut svm, expires_at);
    assert_program_err(settle(&mut svm, Settle::Expire, &c, &stranger), ErrorCode::AppealNotExpired);

    set_time(&mut svm, expires_at + 1);
    let before = balances(&svm, &c);
    let dispute_before = lamports(&svm, &dispute_pda(&c.rental));
    settle(&mut svm, Settle::Expire, &c, &stranger).unwrap();

    let owner_gets = (RENTAL_FEE - PLATFORM_FEE + VERDICT_OWNER_SHARE + DEFAULT_BOND_MIN) as i128;
    let renter_gets = (DEPOSIT - VERDICT_OWNER_SHARE + DEFAULT_BOND_MIN) as i128;
    assert_eq!(
        moved(before, balances(&svm, &c)),
        [owner_gets, renter_gets, PLATFORM_FEE as i128, -(TOTAL_HELD as i128)]
    );
    assert_eq!(lamports(&svm, &dispute_pda(&c.rental)), dispute_before - 2 * DEFAULT_BOND_MIN);
    let d = dispute(&svm, &c.rental);
    assert_eq!(d.status, DisputeStatus::Resolved);
    assert_eq!((d.owner_bond, d.renter_bond), (0, 0));
    assert_eq!(d.final_owner_bps, VERDICT_BPS);
    assert_eq!(rental_state(&svm, &c.rental).status, RentalStatus::Completed);
}

#[test]
fn expire_rejected_unless_appealed_or_while_paused() {
    let (mut svm, c) = verdict_posted();
    set_time(&mut svm, START_TIME + 60 * DAY);
    // Not appealed: that's finalize's job.
    assert_program_err(settle(&mut svm, Settle::Expire, &c, &c.owner), ErrorCode::InvalidDisputeStatus);

    let (mut svm, c) = verdict_posted();
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    configure(&mut svm, &c.admin, ConfigUpdate { paused: Some(true), ..Default::default() });
    set_time(&mut svm, START_TIME + 60 * DAY);
    assert_program_err(settle(&mut svm, Settle::Expire, &c, &c.owner), ErrorCode::DisputesPaused);
}

#[test]
fn appeal_expiry_is_fixed_when_the_verdict_is_posted() {
    let (mut svm, c) = verdict_posted();
    appeal(&mut svm, c.rental, &c.renter).unwrap();
    // Shortening the expiry afterwards doesn't bring this one forward.
    configure(&mut svm, &c.admin, ConfigUpdate { appeal_expiry_secs: Some(DAY), ..Default::default() });
    set_time(&mut svm, START_TIME + APPEAL_WINDOW + DAY + 1);
    assert_program_err(settle(&mut svm, Settle::Expire, &c, &c.owner), ErrorCode::AppealNotExpired);
}
