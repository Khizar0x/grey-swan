# Grey Swan: 3-Minute Hackathon Pitch Script

Target delivery time: 3 minutes (~450 spoken words).
Tone: Plain, confident, honest. No hype, no buzzwords.

---

## [0:00 - 0:35] The Problem

High-end cameras, audio setups, and specialist tools are often bought for one project and then left on shelves.

People want to rent them, but peer-to-peer item rental is blocked by a lack of trust between strangers.

Owners are terrified their items will come back broken or vanish entirely. Renters are terrified of losing substantial deposits to unfair or subjective damage claims. Typical platforms hold user funds in their own accounts and run dispute processes that neither side can inspect.

The barrier to peer-to-peer rentals is not matching buyers with sellers. It is managing deposit custody and dispute resolution fairly.

---

## [0:35 - 1:10] The Solution

Grey Swan is a peer-to-peer item rental marketplace where deposits are held directly by an Anchor program on Solana.

Here is how a rental works:
1. The renter pays the rental fee plus a refundable security deposit upfront into the program. Funds are held in an account owned by the program, and the program enforces where they can go.
2. Both parties complete a four-phase handover protocol: owner before sending, renter on receipt, renter before returning, and owner on return. Each phase records item condition photos and tracking details into IPFS manifests.
3. If everything returns safely, the owner confirms the return: the deposit goes 100% back to the renter, and the rental fee pays out to the owner minus the platform fee, which is 10% and fixed in the program.

If an owner reports that an item came back damaged, our dispute engine takes over.

---

## [1:10 - 1:55] Live Demo Walkthrough

Let us look at the app running on Solana devnet:

*(Walk through the UI)*
- **Browse & Rent**: Notice the clear separation between the weekly rental fee and the refundable deposit. When renting, the deposit cap prevents excessive requirements on rare items.
- **Handover Flow**: At each stage, the app guides users through mandatory photo angles and embeds per-phase verification codes to ensure photos are captured live.
- **Dispute Resolution**: When damage is flagged, our off-chain AI pipeline inspects the handover photos. The AI compares baseline Phase 1 photos against Phase 4 return photos and assigns damage to standardized severity tiers (Tier 0 to Tier 4).
- **On-Chain Settlement**: The AI does not pick an arbitrary cash number. The Solana program takes the severity tiers and computes the exact payout itself using an on-chain rubric.
- **The Appeal Window**: Once the verdict is recorded, an appeal window opens (24 hours by default). Either party can appeal by posting a bond. If unappealed, anyone can trigger the final settlement. If appealed or severe, human reviewers step in.

---

## [1:55 - 2:30] Why Solana

Solana is not just an add-on here; it is the core execution engine that makes this marketplace trustworthy:

1. **Public Accountability**: The severity tiers, the rubric, and the hashes of the prompt and the model output are recorded on-chain, so a verdict can be checked afterwards.
2. **Deterministic Deadlines**: Arrival, return, inspection and appeal deadlines are enforced by the program against the Solana clock, not by support ticket queues.
3. **Rules the Program Enforces**: Money can only ever go to the rental's owner, its renter, the platform wallet or the user-protection pool. Reviewers decide splits within program limits, payouts must add up exactly to what is held, and big decisions need two reviewers. Admin powers are moving to a multisig, which is on the roadmap.
4. **Viable Micro-Rentals**: Network fees on Solana are low enough that renting a small, everyday item is not wiped out by the cost of the transaction.

---

## [2:30 - 3:00] AI Safety and Roadmap

Our AI pipeline is not a thin wrapper around a chatbot. It is a 6-layer defense-in-depth safety engine:
- **Text Isolation**: Free-text statements from users are completely isolated. A claim extractor converts allegations into strict, closed enums. Unfiltered user text never reaches the visual models.
- **Dual-Model Consensus**: Two independent vision models must agree on the damaged area, severity tier, and baseline photo coverage.
- **Fail-Closed Code**: Missing photo coverage, non-visual claims, or prompt injection heuristics immediately halt automation and route to human reviewers. We test 25 adversarial injection cases; they fail safe.
- **Human Safeguards**: A verdict can only be posted automatically up to Tier 2 (Functional Damage) on modest deposits. Anything larger goes to a human reviewer, and a Major-sized share or a very large deposit needs two independent reviewers to sign.

### Roadmap
- **Built and Tested**: Solana devnet Anchor program with 15 Rust test files, 4-phase handover flow, 2-model dispute pipeline, and full web interface.
- **Designed & Ready**: Admin powers moved to a Squads multisig, automated queue workers for disputes, and email deadline reminders.
- **Next**: Carrier tracking webhooks and real-world damage calibration datasets.

Grey Swan turns trust into code, making peer-to-peer rentals safe, fast, and transparent. Thank you.
