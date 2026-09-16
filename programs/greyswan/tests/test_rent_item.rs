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
fn test_rent_item() {
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

    // Rent it for 3 weeks
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
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let rental_account = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &rental_account.data;
    let rental_state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();

    assert_eq!(rental_state.listing, listing);
    assert_eq!(rental_state.owner, owner.pubkey());
    assert_eq!(rental_state.renter, renter.pubkey());
    assert_eq!(rental_state.weekly_price, weekly_price);
    assert_eq!(rental_state.weeks, weeks);
    assert_eq!(rental_state.total_rental_cost, weekly_price * weeks as u64);
    assert_eq!(rental_state.deposit_amount, deposit_amount);
    assert_eq!(rental_state.status, greyswan::state::RentalStatus::Active);

    // Confirm the listing is now marked unavailable
    let listing_account = svm.get_account(&listing).unwrap();
    let mut listing_data: &[u8] = &listing_account.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut listing_data).unwrap();
    assert_eq!(listing_state.is_available, false);

    // Try to rent the same listing again — should fail
    let second_renter = Keypair::new();
    let second_rental = Keypair::new();
    svm.airdrop(&second_renter.pubkey(), 1_000_000_000).unwrap();

    let second_rent_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::RentItem { weeks: 1 }.data(),
        greyswan::accounts::RentItem {
            listing,
            rental: second_rental.pubkey(),
            renter: second_renter.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );

    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(
        &[second_rent_instruction],
        Some(&second_renter.pubkey()),
        &blockhash,
    );
    let tx = VersionedTransaction::try_new(
        VersionedMessage::Legacy(msg),
        &[&second_renter, &second_rental],
    )
    .unwrap();
    assert!(svm.send_transaction(tx).is_err());
}