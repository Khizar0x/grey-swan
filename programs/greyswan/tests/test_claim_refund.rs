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

#[test]
fn test_claim_refund() {
    let program_id = greyswan::id();
    let owner = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/greyswan.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();

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

    // Try to claim the refund immediately — should fail, timeout has not elapsed
    let early_claim = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ClaimRefund {}.data(),
        greyswan::accounts::ClaimRefund {
            listing,
            rental: rental.pubkey(),
            renter: renter.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[early_claim], Some(&renter.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&renter]).unwrap();
    assert!(svm.send_transaction(tx).is_err());

    // Push the clock forward past the 7 day timeout
    let mut clock = svm.get_sysvar::<anchor_lang::solana_program::clock::Clock>();
    clock.unix_timestamp += 7 * 24 * 60 * 60 + 1;
    svm.set_sysvar(&clock);
    svm.expire_blockhash();

    let renter_before = svm.get_account(&renter.pubkey()).unwrap().lamports;

    // Now the claim should succeed
    let claim_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ClaimRefund {}.data(),
        greyswan::accounts::ClaimRefund {
            listing,
            rental: rental.pubkey(),
            renter: renter.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[claim_instruction], Some(&renter.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&renter]).unwrap();
    let result = svm.send_transaction(tx);
    if let Err(e) = &result {
        panic!("Claim after timeout failed: {:?}", e);
    }
    assert!(result.is_ok());

    let renter_after = svm.get_account(&renter.pubkey()).unwrap().lamports;
    let refund_total = total_rental_cost + deposit_amount;
    assert!(renter_after > renter_before);
    assert!(renter_after - renter_before <= refund_total);

    let rental_account = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &rental_account.data;
    let rental_state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();
    assert_eq!(rental_state.status, greyswan::state::RentalStatus::RefundedAuto);

    let listing_account = svm.get_account(&listing).unwrap();
    let mut listing_data: &[u8] = &listing_account.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut listing_data).unwrap();
    assert_eq!(listing_state.is_available, true);
}