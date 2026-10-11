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
