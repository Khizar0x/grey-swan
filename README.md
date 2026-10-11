# Grey Swan

Peer-to-peer item rentals with security deposits held directly by a Solana program.

Live program on devnet: `2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko`

---

## What Grey Swan Is

Grey Swan is a peer-to-peer item rental marketplace that removes the risk of renting high-value items to strangers.

Renting out expensive cameras, audio gear, specialist tools, and outdoor equipment carries high risk: renters worry about losing their deposit to dishonest claims, while owners worry their equipment will come back damaged or not at all. Traditional platforms charge 20% to 30% platform fees or rely on slow, opaque dispute teams.

Grey Swan replaces centralized custody with a Solana Anchor program:
- **Non-custodial deposit safety**: Security deposits and rental fees are locked in program-derived accounts (PDAs), never touching platform bank accounts.
- **Transparent conditions**: Both sides document physical item condition through a four-phase photo handover protocol before items travel and after they return.
- **Auditable dispute resolution**: When an item returns damaged, an AI evaluation pipeline inspects handover photos and proposes damage severity tiers, the program calculates the payout using on-chain rubric math, and parties have a 24-hour window to appeal to human reviewers.

---

## How a Rental Works

Every rental follows a strict, sequential lifecycle enforced by the Solana program:

```
[Listing Created]
       │
       ▼
[Rent Item] ──► Renter pays (weekly rental fee × weeks) + refundable deposit into program
       │
       ▼
[Phase 1: Owner Handover] ──► Owner takes condition photos + adds tracking number / pickup note
       │
       ▼
[Phase 2: Renter Receives] ──► Renter inspects condition upon arrival + uploads photos
       │                       (Can reject on arrival if wrong or broken before receipt)
       │
       ▼
[Phase 3: Renter Return] ───► Renter documents return condition + adds return tracking
       │
       ▼
[Phase 4: Owner Checks] ────► Owner receives item back and uploads final condition photos
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼                                        ▼                                        ▼
[Confirm Return]                        [Auto-Refund Claim]                     [Flag Return Issue]
Owner confirms condition.               Owner inactive for 7 days.              Owner reports damage.
- Deposit -> 100% to renter             - 100% refund to renter                 - Funds freeze
- Rental fee -> 90% owner, 10% fee      - Owner receives nothing                - Dispute pipeline starts
```

### Handover Protocol Details
1. **Upfront Payment**: The renter pays the total rental fee plus the security deposit upfront. Rare and Antique items enforce an on-chain deposit ceiling of at most 45% of estimated item value.
2. **Four Mandatory Handover Checkpoints**: The program enforces strict sequential progression: Phase 2 cannot execute before Phase 1, Phase 3 cannot execute before Phase 2, and Phase 4 cannot execute before Phase 3.
3. **Photo Manifests on IPFS**: Each handover step submits an IPFS Content Identifier (CID) referencing a tamper-evident JSON manifest containing photo references, shot angles, and live capture metadata.
4. **Completion or Auto-Refund**:
   - If the owner confirms receipt (`confirm_return`), the program distributes funds: the renter receives 100% of their deposit back, the platform takes a 10% fee, and the owner receives the remainder of the rental fee.
   - If the owner fails to confirm within 7 days after the rental ends, the renter can call `claim_refund` to recover their entire deposit and rental fee automatically.

---

## How Disputes Work

When an owner flags damage after inspecting the returned item (`flag_return_issue`), the rental freezes into a disputed state.

### 1. AI Proposes Severity Tiers, Program Computes Payout
- An off-chain vision pipeline compares the Phase 1 baseline photos against Phase 4 return photos.
- The AI never decides dollar or SOL amounts directly. It only identifies verified new damage and assigns standardized severity tiers (0 to 4):
  - Tier 0: Normal Wear (no deposit withheld)
  - Tier 1: Cosmetic (rubric default: 15% deposit share)
  - Tier 2: Functional Damage (rubric default: 40% deposit share)
  - Tier 3: Major (rubric default: 75% deposit share)
  - Tier 4: Destroyed or Missing (rubric default: 100% deposit share)
- The Solana program computes the exact payout (`verdict_owner_bps`):
  ```
  owner_bps = rubric_bps[worst_tier] + (extra_findings * extra_finding_bps)
  ```
  The program enforces this formula on-chain against its stored rubric configuration. The AI cannot alter the rubric or invent payout values.
- Auto-release cap: The AI can only auto-resolve up to Tier 2 (Functional Damage) on deposits below the large-deposit threshold (default 2 SOL). Any finding at Tier 3 or Tier 4, or any large deposit, immediately routes to human reviewers.

### 2. 24-Hour Appeal Window with a Bond
- Once `post_verdict` records the AI findings on-chain, a 24-hour countdown starts (`appeal_window_secs`).
- The prompt hash and output hash are permanently stored in the dispute account for full verification.
- Either party can appeal the verdict during this 24-hour window by depositing an appeal bond:
  - Bond size is proportional to what the appellant stands to lose (`bond_bps` of the contested amount, with a minimum floor).
  - If the human reviewer adjusts the split in the appellant's favor, their bond is refunded in full.
  - If the appeal fails, the bond is forfeited to the platform protection pool (`Pool` account) to support future user guarantees.

### 3. Human Reviewers and Two-Reviewer Safeguard
- If the 24-hour appeal window expires without an appeal, anyone can call `settle_verdict` to execute the program payout.
- If appealed or escalated:
  - Authorized human reviewers resolve the dispute via `reviewer_resolve`.
  - **Two-Reviewer Rule**: Any decision that awards Major damage (Tier 3+) or involves a deposit above `two_reviewer_threshold_lamports` requires two distinct authorized reviewer signatures on the Solana transaction. A single reviewer cannot unilaterally award a large payout.

---

## The Safety Layers

Autonomous evaluation must be secure against manipulation. Grey Swan implements defense-in-depth across six distinct layers:

```
[User Text / Questionnaire] ──► [Layer 1: Sanitizer & Heuristics] (Regex, Unicode, delimiter checks)
                                          │
                                          ▼
                                [Layer 2: Claim Extractor] (Extracts fixed AREA and DAMAGE_TYPE enums)
                                          │ (Free text discarded; NEVER reaches visual models)
                                          │
[Handover Photos (IPFS)] ────► [Layer 3: Blind Visual Inspection] (Two independent models inspect photos)
                                          │
                                          ▼
                                [Layer 4: Redundant Judge Runs] (Models A & B judge damage independently)
                                          │
                                          ▼
                                [Layer 5: Deterministic Code Routing] (Fail closed to HUMAN_REVIEW)
                                          │
                                          ▼
                                [Layer 6: On-Chain Program Invariants] (Rubric math, 24h appeal, two reviewers)
```

1. **Untrusted Text Kept Away From Visual Models**:
   User statements and questionnaire responses are never fed into the visual evaluation models. A dedicated claim extraction model strips out free text and maps allegations into a strict vocabulary of predefined item areas (`front`, `back`, `left`, `right`, `top`, `underside`, `label`, `accessories`) and damage types. The visual models only receive these structured tags.
2. **Structured Output Checked by Code**:
   Model responses are validated against strict Zod schemas with finite enums, bounded numeric arrays, and strict character limits. Unparseable, non-conforming, or hallucinatory outputs immediately fail validation.
3. **Controlled In-App Photo Capture with Per-Phase Codes**:
   The app provides a guided camera flow that logs capture provenance and dynamic per-phase codes into the IPFS manifest. Photos taken live during handover cannot be substituted with pre-existing camera roll pictures from months earlier.
4. **Plain-Code Routing Rules That Fail Safe**:
   All decision routing is executed in deterministic TypeScript code (`route.ts`). If any rule fails:
   - Non-visual claims (e.g., "electronic motor stopped working") cannot be verified via photos
   - Missing photo coverage (e.g., claimed area was not photographed in Phase 1 baseline)
   - Disagreement between models
   - Low confidence flags
   - Random audit selection
   The system halts automated resolution and routes the case to human reviewers. It spends nothing and signs nothing on-chain.
5. **Two Independent AI Models That Must Agree**:
   Dispute cases run through two distinct vision models across multiple evaluation runs. Both models must agree on the damaged area, the severity tier, the baseline coverage, and the confirmed identity of the physical item. Disagreement between models triggers human escalation.
6. **Hard Limits Enforced by the Program**:
   The Solana Anchor program enforces its own invariant constraints: deposit ceilings, maximum auto-release tiers, exact lamport conservation (payouts must sum exactly to held funds), and cryptographic verification of reviewer signatures.
7. **Attack Test Suite**:
   The pipeline includes automated test suites (`server/src/ai/test/attacks.test.ts`) validating resilience against 25+ prompt injection techniques, including direct instructions, delimiter escaping, base64 and hex encoding, rot13, non-English prompts (Spanish, French, German, Chinese, Russian, Arabic), zero-width characters, bidirectional overrides, full-width homoglyphs, and prompt extraction attempts. All attacks fail safe to human review without ever posting a verdict.

---

## Roadmap

### Built and Tested
- **Anchor Program on Solana Devnet**: Core rental custody program (`2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko`) with instructions for listing, renting, four-phase handovers, return confirmation, auto-refund timeouts, AI verdict posting, appeals with bonds, and reviewer settlements. 12 passing test suites.
- **Autonomous Dispute Pipeline**: Multi-stage inspection engine with claim extraction, blind visual passes, dual-model consensus, prompt/output SHA-256 hashing, and fail-safe routing.
- **Adversarial Test Suite**: 25+ injection attack tests verifying that malicious inputs cannot trigger automated payouts.
- **Web Frontend**: React + Vite + TypeScript application running on port 5174, featuring wallet sign-in, responsive light and dark themes using custom tokens, Mapbox geocoding with nearest-first local item sorting, photo upload via IPFS, and complete rental lifecycle tracking.

### Designed, Ready to Build
- **Multisig Governance**: Integration with Squads multisig for the platform Config and Admin accounts so program parameters (rubric basis points, reviewer lists, fee rates) are managed by a multi-signature committee.
- **Background Worker**: Dedicated background queue to automatically poll on-chain dispute events, trigger the AI inspection pipeline, and sign `post_verdict` transactions without manual triggers.
- **Email Reminders**: Automated notifications for upcoming return deadlines, courier tracking updates, and the 24-hour appeal window countdown.
- **Admin Emergency Cancellation**: On-chain instruction allowing mutual agreement cancellation if both parties abandon a rental prior to handover.

### Next
- **Courier Tracking Webhook Integration**: Direct integration with carrier APIs (FedEx, UPS, Royal Mail, DHL) to automatically verify tracking status and advance handover phases upon delivery confirmation.
- **Real-Photo Benchmark Suite**: Expanded dataset of physical hardware damage under varied real-world lighting, reflections, and resolutions to continuously benchmark and calibrate model severity tiers.

---

## Running Locally

### Prerequisites
- Node.js 22 or higher (uses built-in `node:sqlite`)
- A Solana browser wallet (Phantom or Solflare) configured for Solana Devnet
- A [Pinata](https://pinata.cloud) account and API JWT (Files: Write scope) for real IPFS photo pinning (optional in mock mode)

### 1. Start the Backend Service
The backend service handles wallet session authentication, SQLite profile storage, and server-side IPFS pinning:

```bash
cd server
npm install
cp .env.example .env   # Add PINATA_JWT if you have one
npm run dev            # Runs on http://localhost:8787
```

Note: If `SESSION_SECRET` is left blank in `.env`, a development secret is automatically generated in `server/data/session-secret.txt`.

### 2. Start the Frontend Application
The frontend connects to Solana Devnet and proxies API calls to the local backend:

```bash
cd app
npm install
npm run dev -- --port 5174   # Runs on http://localhost:5174
```

Open `http://localhost:5174` in your browser and connect your Solana wallet on devnet.

### 3. Running Anchor Tests (Optional)
If you have the Rust and Anchor toolchain installed locally and want to run the program tests:

```bash
anchor build
cargo test
```
The program is already built and deployed to Solana Devnet. You do not need to deploy it to test the full application.
