# Grey Swan: 3-Minute Hackathon Pitch Script

Target delivery time: 3 minutes (~450 spoken words).
Tone: Plain, confident, honest. No hype, no buzzwords.

---

## [0:00 - 0:35] The Problem

Most high-value items sit idle 95% of the year. High-end cameras, audio setups, and specialist tools are bought for specific projects and then left on shelves.

People want to rent them, but peer-to-peer item rental is blocked by a lack of trust between strangers.

Owners are terrified their items will come back broken or vanish entirely. Renters are terrified of losing substantial deposits to unfair or subjective damage claims. Traditional platforms charge 25% to 30% take rates, hold user funds in private corporate bank accounts, and run opaque dispute processes that take weeks and leave both sides frustrated.

The barrier to peer-to-peer rentals is not matching buyers with sellers. It is managing deposit custody and dispute resolution fairly.

---

## [0:35 - 1:10] The Solution

Grey Swan is a peer-to-peer item rental marketplace where deposits are held directly by an Anchor program on Solana.

Here is how a rental works:
1. The renter pays the rental fee plus a refundable security deposit upfront into the program. Funds are locked in program-derived accounts, completely out of platform hands.
2. Both parties complete a four-phase handover protocol: owner before sending, renter on receipt, renter before returning, and owner on return. Each phase records item condition photos and tracking details into IPFS manifests.
3. If everything returns safely, the owner confirms the return: the deposit goes 100% back to the renter, and the rental fee pays out to the owner minus a 10% platform fee.

If an owner reports that an item came back damaged, our dispute engine takes over.

---

## [1:10 - 1:55] Live Demo Walkthrough

Let us look at the app running on Solana devnet:

*(Walk through the UI)*
- **Browse & Rent**: Notice the clear separation between the weekly rental fee and the refundable deposit. When renting, the deposit cap prevents excessive requirements on rare items.
- **Handover Flow**: At each stage, the app guides users through mandatory photo angles and embeds per-phase verification codes to ensure photos are captured live.
- **Dispute Resolution**: When damage is flagged, our off-chain AI pipeline inspects the handover photos. The AI compares baseline Phase 1 photos against Phase 4 return photos and assigns damage to standardized severity tiers (Tier 0 to Tier 4).
- **On-Chain Settlement**: The AI does not pick an arbitrary cash number. The Solana program takes the severity tiers and computes the exact payout itself using an on-chain rubric.
- **The Appeal Window**: Once the verdict is recorded, a 24-hour appeal window opens. Either party can appeal by posting a bond. If unappealed, anyone can trigger the final settlement. If appealed or severe, human reviewers step in.

---

## [1:55 - 2:30] Why Solana

Solana is not just an add-on here; it is the core execution engine that makes this marketplace trustworthy:

1. **Public Accountability**: Every verdict, rubric parameter, prompt hash, and output hash is committed on-chain. Nobody can alter historical dispute records.
2. **Deterministic Deadlines**: Auto-refund deadlines and the 24-hour appeal countdown are enforced directly by the Solana runtime clock, not by support ticket queues.
3. **Tamper-Proof Payouts**: Payout calculations are hardcoded in program math. Even our own platform admins cannot divert funds or change splits arbitrarily.
4. **Viable Micro-Rentals**: On other networks, gas fees of $5 to $15 make renting a $25 tool or a $50 lens completely impractical. Solana's sub-cent transaction fees make renting small, everyday items economically viable.

---

## [2:30 - 3:00] AI Safety and Roadmap

Our AI pipeline is not a thin wrapper around a chatbot. It is a 6-layer defense-in-depth safety engine:
- **Text Isolation**: Free-text statements from users are completely isolated. A claim extractor converts allegations into strict, closed enums. Unfiltered user text never reaches the visual models.
- **Dual-Model Consensus**: Two independent vision models must achieve 100% agreement on the damaged area, severity tier, and baseline photo coverage.
- **Fail-Closed Code**: Missing photo coverage, non-visual claims, or prompt injection heuristics immediately halt automation and route to human reviewers. We tested 25+ adversarial injection attacks; all fail safe.
- **Human Safeguards**: The AI can only auto-resolve up to Tier 2 (Functional Damage) on modest deposits. Big decisions (Tier 3 Major damage or large deposits) strictly require two independent human reviewer signatures on-chain.

### Roadmap
- **Built and Tested**: Solana devnet Anchor program with 12 tests, 4-phase handover flow, 2-model dispute pipeline, and full web interface.
- **Designed & Ready**: Multisig governance via Squads, automated queue workers for disputes, and email deadline reminders.
- **Next**: Carrier tracking webhooks and real-world damage calibration datasets.

Grey Swan turns trust into code, making peer-to-peer rentals safe, fast, and transparent. Thank you.
