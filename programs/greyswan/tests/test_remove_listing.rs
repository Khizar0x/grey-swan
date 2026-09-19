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

fn remove_listing_ix(program_id: Pubkey, listing: Pubkey, owner: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::RemoveListing {}.data(),
        greyswan::accounts::RemoveListing { listing, owner }.to_account_metas(None),
    )
}

#[test]
fn test_remove_listing_rejects_non_owner_and_while_rented() {
    let program_id = greyswan::id();
    let owner = Keypair::new();
    let stranger = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();

    let mut svm = setup();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();

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

    // A stranger cannot remove it.
    let ix = remove_listing_ix(program_id, listing, stranger.pubkey());
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&stranger.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&stranger]).unwrap();
    assert!(svm.send_transaction(tx).is_err());

    // Rent it out, then even the real owner can't remove it while rented.
    let rent_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::RentItem { weeks: 1 }.data(),
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

    let ix = remove_listing_ix(program_id, listing, owner.pubkey());
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_remove_listing_closes_account_but_preserves_rental_history() {
    let program_id = greyswan::id();
    let owner = Keypair::new();
    let renter = Keypair::new();
    let rental = Keypair::new();
    let platform_wallet =
        Pubkey::from_str("32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD").unwrap();

    let mut svm = setup();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&renter.pubkey(), 1_000_000_000).unwrap();
    svm.airdrop(&platform_wallet, 1_000_000_000).unwrap();

    let item_name = "Canon R5".to_string();
    let weekly_price: u64 = 5_000_000;
    let deposit_amount: u64 = 20_000_000;
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

    // Run a full rental through to completion so is_available goes back to true.
    let rent_instruction = Instruction::new_with_bytes(
        program_id,
        &greyswan::instruction::RentItem { weeks: 1 }.data(),
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

    for (ix, signer) in [
        (
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
        ),
        (
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
        ),
        (
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
        ),
        (
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
        ),
    ] {
        let blockhash = svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&signer.pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[signer]).unwrap();
        assert!(svm.send_transaction(tx).is_ok());
    }
    svm.expire_blockhash();

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
    assert!(svm.send_transaction(tx).is_ok());
    svm.expire_blockhash();

    // Listing is available again post-completion — now remove_listing should work.
    let owner_lamports_before_remove = svm.get_account(&owner.pubkey()).unwrap().lamports;
    let listing_lamports_before_remove = svm.get_account(&listing).unwrap().lamports;

    let ix = remove_listing_ix(program_id, listing, owner.pubkey());
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[ix], Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    let result = svm.send_transaction(tx);
    if let Err(e) = &result {
        panic!("Remove listing failed: {:?}", e);
    }

    // The listing account is gone (closed: zero lamports, no reclaimable data).
    let listing_after = svm.get_account(&listing);
    let closed = match listing_after {
        None => true,
        Some(acc) => acc.lamports == 0,
    };
    assert!(closed, "listing account should be closed");

    // The owner got the reclaimed rent-exempt lamports back, net of the tx
    // fee they paid to submit the remove_listing transaction itself.
    let owner_lamports_after = svm.get_account(&owner.pubkey()).unwrap().lamports;
    let owner_delta = owner_lamports_after - owner_lamports_before_remove;
    assert!(owner_delta <= listing_lamports_before_remove);
    assert!(owner_delta >= listing_lamports_before_remove - 10_000);

    // The critical guarantee: the Rental account is completely untouched
    // and still independently readable, even though its listing is gone.
    let rental_account = svm.get_account(&rental.pubkey()).unwrap();
    let mut data: &[u8] = &rental_account.data;
    let rental_state = greyswan::state::Rental::try_deserialize(&mut data).unwrap();
    assert_eq!(rental_state.listing, listing);
    assert_eq!(rental_state.owner, owner.pubkey());
    assert_eq!(rental_state.renter, renter.pubkey());
    assert_eq!(rental_state.status, greyswan::state::RentalStatus::Completed);
    assert_eq!(rental_state.phase1_photos, "ipfs://QmPhase1");
    assert_eq!(rental_state.phase4_photos, "ipfs://QmPhase4");
}
