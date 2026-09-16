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
use std::str::FromStr;

#[test]
fn test_confirm_return() {
    let program_id = greyswan::id();
    let owner = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();
    let platform_wallet =
        Pubkey::from_str("32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD").unwrap();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/greyswan.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&platform_wallet, 1_000_000_000).unwrap();

    let item_name = "Canon R5".to_string();
    let weekly_price: u64 = 5_000_000;
    let deposit_amount: u64 = 20_000_000;
    let weeks: u16 = 3;
    let total_rental_cost = weekly_price * weeks as u64;

    let (listing, _bump) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    // List the item
    let list_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ListItem {
            item_name: item_name.clone(),
            description: "Full frame mirrorless camera".to_string(),
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
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
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[list_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Rent it
    let rent_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::RentItem { weeks }.data(),
        greyswan::accounts::RentItem {
            listing,
            rental: rental.pubkey(),
            renter: renter.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[rent_instruction], Some(&renter.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&renter, &rental]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Confirming before the handover phases are done should fail
    let early_confirm = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ConfirmReturn {}.data(),
        greyswan::accounts::ConfirmReturn {
            listing,
            rental: rental.pubkey(),
            owner: owner.pubkey(),
            renter: renter.pubkey(),
            platform_wallet,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[early_confirm], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_err());

    // Phase 1 — owner, before sending
    let p1 = Instruction::new_with_bytes(
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
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[p1], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Phase 2 — renter, on arrival
    let p2 = Instruction::new_with_bytes(
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
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[p2], Some(&renter.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&renter]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Phase 3 — renter, before returning
    let p3 = Instruction::new_with_bytes(
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
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[p3], Some(&renter.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&renter]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Phase 4 — owner, on return
    let p4 = Instruction::new_with_bytes(
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
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[p4], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    svm.expire_blockhash();

    // Record balances before confirming
    let owner_before = svm.get_account(&owner.pubkey()).unwrap().lamports;
    let renter_before = svm.get_account(&renter.pubkey()).unwrap().lamports;
    let platform_before = svm.get_account(&platform_wallet).unwrap().lamports;

    // Now confirm the return
    let confirm_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ConfirmReturn {}.data(),
        greyswan::accounts::ConfirmReturn {
            listing,
            rental: rental.pubkey(),
            owner: owner.pubkey(),
            renter: renter.pubkey(),
            platform_wallet,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[confirm_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    let result = svm.send_transaction(tx);
    if let Err(e) = &result {
        panic!("Confirm return failed: {:?}", e);
    }

    let expected_fee = total_rental_cost * 10 / 100;
    let expected_owner_payout = total_rental_cost - expected_fee;

    let owner_after = svm.get_account(&owner.pubkey()).unwrap().lamports;
    let renter_after = svm.get_account(&renter.pubkey()).unwrap().lamports;
    let platform_after = svm.get_account(&platform_wallet).unwrap().lamports;

    assert_eq!(renter_after - renter_before, deposit_amount);
    assert_eq!(platform_after - platform_before, expected_fee);
    assert!(owner_after > owner_before);
    assert!(owner_after - owner_before <= expected_owner_payout);

    let rental_account = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &rental_account.data;
    let rental_state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();
    assert_eq!(rental_state.status, greyswan::state::RentalStatus::Completed);
    assert_eq!(rental_state.phase1_photos, "ipfs://QmPhase1");
    assert_eq!(rental_state.outbound_tracking, "RM123456789GB");
    assert_eq!(rental_state.phase2_photos, "ipfs://QmPhase2");
    assert_eq!(rental_state.phase3_photos, "ipfs://QmPhase3");
    assert_eq!(rental_state.return_tracking, "RM987654321GB");
    assert_eq!(rental_state.phase4_photos, "ipfs://QmPhase4");

    let listing_account = svm.get_account(&listing).unwrap();
    let mut listing_data: &[u8] = &listing_account.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut listing_data).unwrap();
    assert_eq!(listing_state.is_available, true);
}