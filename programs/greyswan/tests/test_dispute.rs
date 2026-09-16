use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

fn setup() -> (LiteSVM, Pubkey) {
    let program_id = greyswan::id();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/greyswan.so"
    ));
    svm.add_program(program_id, bytes).unwrap();

    let mut clock = svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>();
    clock.unix_timestamp = 1_757_800_000;
    svm.set_sysvar(&clock);

    (svm, program_id)
}

fn send(
    svm: &mut LiteSVM,
    ix: Instruction,
    payer: &Keypair,
    signers: &[&Keypair],
) -> std::result::Result<(), String> {
    let bh = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer.pubkey()), &bh);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e))
}

#[test]
fn test_flag_return_issue() {
    let (mut svm, program_id) = setup();
    let owner = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();

    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();

    let item_name = "Canon R5".to_string();
    let weekly_price: u64 = 5_000_000;
    let deposit_amount: u64 = 20_000_000;
    let weeks: u16 = 3;

    let (listing, _) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::ListItem {
                item_name: item_name.clone(),
                description: "Full frame mirrorless camera".to_string(),
                photos: "ipfs://QmListing".to_string(),
                rental_price: weekly_price,
                deposit_amount,
                estimated_value: 100_000_000,
                category: greyswan::state::Category::PhotographyVideo,
                rarity_tier: greyswan::state::RarityTier::Common,
            }
            .data(),
            greyswan::accounts::ListItem {
                listing,
                owner: owner.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::RentItem { weeks }.data(),
            greyswan::accounts::RentItem {
                listing,
                rental: rental.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter, &rental],
    )
    .unwrap();

    // Flagging before phase 4 should fail
    let early = send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::FlagReturnIssue {
                reason: "Lens is scratched".to_string(),
            }
            .data(),
            greyswan::accounts::FlagReturnIssue {
                rental: rental.pubkey(),
                owner: owner.pubkey(),
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    );
    assert!(early.is_err());

    // Walk the four phases
    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::SubmitPhase1 {
                photos: "ipfs://QmPhase1".to_string(),
                tracking_number: "RM123456789GB".to_string(),
            }
            .data(),
            greyswan::accounts::SubmitPhase1 {
                rental: rental.pubkey(),
                owner: owner.pubkey(),
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::SubmitPhase2 {
                photos: "ipfs://QmPhase2".to_string(),
            }
            .data(),
            greyswan::accounts::SubmitPhase2 {
                rental: rental.pubkey(),
                renter: renter.pubkey(),
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::SubmitPhase3 {
                photos: "ipfs://QmPhase3".to_string(),
                tracking_number: "RM987654321GB".to_string(),
            }
            .data(),
            greyswan::accounts::SubmitPhase3 {
                rental: rental.pubkey(),
                renter: renter.pubkey(),
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::SubmitPhase4 {
                photos: "ipfs://QmPhase4".to_string(),
            }
            .data(),
            greyswan::accounts::SubmitPhase4 {
                rental: rental.pubkey(),
                owner: owner.pubkey(),
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    svm.expire_blockhash();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::FlagReturnIssue {
                reason: "Lens is scratched".to_string(),
            }
            .data(),
            greyswan::accounts::FlagReturnIssue {
                rental: rental.pubkey(),
                owner: owner.pubkey(),
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    let acct = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &acct.data;
    let state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();
    assert_eq!(state.status, greyswan::state::RentalStatus::Disputed);
    assert_eq!(state.dispute_kind, greyswan::state::DisputeKind::ReturnIssue);
    assert_eq!(state.dispute_reason, "Lens is scratched");
    assert!(state.disputed_at > 0);
}

#[test]
fn test_reject_on_arrival() {
    let (mut svm, program_id) = setup();
    let owner = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();

    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();

    let item_name = "Canon R5".to_string();
    let (listing, _) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::ListItem {
                item_name: item_name.clone(),
                description: "Full frame mirrorless camera".to_string(),
                photos: "ipfs://QmListing".to_string(),
                rental_price: 5_000_000,
                deposit_amount: 20_000_000,
                estimated_value: 100_000_000,
                category: greyswan::state::Category::PhotographyVideo,
                rarity_tier: greyswan::state::RarityTier::Common,
            }
            .data(),
            greyswan::accounts::ListItem {
                listing,
                owner: owner.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::RentItem { weeks: 2 }.data(),
            greyswan::accounts::RentItem {
                listing,
                rental: rental.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter, &rental],
    )
    .unwrap();

    // Rejecting before the owner has shipped should fail
    let too_early = send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::RejectOnArrival {
                photos: "ipfs://QmArrival".to_string(),
                reason: "Wrong item sent".to_string(),
            }
            .data(),
            greyswan::accounts::RejectOnArrival {
                rental: rental.pubkey(),
                renter: renter.pubkey(),
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter],
    );
    assert!(too_early.is_err());

    // Owner ships
    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::SubmitPhase1 {
                photos: "ipfs://QmPhase1".to_string(),
                tracking_number: "RM123456789GB".to_string(),
            }
            .data(),
            greyswan::accounts::SubmitPhase1 {
                rental: rental.pubkey(),
                owner: owner.pubkey(),
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    svm.expire_blockhash();

    // Renter rejects on arrival
    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::RejectOnArrival {
                photos: "ipfs://QmArrival".to_string(),
                reason: "Wrong item sent".to_string(),
            }
            .data(),
            greyswan::accounts::RejectOnArrival {
                rental: rental.pubkey(),
                renter: renter.pubkey(),
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter],
    )
    .unwrap();

    let acct = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &acct.data;
    let state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();
    assert_eq!(state.status, greyswan::state::RentalStatus::Disputed);
    assert_eq!(state.dispute_kind, greyswan::state::DisputeKind::ArrivalIssue);
    assert_eq!(state.dispute_reason, "Wrong item sent");
    assert_eq!(state.phase2_photos, "ipfs://QmArrival");
}

#[test]
fn test_resolve_dispute() {
    let (mut svm, program_id) = setup();
    let owner = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();
    let admin = Keypair::new();
    let imposter = Keypair::new();

    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&imposter.pubkey(), 1_000_000_000).unwrap();

    let (config, _) = Pubkey::find_program_address(&[b"config"], &program_id);

    // Set up the config with our test admin
    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::InitConfig {
                admin: admin.pubkey(),
            }
            .data(),
            greyswan::accounts::InitConfig {
                config,
                payer: admin.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &admin,
        &[&admin],
    )
    .unwrap();

    let item_name = "Canon R5".to_string();
    let weekly_price: u64 = 5_000_000;
    let deposit_amount: u64 = 20_000_000;
    let weeks: u16 = 2;
    let total_held = weekly_price * weeks as u64 + deposit_amount;

    let (listing, _) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::ListItem {
                item_name: item_name.clone(),
                description: "Full frame mirrorless camera".to_string(),
                photos: "ipfs://QmListing".to_string(),
                rental_price: weekly_price,
                deposit_amount,
                estimated_value: 100_000_000,
                category: greyswan::state::Category::PhotographyVideo,
                rarity_tier: greyswan::state::RarityTier::Common,
            }
            .data(),
            greyswan::accounts::ListItem {
                listing,
                owner: owner.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::RentItem { weeks }.data(),
            greyswan::accounts::RentItem {
                listing,
                rental: rental.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter, &rental],
    )
    .unwrap();

    // Owner ships, renter rejects on arrival
    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::SubmitPhase1 {
                photos: "ipfs://QmPhase1".to_string(),
                tracking_number: "RM123456789GB".to_string(),
            }
            .data(),
            greyswan::accounts::SubmitPhase1 {
                rental: rental.pubkey(),
                owner: owner.pubkey(),
            }
            .to_account_metas(None),
        ),
        &owner,
        &[&owner],
    )
    .unwrap();

    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::RejectOnArrival {
                photos: "ipfs://QmArrival".to_string(),
                reason: "Wrong item sent".to_string(),
            }
            .data(),
            greyswan::accounts::RejectOnArrival {
                rental: rental.pubkey(),
                renter: renter.pubkey(),
            }
            .to_account_metas(None),
        ),
        &renter,
        &[&renter],
    )
    .unwrap();

    // Someone who is not the admin cannot resolve
    let not_admin = send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::ResolveDispute {
                owner_amount: 0,
                renter_amount: total_held,
            }
            .data(),
            greyswan::accounts::ResolveDispute {
                config,
                listing,
                rental: rental.pubkey(),
                admin: imposter.pubkey(),
                owner: owner.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &imposter,
        &[&imposter],
    );
    assert!(not_admin.is_err());

    // Amounts that do not add up to the total are rejected
    let bad_split = send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::ResolveDispute {
                owner_amount: 1,
                renter_amount: 1,
            }
            .data(),
            greyswan::accounts::ResolveDispute {
                config,
                listing,
                rental: rental.pubkey(),
                admin: admin.pubkey(),
                owner: owner.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &admin,
        &[&admin],
    );
    assert!(bad_split.is_err());

    let renter_before = svm.get_account(&renter.pubkey()).unwrap().lamports;

    // Admin rules in the renter's favour — full refund
    svm.expire_blockhash();
    send(
        &mut svm,
        Instruction::new_with_bytes(
            program_id,
            &greyswan::instruction::ResolveDispute {
                owner_amount: 0,
                renter_amount: total_held,
            }
            .data(),
            greyswan::accounts::ResolveDispute {
                config,
                listing,
                rental: rental.pubkey(),
                admin: admin.pubkey(),
                owner: owner.pubkey(),
                renter: renter.pubkey(),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        ),
        &admin,
        &[&admin],
    )
    .unwrap();

    let renter_after = svm.get_account(&renter.pubkey()).unwrap().lamports;
    assert_eq!(renter_after - renter_before, total_held);

    let acct = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &acct.data;
    let state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();
    assert_eq!(state.status, greyswan::state::RentalStatus::Resolved);

    let listing_acct = svm.get_account(&listing).unwrap();
    let mut listing_data: &[u8] = &listing_acct.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut listing_data).unwrap();
    assert_eq!(listing_state.is_available, true);
}