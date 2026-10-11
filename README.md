# Grey Swan

Peer-to-peer item rentals with security deposits held directly by a Solana program.

Live program on devnet: `2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko`

---

## What Grey Swan Is

Grey Swan is a peer-to-peer item rental marketplace that reduces the risk of renting high-value items to strangers.

Renting out expensive cameras, audio gear, specialist tools, and outdoor equipment carries high risk: renters worry about losing their deposit to dishonest claims, while owners worry their equipment will come back damaged or not at all. On most platforms the money sits in the platform's own accounts and disputes are settled out of sight.

Grey Swan replaces centralized custody with a Solana Anchor program:
- **Deposits held by the program**: The rental fee and security deposit are held in the rental's own account, owned by the Grey Swan program, not in a platform bank account. The program decides where the money can go.
- **Transparent conditions**: Both sides document physical item condition through a four-phase photo handover protocol before items travel and after they return.
- **Auditable dispute resolution**: When an item returns damaged, an AI evaluation pipeline inspects handover photos and proposes damage severity tiers, the program calculates the payout using on-chain rubric math, and either party can appeal to a human reviewer within an appeal window (24 hours by default, set in Config).

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
[Confirm Return]                        [Complete After Deadline]               [Flag Return Issue]
Owner confirms condition.               Owner stays silent past the             Owner reports damage.
- Deposit -> 100% to renter             inspection deadline; the renter         - Funds freeze
- Rental fee -> 90% owner, 10% fee      completes the rental.                   - Dispute pipeline starts
                                        - Same payout as Confirm Return
```

If the owner never ships at all, the renter can call `claim_refund` once 7 days have passed since the rental started, and gets the rental fee and deposit back in full.

### Handover Protocol Details
1. **Upfront Payment**: The renter pays the total rental fee plus the security deposit upfront. Rare and Antique items enforce an on-chain deposit ceiling of at most 45% of estimated item value.
2. **Four Mandatory Handover Checkpoints**: The program enforces strict sequential progression: Phase 2 cannot execute before Phase 1, Phase 3 cannot execute before Phase 2, and Phase 4 cannot execute before Phase 3.
3. **Photo Manifests on IPFS**: Each handover step submits an IPFS Content Identifier (CID) pointing to a JSON manifest. Every photo in it records which shot it is (front, back, label and so on), whether it was captured by the in-app camera or uploaded, and the per-phase code for that step.
4. **Deadlines**: Each side has a window to act, recorded in a timeline account. Defaults, adjustable by the admin within fixed limits: the renter has 5 days to confirm arrival, the owner waits 3 days past the return date before reporting an item as not returned, and the owner has 7 days to inspect a returned item. If a window passes, the other party gets a matching action (`confirm_arrival_after_deadline`, `flag_not_returned`, `flag_return_not_received`, `complete_after_inspection_deadline`).
5. **Completion**:
   - If the owner confirms the return (`confirm_return`), the program distributes funds: the renter receives 100% of their deposit back, the platform takes a 10% fee on the rental fee, and the owner receives the rest of the rental fee.
   - If the owner never ships, the renter can call `claim_refund` after 7 days (see above).

---

## How Disputes Work

When an owner flags damage after inspecting the returned item (`flag_return_issue`), the rental freezes into a disputed state.

### 1. AI Proposes Severity Tiers, Program Computes Payout
- An off-chain vision pipeline compares the Phase 1 baseline photos against Phase 4 return photos.
- The AI never decides dollar or SOL amounts directly. It only identifies verified new damage and assigns standardized severity tiers (0 to 4):
  - Tier 0: Normal Wear (no deposit withheld)
  - Tier 1: Cosmetic (rubric default: 15% deposit share)
  - Tier 2: Functional Damage (rubric default: 50% deposit share)
  - Tier 3: Major (rubric default: 80% deposit share)
  - Tier 4: Destroyed or Missing (rubric default: 100% deposit share)
- The Solana program computes the exact payout (`verdict_owner_bps`):
  ```
  owner_bps = rubric_bps[worst_tier] + (extra_findings * extra_finding_bps)   (capped at 100%)
  ```
  The program enforces this formula on-chain against its stored rubric configuration. The AI cannot alter the rubric or invent payout values.
- Auto-release cap: A verdict can only be posted for findings up to Tier 2 (Functional Damage) on deposits at or below the large-deposit threshold (default 5 SOL), and only if the resulting share stays below the Major value. Anything above that goes to human reviewers.

### 2. Appeal Window with a Bond
- Once `post_verdict` records the AI findings on-chain, an appeal countdown starts (`appeal_window_secs`, 24 hours by default).
- The prompt hash and output hash are permanently stored in the dispute account for full verification.
- Either party can appeal the verdict during this window by depositing an appeal bond:
  - Bond size is proportional to what the appellant stands to lose (`bond_bps` of the contested amount, with a minimum floor). The default values are placeholders still being tuned.
  - An appeal that cannot improve the appellant's outcome is refused.
  - If the human reviewer adjusts the split in the appellant's favor, their bond is refunded in full.
  - If the appeal fails, the bond is forfeited to the platform protection pool (`Pool` account) to support future user guarantees.

### 3. Human Reviewers and Two-Reviewer Safeguard
- If the appeal window closes without an appeal, anyone can call `finalize_verdict` to execute the program payout.
- If an appeal is made but no reviewer decides within the appeal expiry (7 days by default), anyone can call `expire_appeal`: the verdict stands and the bonds are returned.
- If appealed or escalated:
  - Authorized human reviewers resolve the dispute via `reviewer_resolve`.
  - **Two-Reviewer Rule**: Any decision that gives the owner at least the Major rubric share, or involves a deposit above `two_reviewer_threshold_lamports` (default 10 SOL), requires two distinct authorized reviewers to sign the same Solana transaction.
- The admin can set an unappealed AI verdict aside (`void_verdict`); a reviewer then decides.

### Where the money can go
The program enforces that funds can only ever move to the rental's owner, the rental's renter, the platform wallet or the user-protection pool. Reviewers decide splits, but only within program limits: amounts must add up exactly to what is held, and big decisions need two reviewers. Payouts from the user-protection pool (forfeited bonds) are chosen by the admin, and the pool balance is the limit. Admin powers (Config changes and pool payouts) are planned to move to a multisig, see the roadmap.

---

## The Safety Layers

Autonomous evaluation must be secure against manipulation. Grey Swan implements defense-in-depth across six layers, plus a test suite:

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
                                [Layer 6: On-Chain Program Invariants] (Rubric math, appeal window, two reviewers)
```

1. **Untrusted Text Kept Away From Visual Models**:
   User statements and questionnaire responses are never fed into the visual evaluation models. A dedicated claim extraction model strips out free text and maps allegations into a strict vocabulary of predefined item areas (`front`, `back`, `left`, `right`, `top`, `underside`, `label`, `accessories`) and damage types. The visual models only receive these structured tags.
2. **Structured Output Checked by Code**:
   Model responses are validated against strict Zod schemas with finite enums, bounded numeric arrays, and strict character limits. Unparseable, non-conforming, or hallucinatory outputs immediately fail validation.
3. **Controlled In-App Photo Capture with Per-Phase Codes**:
   Handover photos come from a guided in-app camera with a fixed shot list. The server issues a short code for each step, readable only by the two parties, which the person writes on paper and includes in the front shot. Each manifest records the shot, the code and whether a photo was captured or uploaded (upload is offered only when no camera is available). This makes reusing old photos harder and visible. It is not cryptographic proof of when a photo was taken.
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
   The Solana Anchor program enforces its own constraints: deposit ceilings, maximum auto-release tiers, exact lamport conservation (payouts must sum exactly to held funds), and checks that the verdict signer and reviewers are the keys named in Config.
**Attack Test Suite**:
The pipeline includes automated tests (`server/src/ai/test/attacks.test.ts`) covering 25 prompt injection cases, including direct instructions, delimiter escaping, base64 and hex encoding, rot13, non-English prompts (Spanish, French, German, Chinese, Russian, Arabic), zero-width characters, bidirectional overrides, full-width homoglyphs, and prompt extraction attempts. In those tests the attacks either fail safe to human review or are flagged, and no verdict is posted from them.

---

## Roadmap

### Built and Tested
- **Anchor Program on Solana Devnet**: Core rental custody program (`2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko`) with instructions for listing, renting, four-phase handovers, return confirmation, deadline timeouts, auto-refund, AI verdict posting, appeals with bonds, and reviewer settlements. 15 Rust test files under `programs/greyswan/tests`.
- **Autonomous Dispute Pipeline**: Multi-stage inspection engine with claim extraction, blind visual passes, dual-model consensus, prompt/output SHA-256 hashing, and fail-safe routing.
- **Adversarial Test Suite**: 25 injection cases verifying that malicious inputs do not produce an automated payout.
- **Web Frontend**: React + Vite + TypeScript application (dev server on port 5173 by default), featuring wallet sign-in, responsive light and dark themes using custom tokens, Mapbox geocoding with nearest-first local item sorting, photo upload via IPFS, and complete rental lifecycle tracking.

### Designed, Ready to Build
- **Multisig Governance**: Moving the admin powers (Config changes such as rubric basis points and reviewer lists, setting a verdict aside, and user-protection pool payouts) to a Squads multisig, so no single key holds them.
- **Background Worker**: Dedicated background queue to automatically poll on-chain dispute events, trigger the AI inspection pipeline, and sign `post_verdict` transactions without manual triggers.
- **Email Reminders**: Automated notifications for upcoming return deadlines, courier tracking updates, and the appeal window countdown.
- **Admin Emergency Cancellation**: On-chain instruction allowing mutual agreement cancellation if both parties abandon a rental prior to handover.

### Next
- **Courier Tracking Webhook Integration**: Direct integration with carrier APIs (FedEx, UPS, Royal Mail, DHL) to automatically verify tracking status and advance handover phases upon delivery confirmation.
- **Real-Photo Benchmark Suite**: Expanded dataset of physical hardware damage under varied real-world lighting, reflections, and resolutions to continuously benchmark and calibrate model severity tiers.

---

## Running Locally

### Prerequisites
- Node.js 22 or higher (uses built-in `node:sqlite`)
- A Solana browser wallet (Phantom or Solflare) configured for Solana Devnet
- A [Pinata](https://pinata.cloud) account and API JWT (Files: Write scope). Required: the backend exits at startup without `PINATA_JWT`.

### 1. Start the Backend Service
The backend service handles wallet session authentication, SQLite profile storage, and server-side IPFS pinning:

```bash
cd server
npm install
cp .env.example .env   # Set PINATA_JWT (required)
npm run dev            # Runs on http://localhost:8787
```

Note: If `SESSION_SECRET` is left blank in `.env`, a development secret is automatically generated in `server/data/session-secret.txt`.

### 2. Start the Frontend Application
The frontend connects to Solana Devnet and proxies API calls to the local backend:

```bash
cd app
npm install
npm run dev   # Runs on http://localhost:5173
```

Open `http://localhost:5173` in your browser and connect your Solana wallet on devnet.

### 3. Running Anchor Tests (Optional)
If you have the Rust and Anchor toolchain installed locally and want to run the program tests:

```bash
anchor build
cargo test
```
The program is already built and deployed to Solana Devnet. You do not need to deploy it to test the full application.
