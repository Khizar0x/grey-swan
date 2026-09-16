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
fn test_list_item() {
    let program_id = greyswan::id();
    let owner = Keypair::new();

    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/greyswan.so"
    ));
    svm.add_program(program_id, bytes).unwrap();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

    let item_name = "Canon R5".to_string();
    let description = "Full frame mirrorless camera".to_string();
    let photos = "ipfs://QmSampleListingPhotosManifest".to_string();
    let rental_price: u64 = 5_000_000;
    let deposit_amount: u64 = 20_000_000;
    let estimated_value: u64 = 100_000_000;

    let (listing, _bump) = Pubkey::find_program_address(
        &[b"listing", owner.pubkey().as_ref(), item_name.as_bytes()],
        &program_id,
    );

    let instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::ListItem {
            item_name: item_name.clone(),
            description: description.clone(),
            photos: photos.clone(),
            rental_price,
            deposit_amount,
            estimated_value,
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
    let msg = Message::new_with_blockhash(&[instruction], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();

    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let listing_account = svm.get_account(&listing).unwrap();
    let mut data: &[u8] = &listing_account.data;
    let listing_state = greyswan::state::Listing::try_deserialize(&mut data).unwrap();

    assert_eq!(listing_state.owner, owner.pubkey());
    assert_eq!(listing_state.item_name, item_name);
    assert_eq!(listing_state.description, description);
    assert_eq!(listing_state.photos, photos);
    assert_eq!(listing_state.rental_price, rental_price);
    assert_eq!(listing_state.deposit_amount, deposit_amount);
    assert_eq!(listing_state.estimated_value, estimated_value);
    assert_eq!(listing_state.category, greyswan::state::Category::PhotographyVideo);
    assert_eq!(listing_state.rarity_tier, greyswan::state::RarityTier::Common);
    assert_eq!(listing_state.is_available, true);
}