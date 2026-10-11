// Config migration and update_config.
//
// The migration tests run against the real devnet Config bytes, dumped with
// `solana account 71somMeXpgT8Ln3WXx7vEr8hZ9ytrqfyaTpzdoE9qMJ2 --url devnet
// --output json` into tests/fixtures/devnet_config.json. The devnet admin's
// private key isn't available to the test suite, so the tests that need the
// admin to sign run with signature verification turned off: the account
// bytes are untouched and every check inside the program still runs, only
// the ed25519 check on the transaction is skipped.

mod common;

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, rent::Rent, system_program},
        Space,
    },
    base64::Engine,
    common::*,
    greyswan::{
        error::ErrorCode,
        instructions::ConfigUpdate,
        state::{Config, Rental, RentalStatus},
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signature::Signature,
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    std::str::FromStr,
};

const DEVNET_ADMIN: &str = "76D6XPGqbxcrCddeLtfPLwG1ZfNMkveCpAtDSH3pzTb4";

fn devnet_admin() -> Pubkey {
    Pubkey::from_str(DEVNET_ADMIN).unwrap()
}

/// The fixture as (lamports, data, owner).
fn devnet_config_fixture() -> (u64, Vec<u8>, Pubkey) {
    let json: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/devnet_config.json")).unwrap();
    let acct = &json["account"];
    let data = base64::engine::general_purpose::STANDARD
        .decode(acct["data"][0].as_str().unwrap())
        .unwrap();
    let owner = Pubkey::from_str(acct["owner"].as_str().unwrap()).unwrap();
    (acct["lamports"].as_u64().unwrap(), data, owner)
}

fn svm_with_devnet_config() -> LiteSVM {
    let mut svm = LiteSVM::new().with_sigverify(false);
    svm.add_program(greyswan::id(), program_bytes()).unwrap();
    set_time(&mut svm, START_TIME);

    let (lamports, data, owner) = devnet_config_fixture();
    assert_eq!(json_pubkey(), config_pda(), "fixture is not the Config PDA");
    svm.set_account(
        config_pda(),
        solana_account::Account { lamports, data, owner, executable: false, rent_epoch: u64::MAX },
    )
    .unwrap();
    svm.airdrop(&devnet_admin(), 10_000_000_000).unwrap();
    svm
}

fn json_pubkey() -> Pubkey {
    let json: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/devnet_config.json")).unwrap();
    Pubkey::from_str(json["pubkey"].as_str().unwrap()).unwrap()
}

/// Sends with placeholder signatures. Only meaningful on an svm built with
/// sigverify off; used to act as the devnet admin, whose key we don't hold.
fn send_as(svm: &mut LiteSVM, ix: Instruction, payer: Pubkey) -> Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &svm.latest_blockhash());
    let tx = VersionedTransaction {
        signatures: vec![Signature::default(); msg.header.num_required_signatures as usize],
        message: VersionedMessage::Legacy(msg),
    };
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

fn migrate_ix(admin: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::MigrateConfig {},
        greyswan::accounts::MigrateConfig {
            config: config_pda(),
            admin,
            system_program: system_program::ID,
        },
    )
}

fn update_ix(admin: Pubkey, update: ConfigUpdate) -> Instruction {
    ix(
        greyswan::instruction::UpdateConfig { update },
        greyswan::accounts::UpdateConfig { config: config_pda(), admin },
    )
}

fn raw_config(svm: &LiteSVM) -> Vec<u8> {
    svm.get_account(&config_pda()).unwrap().data
}

fn assert_defaults(config: &Config) {
    assert_eq!(config.version, 2);
    assert!(!config.paused);
    assert_eq!(config.verdict_key, Pubkey::default());
    assert_eq!(config.reviewer_count, 0);
    assert!(config.reviewers.iter().all(|r| *r == Pubkey::default()));
    assert_eq!(config.rubric_bps, [0, 1500, 5000, 8000, 10000]);
    assert_eq!(config.extra_finding_bps, 500);
    assert_eq!(config.auto_release_max_tier, 2);
    assert_eq!(config.appeal_window_secs, 86_400);
    assert_eq!(config.appeal_expiry_secs, 604_800);
    assert_eq!(config.phase2_deadline_secs, 432_000);
    assert_eq!(config.bond_bps, 1000);
    assert_eq!(config.bond_min_lamports, 10_000_000);
    assert_eq!(config.reserved, [0u8; 128]);
}

// ---------- Migration, on the real devnet bytes ----------

#[test]
fn migrates_real_devnet_config_and_keeps_admin_offset() {
    let mut svm = svm_with_devnet_config();
    let before = raw_config(&svm);
    assert_eq!(before.len(), 41);
    assert_eq!(Pubkey::try_from(&before[8..40]).unwrap(), devnet_admin());

    send_as(&mut svm, migrate_ix(devnet_admin()), devnet_admin()).unwrap();

    let after = svm.get_account(&config_pda()).unwrap();
    assert_eq!(after.data.len(), 8 + Config::INIT_SPACE);
    // The original 41 bytes (discriminator, admin, bump) are byte-identical,
    // so server/src/config.ts's read of bytes 8..40 is unaffected.
    assert_eq!(&after.data[..41], &before[..]);
    assert!(after.lamports >= Rent::default().minimum_balance(after.data.len()));

    let config = read::<Config>(&svm, &config_pda());
    assert_eq!(config.admin, devnet_admin());
    assert_eq!(config.bump, before[40]);
    assert_defaults(&config);
}

#[test]
fn migration_rejects_non_admin() {
    let mut svm = svm_with_devnet_config();
    let before = raw_config(&svm);
    let stranger = funded(&mut svm);

    let result = send(&mut svm, migrate_ix(stranger.pubkey()), &stranger, &[&stranger]);
    assert_program_err(result, ErrorCode::NotAdmin);
    assert_eq!(raw_config(&svm), before, "a rejected migration must not touch the account");
}

#[test]
fn migration_refuses_to_run_twice() {
    let mut svm = svm_with_devnet_config();
    send_as(&mut svm, migrate_ix(devnet_admin()), devnet_admin()).unwrap();
    let once = raw_config(&svm);

    let result = send_as(&mut svm, migrate_ix(devnet_admin()), devnet_admin());
    assert_program_err(result, ErrorCode::ConfigAlreadyMigrated);
    assert_eq!(raw_config(&svm), once);
}

#[test]
fn fresh_init_config_is_already_current() {
    let mut svm = setup();
    let admin = funded(&mut svm);
    init_config(&mut svm, &admin);
    assert_defaults(&read::<Config>(&svm, &config_pda()));

    let result = send(&mut svm, migrate_ix(admin.pubkey()), &admin, &[&admin]);
    assert_program_err(result, ErrorCode::ConfigAlreadyMigrated);
}

#[test]
fn resolve_dispute_works_after_migrating_real_config() {
    let mut svm = svm_with_devnet_config();
    let admin = devnet_admin();
    let (owner, renter) = (funded(&mut svm), funded(&mut svm));
    let listing = list_item(&mut svm, &owner, "Canon R5");
    let rental = rent(&mut svm, listing, &renter);
    all_phases(&mut svm, rental, &owner, &renter);
    flag_return_issue(&mut svm, rental, &owner).unwrap();

    let resolve = || {
        ix(
            greyswan::instruction::ResolveDispute { owner_amount: 5_000_000, renter_amount: TOTAL_HELD - 5_000_000 },
            greyswan::accounts::ResolveDispute {
                config: config_pda(),
                listing,
                rental,
                admin,
                owner: owner.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            },
        )
    };

    // Before migration the legacy 41 bytes don't deserialize as the new
    // Config, so resolve_dispute is unavailable until migrate_config runs.
    // This is the deploy-ordering risk: migrate right after upgrading.
    let err = send_as(&mut svm, resolve(), admin).unwrap_err();
    assert!(err.contains("Custom(3003)"), "expected AccountDidNotDeserialize, got {err}");

    send_as(&mut svm, migrate_ix(admin), admin).unwrap();

    let renter_before = lamports(&svm, &renter.pubkey());
    let owner_before = lamports(&svm, &owner.pubkey());
    send_as(&mut svm, resolve(), admin).unwrap();
    assert_eq!(lamports(&svm, &owner.pubkey()), owner_before + 5_000_000);
    assert_eq!(lamports(&svm, &renter.pubkey()), renter_before + TOTAL_HELD - 5_000_000);
    assert_eq!(read::<Rental>(&svm, &rental).status, RentalStatus::Resolved);
}

// ---------- update_config ----------

fn svm_with_admin() -> (LiteSVM, Keypair) {
    let mut svm = setup();
    let admin = funded(&mut svm);
    init_config(&mut svm, &admin);
    (svm, admin)
}

fn update(svm: &mut LiteSVM, admin: &Keypair, u: ConfigUpdate) -> Result<(), String> {
    send(svm, update_ix(admin.pubkey(), u), admin, &[admin])
}

#[test]
fn update_config_applies_changes_and_leaves_the_rest() {
    let (mut svm, admin) = svm_with_admin();
    let reviewers: Vec<Pubkey> = (0..3).map(|_| Pubkey::new_unique()).collect();
    let verdict_key = Pubkey::new_unique();

    update(
        &mut svm,
        &admin,
        ConfigUpdate {
            verdict_key: Some(verdict_key),
            reviewers: Some(reviewers.clone()),
            rubric_bps: Some([0, 1000, 4000, 9000, 10000]),
            appeal_window_secs: Some(2 * 86_400),
            phase2_deadline_secs: Some(3 * 86_400),
            ..Default::default()
        },
    )
    .unwrap();

    let c = read::<Config>(&svm, &config_pda());
    assert_eq!(c.verdict_key, verdict_key);
    assert_eq!(c.reviewer_count, 3);
    assert_eq!(&c.reviewers[..3], &reviewers[..]);
    assert!(c.reviewers[3..].iter().all(|r| *r == Pubkey::default()));
    assert_eq!(c.rubric_bps, [0, 1000, 4000, 9000, 10000]);
    assert_eq!(c.appeal_window_secs, 2 * 86_400);
    assert_eq!(c.phase2_deadline_secs, 3 * 86_400);
    // Untouched fields keep their values.
    assert_eq!(c.admin, admin.pubkey());
    assert_eq!(c.extra_finding_bps, 500);
    assert_eq!(c.bond_min_lamports, 10_000_000);

    // Shrinking the reviewer list clears the slots it no longer uses.
    update(&mut svm, &admin, ConfigUpdate { reviewers: Some(vec![reviewers[0]]), ..Default::default() })
        .unwrap();
    let c = read::<Config>(&svm, &config_pda());
    assert_eq!(c.reviewer_count, 1);
    assert!(c.reviewers[1..].iter().all(|r| *r == Pubkey::default()));
}

#[test]
fn update_config_rejects_non_admin() {
    let (mut svm, _admin) = svm_with_admin();
    let stranger = funded(&mut svm);
    let result = update(&mut svm, &stranger, ConfigUpdate { paused: Some(true), ..Default::default() });
    assert_program_err(result, ErrorCode::NotAdmin);
}

#[test]
fn update_config_enforces_bounds() {
    let (mut svm, admin) = svm_with_admin();
    let before = raw_config(&svm);

    let cases: Vec<(ConfigUpdate, ErrorCode)> = vec![
        (ConfigUpdate { rubric_bps: Some([0, 1500, 5000, 8000, 10_001]), ..Default::default() }, ErrorCode::BpsOutOfRange),
        (ConfigUpdate { rubric_bps: Some([0, 5000, 1500, 8000, 10000]), ..Default::default() }, ErrorCode::RubricNotAscending),
        (ConfigUpdate { extra_finding_bps: Some(10_001), ..Default::default() }, ErrorCode::BpsOutOfRange),
        (ConfigUpdate { bond_bps: Some(10_001), ..Default::default() }, ErrorCode::BpsOutOfRange),
        (ConfigUpdate { auto_release_max_tier: Some(5), ..Default::default() }, ErrorCode::InvalidTier),
        (ConfigUpdate { appeal_window_secs: Some(86_399), ..Default::default() }, ErrorCode::AppealWindowTooShort),
        (ConfigUpdate { appeal_expiry_secs: Some(0), ..Default::default() }, ErrorCode::InvalidDuration),
        (ConfigUpdate { phase2_deadline_secs: Some(3_600), ..Default::default() }, ErrorCode::InvalidDuration),
        (ConfigUpdate { reviewers: Some((0..11).map(|_| Pubkey::new_unique()).collect()), ..Default::default() }, ErrorCode::TooManyReviewers),
        (ConfigUpdate { reviewers: Some(vec![Pubkey::default()]), ..Default::default() }, ErrorCode::InvalidReviewer),
        {
            let dup = Pubkey::new_unique();
            (ConfigUpdate { reviewers: Some(vec![dup, dup]), ..Default::default() }, ErrorCode::InvalidReviewer)
        },
    ];
    for (u, expected) in cases {
        assert_program_err(update(&mut svm, &admin, u), expected);
    }
    assert_eq!(raw_config(&svm), before, "rejected updates must not change anything");

    // The exact boundary values are accepted.
    update(
        &mut svm,
        &admin,
        ConfigUpdate {
            rubric_bps: Some([10000; 5]),
            extra_finding_bps: Some(10_000),
            bond_bps: Some(10_000),
            auto_release_max_tier: Some(4),
            appeal_window_secs: Some(86_400),
            phase2_deadline_secs: Some(86_400),
            reviewers: Some((0..10).map(|_| Pubkey::new_unique()).collect()),
            ..Default::default()
        },
    )
    .unwrap();
}

#[test]
fn update_config_rejected_before_migration() {
    let mut svm = svm_with_devnet_config();
    let result = send_as(
        &mut svm,
        update_ix(devnet_admin(), ConfigUpdate { paused: Some(true), ..Default::default() }),
        devnet_admin(),
    );
    assert!(result.unwrap_err().contains("Custom(3003)"));
}

#[test]
fn config_account_size_is_stable() {
    // 8 discriminator + 579 fields. If this changes, the migration target
    // size changed too: new fields must come out of `reserved` instead.
    assert_eq!(8 + Config::INIT_SPACE, 587);
}
