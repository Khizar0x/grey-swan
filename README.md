# Grey Swan

A peer-to-peer equipment rental marketplace on Solana. Renters pay a weekly
rental price plus a refundable security deposit; both sides upload photos at
four handover checkpoints, and a dispute path exists for when something goes
wrong. Built as a Solana Developer Specialization capstone project.

**Live program:** `2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko` on devnet

## How it's put together

Three pieces, each existing for a specific reason:

```
programs/greyswan/   Anchor program — the actual rental logic and fund custody
app/                  React + Vite frontend
server/               Small Express service
```

The frontend never talks to any third-party API with a secret key directly —
that's what `server/` is for. It proxies two things that would otherwise
expose credentials in the browser bundle:

- **IPFS photo pinning** via Pinata (the pinning JWT stays server-side)
- **Wallet-based profiles** (name/email, keyed by public key) — gated behind
  wallet-signature sign-in, so one wallet's session can't read or overwrite
  another wallet's profile

Everything else — listing, renting, the four-phase handover, confirming a
return, flagging a dispute — is a direct Anchor instruction call from the
frontend, signed by the connected wallet. No backend sits in that path.

## Prerequisites

- Node.js 22+ (uses `node:sqlite`, built in — no native DB dependency)
- A Solana wallet browser extension: Phantom or Solflare (Backpack and Glow
  also work, via the Wallet Standard, if installed)
- A [Pinata](https://pinata.cloud) account and JWT (Files: Write permission),
  if you want photo upload to actually work

## Running it locally

**1. Backend**

```bash
cd server
npm install
cp .env.example .env   # fill in PINATA_JWT
npm run dev            # http://localhost:8787
```

`SESSION_SECRET` is optional in dev — if you leave it blank, one is
generated and persisted to `server/data/session-secret.txt` on first run.

**2. Frontend**

```bash
cd app
npm install
npm run dev             # http://localhost:5173, proxies /api to :8787
```

Both need to be running for the app to work — the frontend calls `/api/pin`
and `/api/profile` on the backend for the pieces described above.

**3. The Anchor program** (already deployed to devnet — only needed if you're
changing program logic)

```bash
anchor build
cargo test              # 8 tests, programs/greyswan/tests/
anchor deploy --provider.cluster devnet
```

`init_config` has already been called once on devnet and locks in the admin
wallet — don't call it again against the existing deployment.

## Project structure

```
programs/greyswan/src/
  lib.rs                 entrypoint, instruction dispatch
  instructions/           one file per instruction (list_item, rent_item,
                           handover, confirm_return, dispute, ...)
  state.rs, error.rs      account structs, enums, custom errors

app/src/
  lib/mutations.ts        every on-chain instruction call the frontend makes
  lib/program.ts          Anchor Program client (works signed-in or read-only)
  lib/ipfs.ts             photo upload -> manifest CID
  lib/AuthContext.tsx     wallet-signature sign-in, shared across the app
  pages/                  one file per screen (Home, ListItem, ListingDetail,
                           MyRentals, MyListings, RentalHandover)

server/src/
  index.ts                route wiring
  auth.ts                 nonce issuance + ed25519 signature verification
  profiles.ts             SQLite-backed profile storage
```

## What's not built yet

- **Real courier tracking verification** — tracking numbers are plain text
  fields, not checked against any carrier API (by design, out of scope)
- **AI dispute review** — the owner-side dispute path flags a rental and
  freezes funds for admin review; an automated photo-comparison service to
  assist that review doesn't exist yet
- **Reviews/ratings** — not part of the on-chain program
