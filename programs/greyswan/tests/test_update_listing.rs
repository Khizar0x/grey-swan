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

fn setup() -> LiteSVM {
    let program_id = greyswan::id();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/greyswan.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm
}

#[test]
fn test_update_listing() {
    let program_id = greyswan::id();
    let owner = Keypair::new();
    let stranger = Keypair::new();

    let mut svm = setup();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();

    let item_name = "Canon R5".to_string();
    let (listing, _bump) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    let list_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ListItem {
            item_name: item_name.clone(),
            description: "Full frame mirrorless camera".to_string(),
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
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
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[list_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // A stranger cannot update the listing.
    let bad_update = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::UpdateListing {
            description: "Hijacked".to_string(),
            photos: "ipfs://QmHijacked".to_string(),
            rental_price: 1,
            deposit_amount: 1,
        }
        .data(),
        greyswan::accounts::UpdateListing {
            listing,
            owner: stranger.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[bad_update], Some(&stranger.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&stranger]).unwrap();
    assert!(svm.send_transaction(tx).is_err());

    // The real owner can update price, deposit, description, and photos.
    let new_description = "Full frame mirrorless camera, now with a spare battery".to_string();
    let new_photos = "ipfs://QmUpdatedPhotosManifest".to_string();
    let new_price: u64 = 6_000_000;
    let new_deposit: u64 = 25_000_000;

    let update_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::UpdateListing {
            description: new_description.clone(),
            photos: new_photos.clone(),
            rental_price: new_price,
            deposit_amount: new_deposit,
        }
        .data(),
        greyswan::accounts::UpdateListing {
            listing,
            owner: owner.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[update_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    let result = svm.send_transaction(tx);
    if let Err(e) = &result {
        panic!("Update listing failed: {:?}", e);
    }

    let listing_account = svm.get_account(&listing).unwrap();
    let mut data: &[u8] = &listing_account.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut data).unwrap();

    assert_eq!(listing_state.description, new_description);
    assert_eq!(listing_state.photos, new_photos);
    assert_eq!(listing_state.rental_price, new_price);
    assert_eq!(listing_state.deposit_amount, new_deposit);
    // Immutable fields stay put.
    assert_eq!(listing_state.item_name, item_name);
    assert_eq!(listing_state.category, greyswan::state::Category::PhotographyVideo);
    assert_eq!(listing_state.rarity_tier, greyswan::state::RarityTier::Common);
}

#[test]
fn test_update_listing_accepts_long_description_within_new_cap() {
    let program_id = greyswan::id();
    let owner = Keypair::new();

    let mut svm = setup();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    let item_name = "Long Description Item".to_string();
    let (listing, _bump) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    let list_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ListItem {
            item_name: item_name.clone(),
            description: "Short to start".to_string(),
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
            rental_price: 5_000_000,
            deposit_amount: 20_000_000,
            estimated_value: 100_000_000,
            category: greyswan::state::Category::Other,
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

    // A description well over the old 500-char cap but within the new
    // 1200-char one should be accepted.
    let long_description: String = "A".repeat(1100);
    let update_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::UpdateListing {
            description: long_description.clone(),
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
            rental_price: 5_000_000,
            deposit_amount: 20_000_000,
        }
        .data(),
        greyswan::accounts::UpdateListing {
            listing,
            owner: owner.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[update_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    let result = svm.send_transaction(tx);
    if let Err(e) = &result {
        panic!("Update with long description failed: {:?}", e);
    }

    let listing_account = svm.get_account(&listing).unwrap();
    let mut data: &[u8] = &listing_account.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut data).unwrap();
    assert_eq!(listing_state.description, long_description);
    assert_eq!(listing_state.description.len(), 1100);

    // And 1201 characters — one over the new cap — should still be rejected.
    let too_long_description: String = "B".repeat(1201);
    let over_cap_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::UpdateListing {
            description: too_long_description,
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
            rental_price: 5_000_000,
            deposit_amount: 20_000_000,
        }
        .data(),
        greyswan::accounts::UpdateListing {
            listing,
            owner: owner.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[over_cap_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_update_listing_respects_deposit_cap() {
    let program_id = greyswan::id();
    let owner = Keypair::new();

    let mut svm = setup();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    let item_name = "Vintage Leica".to_string();
    let estimated_value: u64 = 100_000_000;
    let (listing, _bump) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    let list_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ListItem {
            item_name: item_name.clone(),
            description: "A very old camera".to_string(),
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
            rental_price: 5_000_000,
            deposit_amount: 20_000_000, // 20% of estimated_value, within cap
            estimated_value,
            category: greyswan::state::Category::PhotographyVideo,
            rarity_tier: greyswan::state::RarityTier::Antique,
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

    // Try to raise the deposit above 45% of estimated_value — should fail.
    let over_cap_deposit = estimated_value * 46 / 100;
    let update_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::UpdateListing {
            description: "A very old camera".to_string(),
            photos: "ipfs://QmSampleListingPhotosManifest".to_string(),
            rental_price: 5_000_000,
            deposit_amount: over_cap_deposit,
        }
        .data(),
        greyswan::accounts::UpdateListing {
            listing,
            owner: owner.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[update_instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}
