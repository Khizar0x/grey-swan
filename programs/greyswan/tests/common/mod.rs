// Shared helpers for the integration tests. Each file under tests/ is its own
// crate, so a file pulls these in with `mod common;` and not every helper is
// used by every file.
#![allow(dead_code)]

use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{clock::Clock, instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const START_TIME: i64 = 1_757_800_000;
pub const WEEKLY_PRICE: u64 = 5_000_000;
pub const DEPOSIT: u64 = 20_000_000;
pub const WEEKS: u16 = 3;
pub const TOTAL_HELD: u64 = WEEKLY_PRICE * WEEKS as u64 + DEPOSIT;

pub fn program_bytes() -> &'static [u8] {
    include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/greyswan.so"))
}

pub fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program(greyswan::id(), program_bytes()).unwrap();
    set_time(&mut svm, START_TIME);
    svm
}

/// For tests that load real devnet account bytes: signature verification
/// off (see send_as) and devnet's actual Rent sysvar, which is cheaper than
/// LiteSVM's default. Some real devnet accounts (e.g. older listings) hold
/// less than the default rent-exempt minimum, so writes to them would fail
/// here under the default rules even though they succeed on devnet.
pub fn devnet_svm() -> LiteSVM {
    let mut svm = LiteSVM::new().with_sigverify(false);
    svm.add_program(greyswan::id(), program_bytes()).unwrap();
    // Read from devnet's SysvarRent111... account. The field names are
    // deprecated in favour of a constructor this crate version doesn't have.
    #[allow(deprecated)]
    let rent = anchor_lang::solana_program::rent::Rent {
        lamports_per_byte_year: 5080,
        exemption_threshold: 1.0,
        burn_percent: 50,
    };
    svm.set_sysvar(&rent);
    set_time(&mut svm, START_TIME);
    svm
}

pub fn set_time(svm: &mut LiteSVM, unix_timestamp: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = unix_timestamp;
    svm.set_sysvar(&clock);
    svm.expire_blockhash();
}

pub fn warp(svm: &mut LiteSVM, seconds: i64) {
    let now = svm.get_sysvar::<Clock>().unix_timestamp;
    set_time(svm, now + seconds);
}

pub fn funded(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 10_000_000_000).unwrap();
    kp
}

pub fn send(
    svm: &mut LiteSVM,
    ix: Instruction,
    payer: &Keypair,
    signers: &[&Keypair],
) -> Result<(), String> {
    // A fresh blockhash per send stops LiteSVM rejecting a byte-identical
    // retry (e.g. the same failing call made twice) as AlreadyProcessed.
    svm.expire_blockhash();
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &bh);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

/// Asserts the call failed with this program's own error code.
pub fn assert_program_err(result: Result<(), String>, code: greyswan::error::ErrorCode) {
    let expected = format!("Custom({})", u32::from(code));
    match result {
        Ok(()) => panic!("expected failure with {expected}, but the call succeeded"),
        Err(e) => assert!(e.contains(&expected), "expected {expected}, got {e}"),
    }
}

pub fn ix<D: InstructionData, A: ToAccountMetas>(data: D, accounts: A) -> Instruction {
    Instruction::new_with_bytes(greyswan::id(), &data.data(), accounts.to_account_metas(None))
}

pub fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"config"], &greyswan::id()).0
}

pub fn timeline_pda(rental: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"timeline", rental.as_ref()], &greyswan::id()).0
}

pub fn dispute_pda(rental: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"dispute", rental.as_ref()], &greyswan::id()).0
}

pub fn pool_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"pool"], &greyswan::id()).0
}

pub fn init_pool_ix(admin: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::InitPool {},
        greyswan::accounts::InitPool {
            config: config_pda(),
            pool: pool_pda(),
            admin,
            system_program: system_program::ID,
        },
    )
}

pub fn init_pool(svm: &mut LiteSVM, admin: &Keypair) {
    send(svm, init_pool_ix(admin.pubkey()), admin, &[admin]).unwrap();
}

pub fn listing_pda(owner: &Pubkey, item_name: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"listing", owner.as_ref(), item_name.as_bytes()], &greyswan::id()).0
}

pub fn list_item(svm: &mut LiteSVM, owner: &Keypair, item_name: &str) -> Pubkey {
    let listing = listing_pda(&owner.pubkey(), item_name);
    send(
        svm,
        ix(
            greyswan::instruction::ListItem {
                item_name: item_name.to_string(),
                description: "Test item".to_string(),
                photos: "ipfs://QmListing".to_string(),
                rental_price: WEEKLY_PRICE,
                deposit_amount: DEPOSIT,
                estimated_value: 100_000_000,
                category: greyswan::state::Category::PhotographyVideo,
                rarity_tier: greyswan::state::RarityTier::Common,
            },
            greyswan::accounts::ListItem { listing, owner: owner.pubkey(), system_program: system_program::ID },
        ),
        owner,
        &[owner],
    )
    .unwrap();
    listing
}

pub fn rent(svm: &mut LiteSVM, listing: Pubkey, renter: &Keypair) -> Pubkey {
    let rental = Keypair::new();
    send(
        svm,
        ix(
            greyswan::instruction::RentItem { weeks: WEEKS },
            greyswan::accounts::RentItem {
                listing,
                rental: rental.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            },
        ),
        renter,
        &[renter, &rental],
    )
    .unwrap();
    rental.pubkey()
}

pub fn phase1(svm: &mut LiteSVM, rental: Pubkey, owner: &Keypair) -> Result<(), String> {
    send(
        svm,
        ix(
            greyswan::instruction::SubmitPhase1 {
                photos: "ipfs://QmPhase1".to_string(),
                tracking_number: "RM123456789GB".to_string(),
            },
            greyswan::accounts::SubmitPhase1 {
                rental,
                timeline: timeline_pda(&rental),
                config: config_pda(),
                owner: owner.pubkey(),
                system_program: system_program::ID,
            },
        ),
        owner,
        &[owner],
    )
}

pub fn phase2(svm: &mut LiteSVM, rental: Pubkey, renter: &Keypair) -> Result<(), String> {
    send(
        svm,
        ix(
            greyswan::instruction::SubmitPhase2 { photos: "ipfs://QmPhase2".to_string() },
            greyswan::accounts::SubmitPhase2 {
                rental,
                timeline: timeline_pda(&rental),
                config: config_pda(),
                renter: renter.pubkey(),
            },
        ),
        renter,
        &[renter],
    )
}

pub fn phase3(svm: &mut LiteSVM, rental: Pubkey, renter: &Keypair) -> Result<(), String> {
    send(
        svm,
        ix(
            greyswan::instruction::SubmitPhase3 {
                photos: "ipfs://QmPhase3".to_string(),
                tracking_number: "RM987654321GB".to_string(),
            },
            greyswan::accounts::SubmitPhase3 {
                rental,
                timeline: timeline_pda(&rental),
                config: config_pda(),
                renter: renter.pubkey(),
            },
        ),
        renter,
        &[renter],
    )
}

pub fn phase4(svm: &mut LiteSVM, rental: Pubkey, owner: &Keypair) -> Result<(), String> {
    send(
        svm,
        ix(
            greyswan::instruction::SubmitPhase4 { photos: "ipfs://QmPhase4".to_string() },
            greyswan::accounts::SubmitPhase4 { rental, owner: owner.pubkey() },
        ),
        owner,
        &[owner],
    )
}

pub fn all_phases(svm: &mut LiteSVM, rental: Pubkey, owner: &Keypair, renter: &Keypair) {
    phase1(svm, rental, owner).unwrap();
    phase2(svm, rental, renter).unwrap();
    phase3(svm, rental, renter).unwrap();
    phase4(svm, rental, owner).unwrap();
}

pub fn confirm_after_deadline_ix(rental: Pubkey, owner: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::ConfirmArrivalAfterDeadline {},
        greyswan::accounts::ConfirmArrivalAfterDeadline { rental, timeline: timeline_pda(&rental), config: config_pda(), owner },
    )
}

pub fn confirm_after_deadline(svm: &mut LiteSVM, rental: Pubkey, signer: &Keypair) -> Result<(), String> {
    send(svm, confirm_after_deadline_ix(rental, signer.pubkey()), signer, &[signer])
}

pub fn flag_return_issue_ix(rental: Pubkey, owner: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::FlagReturnIssue { reason: "Lens is scratched".to_string() },
        greyswan::accounts::FlagReturnIssue {
            rental,
            timeline: timeline_pda(&rental),
            dispute: dispute_pda(&rental),
            owner,
            system_program: system_program::ID,
        },
    )
}

pub fn flag_return_issue(svm: &mut LiteSVM, rental: Pubkey, owner: &Keypair) -> Result<(), String> {
    send(svm, flag_return_issue_ix(rental, owner.pubkey()), owner, &[owner])
}

pub fn reject_on_arrival_ix(rental: Pubkey, renter: Pubkey) -> Instruction {
    ix(
        greyswan::instruction::RejectOnArrival {
            photos: "ipfs://QmArrival".to_string(),
            reason: "Wrong item sent".to_string(),
        },
        greyswan::accounts::RejectOnArrival {
            rental,
            timeline: timeline_pda(&rental),
            dispute: dispute_pda(&rental),
            renter,
            system_program: system_program::ID,
        },
    )
}

pub fn reject_on_arrival(svm: &mut LiteSVM, rental: Pubkey, renter: &Keypair) -> Result<(), String> {
    send(svm, reject_on_arrival_ix(rental, renter.pubkey()), renter, &[renter])
}

pub fn resolve_dispute_ix(
    listing: Pubkey,
    rental: Pubkey,
    admin: Pubkey,
    owner: Pubkey,
    renter: Pubkey,
    owner_amount: u64,
    renter_amount: u64,
) -> Instruction {
    ix(
        greyswan::instruction::ResolveDispute { owner_amount, renter_amount },
        greyswan::accounts::ResolveDispute {
            config: config_pda(),
            listing,
            rental,
            dispute: dispute_pda(&rental),
            second_reviewer: None,
            admin,
            owner,
            renter,
            system_program: system_program::ID,
        },
    )
}

pub fn init_config(svm: &mut LiteSVM, admin: &Keypair) {
    send(
        svm,
        ix(
            greyswan::instruction::InitConfig { admin: admin.pubkey() },
            greyswan::accounts::InitConfig {
                config: config_pda(),
                payer: admin.pubkey(),
                system_program: system_program::ID,
            },
        ),
        admin,
        &[admin],
    )
    .unwrap();
}

/// Creates a Config with a throwaway admin, for tests that only need one to
/// exist (phase 2 reads the arrival deadline from it).
pub fn init_test_config(svm: &mut LiteSVM) -> Keypair {
    let admin = funded(svm);
    init_config(svm, &admin);
    admin
}

/// A real devnet rental, dumped read-only with `solana account
/// 5gTKMr7zK5WDfS4wwffGHbKx9TShBYnJaKf3d4Uz56xC --url devnet --output json`.
/// It is Active and at BeforeSending: shipped under the old program, so it
/// has no timeline. It shipped in September 2026, far outside any window.
/// Returns the svm (with a fresh, current Config), the rental and its renter.
pub fn legacy_shipped_rental() -> (LiteSVM, Pubkey, Pubkey) {
    use greyswan::state::{HandoverPhase, Rental, RentalStatus};
    let mut svm = devnet_svm();
    set_time(&mut svm, START_TIME + 60 * 86_400);
    init_test_config(&mut svm);
    let rental = load_fixture(&mut svm, include_str!("../fixtures/devnet_legacy_shipped_rental.json"));
    let state = read::<Rental>(&svm, &rental);
    assert_eq!(state.status, RentalStatus::Active);
    assert_eq!(state.current_phase, HandoverPhase::BeforeSending);
    assert!(svm.get_account(&timeline_pda(&rental)).is_none());
    svm.airdrop(&state.renter, 1_000_000_000).unwrap();
    (svm, rental, state.renter)
}

/// The legacy shipped rental's listing (GBorwimA4Zyx...) was never dumped
/// from devnet, so this writes a stand-in Listing at that address, owned by
/// the program, with the rental's owner and prices and is_available false.
/// Enough for instructions that take the listing (resolve_dispute,
/// complete_after_inspection_deadline); the rental itself is the real bytes.
pub fn stand_in_listing(svm: &mut LiteSVM, rental: &greyswan::state::Rental) {
    use {anchor_lang::{AccountSerialize, Space}, greyswan::state::*};
    let listing = Listing {
        owner: rental.owner,
        item_name: "Legacy item".to_string(),
        description: String::new(),
        photos: String::new(),
        rental_price: rental.weekly_price,
        deposit_amount: rental.deposit_amount,
        estimated_value: 0,
        category: Category::Other,
        rarity_tier: RarityTier::Common,
        is_available: false,
        bump: 255,
    };
    let mut data = Vec::new();
    listing.try_serialize(&mut data).unwrap();
    data.resize(8 + Listing::INIT_SPACE, 0);
    let rent = svm.get_sysvar::<anchor_lang::solana_program::rent::Rent>();
    svm.set_account(
        rental.listing,
        solana_account::Account {
            lamports: rent.minimum_balance(data.len()),
            data,
            owner: greyswan::id(),
            executable: false,
            rent_epoch: u64::MAX,
        },
    )
    .unwrap();
}

/// Loads an account dumped with `solana account <address> --output json`
/// and returns its address.
pub fn load_fixture(svm: &mut LiteSVM, json: &str) -> Pubkey {
    use {base64::Engine, std::str::FromStr};
    let json: serde_json::Value = serde_json::from_str(json).unwrap();
    let acct = &json["account"];
    let data = base64::engine::general_purpose::STANDARD
        .decode(acct["data"][0].as_str().unwrap())
        .unwrap();
    let address = Pubkey::from_str(json["pubkey"].as_str().unwrap()).unwrap();
    svm.set_account(
        address,
        solana_account::Account {
            lamports: acct["lamports"].as_u64().unwrap(),
            data,
            owner: Pubkey::from_str(acct["owner"].as_str().unwrap()).unwrap(),
            executable: false,
            rent_epoch: u64::MAX,
        },
    )
    .unwrap();
    address
}

/// Sends with placeholder signatures, to act as a wallet whose private key
/// the tests don't hold (the devnet admin, a devnet renter). Only works on
/// an svm built with `.with_sigverify(false)`; every check inside the
/// program still runs, only the transaction's ed25519 check is skipped.
pub fn send_as(svm: &mut LiteSVM, ix: Instruction, payer: Pubkey) -> Result<(), String> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &svm.latest_blockhash());
    let tx = VersionedTransaction {
        signatures: vec![
            solana_signature::Signature::default();
            msg.header.num_required_signatures as usize
        ],
        message: VersionedMessage::Legacy(msg),
    };
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.err))
}

pub fn read<T: AccountDeserialize>(svm: &LiteSVM, address: &Pubkey) -> T {
    let acct = svm.get_account(address).unwrap();
    let mut data: &[u8] = &acct.data;
    T::try_deserialize(&mut data).unwrap()
}

pub fn lamports(svm: &LiteSVM, address: &Pubkey) -> u64 {
    svm.get_account(address).map(|a| a.lamports).unwrap_or(0)
}
