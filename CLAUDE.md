# Grey Swan — Project Context for Claude Code

## What this is
Grey Swan is a peer-to-peer equipment rental marketplace on Solana. Renters pay a weekly rental price plus a security deposit, held by the program. Both parties upload photos at four handover checkpoints. If everything checks out, the deposit returns to the renter and the rental fee (minus a platform cut) pays out to the owner. If something's wrong, a dispute path freezes the funds pending resolution.

This is a capstone project for a Solana Developer Specialization course (Edversity), due **20 September**, and it doubles as a portfolio piece for job hunting afterward.

## Current state — READ THIS FIRST
- **The Anchor program is finished, tested (8 passing tests), and deployed to devnet.**
- Program ID: `2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko`
- IDL is published at `target/idl/greyswan.json`
- Admin wallet is locked in via a Config PDA (see below) — do not try to redeploy or reinitialize config
- **The frontend does not exist yet as working code.** There is a complete visual mockup in Figma Make (React/TypeScript, file key `juS0JVQK1AB4Z1KgIGz5vh`) with mock local state only — no wallet, no blockchain calls, no backend. That mockup's screens, copy, and visual system are the design source of truth; this session's job is to make it real.

## Mentor's rule — follow this
The user's mentor explicitly said: write code with AI, but understand the logic. Don't just generate and move on — explain what you're about to build before building it, especially for anything wallet- or transaction-related. The user wants to genuinely understand this project, not just submit something that works.

## Tech stack
- Anchor/Rust program, already built (do not modify unless explicitly asked)
- React/TypeScript frontend (to be built from the Figma Make mockup)
- Solana wallet adapter — Phantom, Backpack, Solflare, Glow. **MetaMask is explicitly excluded** (wrong chain, this was deliberately decided)
- IPFS for photo storage (user has prior experience with this from SPL token/Token-2022 metadata work)

## Brand voice and copy rules — apply to all UI text
- Tone: "prestige but welcoming" — professional, warm, not corporate-cold, not casual
- **Never use these words in UI copy**: escrow, gear, equipment, decentralized, P2P, smart contract, protocol, program ID, on-chain, transaction, counterparty, asset
- Use "item" as the generic noun, or the specific thing (camera, drone, guitar)
- "Renter" / "Owner", not "counterparty"
- "Rental details," not "transaction details"
- Deposit language: "£X deposit safely held" (never "escrow")
- Dispute copy avoids clinical language: "Something's not right" (not "Initiate dispute")
- Wallet connection UI stays visible and explicit ("Connect Wallet") — do not hide or abstract the wallet concept

## Visual system — final, do not redesign
- Background: `#FAF7F2`
- Text: `#262220`
- Accent (primary buttons, key numbers): `#C9A24B` (gold)
- No gradients
- Font: Helvetica primary, Inter fallback (not Arial)
- Status badges: three-color system — green-tinted (positive/complete), amber-tinted (pending), rust-tinted (attention/dispute)

## The program's instructions (what the frontend needs to call)

**`init_config(admin: Pubkey)`** — already called once on devnet. Do not call again.

**`list_item(item_name, description, photos, rental_price, deposit_amount, estimated_value, category, rarity_tier)`**
- Creates a PDA at seeds `["listing", owner_pubkey, item_name]`
- `photos` is a single string: one IPFS CID pointing to a JSON manifest (not a list of URLs)
- `category`: enum `PhotographyVideo | MusicAudio | ToolsEquipment | SportsOutdoor | Other`
- `rarity_tier`: enum `Common | Rare | Antique` — independent from category, not nested
- Deposit cap: for Rare/Antique only, `deposit_amount` cannot exceed 45% of `estimated_value`
- Duplicate item names per owner are rejected by the PDA seeds — show a plain message like "You already have an item listed under this name"

**`rent_item(weeks: u16)`**
- `weeks` must be 1–12
- Price is `rental_price × weeks`, paid upfront along with the deposit
- Renter cannot rent an unavailable listing

**`submit_phase1(photos, tracking_number)`** — owner, before sending. Requires tracking number (max 40 chars).
**`submit_phase2(photos)`** — renter, on arrival.
**`submit_phase3(photos, tracking_number)`** — renter, before returning. Requires tracking number.
**`submit_phase4(photos)`** — owner, on return.

All four `photos` params are a single IPFS CID pointing to a JSON manifest, same pattern as listing photos. **Phases are strictly ordered on-chain** — phase 2 cannot be submitted before phase 1 completes, etc. The UI should reflect this (locked/unlocked steps) but the program enforces it regardless.

**`confirm_return()`** — owner only, only callable once all four phases are done. Splits funds: 10% platform fee, remainder to owner, deposit back to renter.

**`claim_refund()`** — renter only, only callable 7 days after the rental started if the owner never confirmed. Full refund (rental cost + deposit), owner gets nothing.

**`flag_return_issue(reason: String)`** — owner only, only callable after phase 4. Freezes the rental as disputed. Max 300 chars.

**`reject_on_arrival(photos, reason)`** — renter only, callable at the phase 2 point instead of `submit_phase2`. Used when the item is wrong or already broken on arrival. Skips straight to admin review (no AI comparison, since there's no "before" state to compare against for this failure type).

**`resolve_dispute(owner_amount: u64, renter_amount: u64)`** — admin wallet only (verified against the Config PDA). The two amounts must sum exactly to the total held funds or the transaction fails.

## Dispute design — two asymmetric paths
1. **Owner-side, post-rental**: owner flags "something's not right" after getting the item back → funds freeze → an off-chain AI service (not yet built) will compare phase 1–4 photos and recommend a split → admin reviews and submits `resolve_dispute`. This AI service is planned but not yet built — treat it as a separate later piece of work, stub it if the frontend needs a placeholder.
2. **Renter-side, on arrival**: renter rejects the item as wrong/broken on arrival → straight to admin, no AI involved, since there's no prior photo to compare against.

## What's explicitly NOT in scope for this MVP (don't build unless asked)
- Real courier tracking API verification (tracking numbers are plain text fields)
- Negotiation/counter-offer on rental price
- Owner approval step before a rental proceeds (first-come-first-served)
- Reviews (mentioned in early planning, not yet built into the program — check with the user before adding)

## Known limitations, already accepted
- `init_config` could theoretically be called by anyone before the real admin does — this window is now closed since it's already been called on devnet, but if the program is ever redeployed fresh, call `init_config` immediately.
- No platform fee is taken on disputed rentals (the admin's split is the final word).

## Off-chain pieces the frontend needs, not yet built
- **Photo upload**: IPFS upload flow (user has done this before for token metadata) — need a pinning service, not raw IPFS, so uploads persist.
- **Wallet-based profiles**: on first connect, pop up asking for name and email. Public key is the identity; name/email go in an off-chain database (not on-chain). Explain why the email is needed (rental notifications, confirmation deadlines, deposit release warnings) rather than asking blankly. Email required for owners, optional for renters.
- **Wallet signature sign-in**: after connecting, have the wallet sign a message with a timestamp, verify server-side, to prove the person actually holds the private key before showing sensitive info. Not urgent, can come after the core flow works.
- **AI dispute service**: separate piece, fetches phase manifests from IPFS, calls a vision model, produces a recommended split. Build this against stubbed/hand-pinned sample photos if the real upload flow isn't ready yet — it doesn't need to be last in line.

## Constants to know
- Platform fee: 10%, hardcoded, goes to a fixed platform wallet
- Auto-refund timeout: 7 days
- Rental duration: 1–12 weeks
- Deposit cap: 45% of estimated value, Rare/Antique only