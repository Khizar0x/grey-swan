import { PublicKey } from '@solana/web3.js'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { type AddressRole, getAddress, getLatestRenterAddress, upsertAddress } from './addresses.js'
import { issueNonceMessage, issueSessionToken, requireAuth, verifySignInSignature } from './auth.js'
import { getAdminPubkey } from './config.js'
import { getDefaultAddress, upsertDefaultAddress } from './defaultAddress.js'
import { type DeliveryMethod, getDeliveryMethod, upsertDeliveryMethod } from './delivery.js'
import { type DisputeReviewStatus, listDisputeNotes, upsertDisputeNote } from './disputes.js'
import { getAllListingAreas, getListingArea, upsertListingArea } from './listingAreas.js'
import { countUnread, getLastMessage, insertMessage, listMessages, markReadExceptSender, MESSAGE_MAX_LEN } from './messages.js'
import { getAnswers, insertAnswers, validateOwnerAnswers, validateRenterAnswers } from './disputeAnswers.js'
import { getPhaseCode, issuePhaseCode } from './phaseCodes.js'
import { getProfile, upsertProfile } from './profiles.js'
import { requireRentalParty, requireRentalPartyOrReviewer } from './rentalAuth.js'
import { fetchRentalSummary, RENTAL_STATUS_DISPUTED } from './rentalChain.js'

// This server exists for one reason: the Pinata JWT must never reach the
// browser. If it were embedded in the frontend bundle, anyone could open
// devtools, lift it out of the JS or a network request, and pin unlimited
// files to this account — running up storage/bandwidth on someone else's
// quota. So the browser uploads to *this* server, and only this server ever
// sends the JWT to Pinata.

const PINATA_JWT = process.env.PINATA_JWT
if (!PINATA_JWT) {
  console.error('Missing PINATA_JWT in server/.env — see server/.env.example')
  process.exit(1)
}

const PORT = Number(process.env.PORT ?? 8787)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'
const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15MB — generous for a few handover/listing photos

const app = express()
app.use(cors({ origin: FRONTEND_ORIGIN }))
app.use(express.json())

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } })

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    new PublicKey(value)
    return true
  } catch {
    return false
  }
}

// Wallet signature sign-in: connecting a wallet only proves you picked a
// public key, not that you hold its private key. These two endpoints prove
// that — see auth.ts for the nonce/signature-verification mechanics — and
// every profile route below requires the resulting session token, since
// name/email are the first real PII this app stores off-chain.

app.get('/api/auth/message/:pubkey', (req, res) => {
  if (!isValidPubkey(req.params.pubkey)) {
    res.status(400).json({ error: 'Invalid public key.' })
    return
  }
  res.json({ message: issueNonceMessage(req.params.pubkey) })
})

app.post('/api/auth/verify', (req, res) => {
  const { pubkey, signature } = req.body ?? {}
  if (!isValidPubkey(pubkey) || typeof signature !== 'string') {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  if (!verifySignInSignature(pubkey, signature)) {
    res.status(401).json({ error: 'Signature verification failed. Try signing in again.' })
    return
  }
  res.json({ token: issueSessionToken(pubkey) })
})

// Profiles: the public key is the identity (see CLAUDE.md); name/email are
// off-chain-only, keyed by pubkey. requireAuth proves the caller holds the
// key it's claiming; the pubkey === authPubkey checks below then make sure
// a valid session for one wallet can't read or overwrite another wallet's
// profile.

app.get('/api/profile/:pubkey', requireAuth, (req, res) => {
  if (req.authPubkey !== req.params.pubkey) {
    res.status(403).json({ error: 'You can only view your own profile.' })
    return
  }
  const profile = getProfile(req.params.pubkey)
  if (!profile) {
    res.status(404).json({ error: 'Not found.' })
    return
  }
  res.json({ profile })
})

app.post('/api/profile', requireAuth, (req, res) => {
  const { pubkey, name, email } = req.body ?? {}

  if (!isValidPubkey(pubkey)) {
    res.status(400).json({ error: 'Invalid public key.' })
    return
  }
  if (req.authPubkey !== pubkey) {
    res.status(403).json({ error: 'You can only edit your own profile.' })
    return
  }
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80) {
    res.status(400).json({ error: 'Name is required (80 characters max).' })
    return
  }

  let cleanEmail: string | null = null
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' })
      return
    }
    cleanEmail = email
  }

  const profile = upsertProfile(pubkey, name.trim(), cleanEmail)
  res.json({ profile })
})

// Shipping addresses: real PII, off-chain only (see addresses.ts). A
// rental has exactly two addresses — the renter's delivery address (owner
// needs it to ship the item out) and the owner's return address (renter
// needs it to ship the item back) — each writable only by the person it
// belongs to, and readable only by the two parties of that specific
// rental, never anyone else who happens to guess a rental pubkey.

const ADDRESS_ROLES: AddressRole[] = ['renter_delivery', 'owner_return']

function isValidRole(value: unknown): value is AddressRole {
  return typeof value === 'string' && (ADDRESS_ROLES as string[]).includes(value)
}

// Registered before the ":rentalPubkey/:role" route below — both are
// "/api/address/<segment>/<segment>" in shape, and Express matches top to
// bottom, so this specific route must come first or "/api/address/latest/X"
// would be swallowed by the generic one (rentalPubkey="latest", role="X").
app.get('/api/address/latest/:renterPubkey', requireAuth, (req, res) => {
  const { renterPubkey } = req.params
  if (!isValidPubkey(renterPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  // A renter's own saved addresses are theirs alone to read back — unlike a
  // specific rental's address (shared with the other party to that rental),
  // there's no second party to this cross-rental lookup.
  if (req.authPubkey !== renterPubkey) {
    res.status(403).json({ error: 'You can only look up your own saved address.' })
    return
  }
  const row = getLatestRenterAddress(renterPubkey)
  if (!row) {
    res.status(404).json({ error: 'No saved address yet.' })
    return
  }
  res.json({ address: row.address })
})

app.get('/api/address/:rentalPubkey/:role', requireAuth, (req, res) => {
  const { rentalPubkey, role } = req.params
  if (!isValidPubkey(rentalPubkey) || !isValidRole(role)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  const row = getAddress(rentalPubkey, role)
  if (!row) {
    res.status(404).json({ error: 'Not provided yet.' })
    return
  }
  if (req.authPubkey !== row.owner_pubkey && req.authPubkey !== row.renter_pubkey) {
    res.status(403).json({ error: "You're not a party to this rental." })
    return
  }
  res.json({ address: row.address })
})

app.post('/api/address', requireAuth, (req, res) => {
  const { rentalPubkey, role, ownerPubkey, renterPubkey, address } = req.body ?? {}

  if (!isValidPubkey(rentalPubkey) || !isValidRole(role) || !isValidPubkey(ownerPubkey) || !isValidPubkey(renterPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  if (typeof address !== 'string' || address.trim().length === 0 || address.length > 500) {
    res.status(400).json({ error: 'Address is required (500 characters max).' })
    return
  }

  // Only the party the address belongs to may write it — the renter
  // supplies their own delivery address, the owner their own return
  // address, never the other way around.
  const expectedWriter = role === 'renter_delivery' ? renterPubkey : ownerPubkey
  if (req.authPubkey !== expectedWriter) {
    res.status(403).json({ error: 'You can only provide your own address.' })
    return
  }

  const row = upsertAddress(rentalPubkey, role, address.trim(), req.authPubkey, ownerPubkey, renterPubkey)
  res.json({ address: row.address })
})

// A wallet's own standing address — independent of any rental, unlike the
// section above (see defaultAddress.ts). Read/write access follows the
// exact same "only your own pubkey" shape as /api/profile.

app.get('/api/my-address/:pubkey', requireAuth, (req, res) => {
  if (req.authPubkey !== req.params.pubkey) {
    res.status(403).json({ error: 'You can only view your own saved address.' })
    return
  }
  const row = getDefaultAddress(req.params.pubkey)
  if (!row) {
    res.status(404).json({ error: 'No saved address yet.' })
    return
  }
  res.json({ address: row.address })
})

app.post('/api/my-address', requireAuth, (req, res) => {
  const { pubkey, address } = req.body ?? {}

  if (!isValidPubkey(pubkey)) {
    res.status(400).json({ error: 'Invalid public key.' })
    return
  }
  if (req.authPubkey !== pubkey) {
    res.status(403).json({ error: 'You can only edit your own saved address.' })
    return
  }
  if (typeof address !== 'string' || address.trim().length === 0 || address.length > 500) {
    res.status(400).json({ error: 'Address is required (500 characters max).' })
    return
  }

  const row = upsertDefaultAddress(pubkey, address.trim())
  res.json({ address: row.address })
})

// Delivery method: ship vs. local pickup, chosen by the renter at rent
// time. Not PII like a shipping address, but still specific to one rental —
// same access shape as addresses above (readable by either party, writable
// only by the renter who chose it).

const DELIVERY_METHODS: DeliveryMethod[] = ['ship', 'pickup']

function isValidDeliveryMethod(value: unknown): value is DeliveryMethod {
  return typeof value === 'string' && (DELIVERY_METHODS as string[]).includes(value)
}

app.get('/api/delivery/:rentalPubkey', requireAuth, (req, res) => {
  const { rentalPubkey } = req.params
  if (!isValidPubkey(rentalPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  const row = getDeliveryMethod(rentalPubkey)
  if (!row) {
    res.status(404).json({ error: 'Not set.' })
    return
  }
  if (req.authPubkey !== row.owner_pubkey && req.authPubkey !== row.renter_pubkey) {
    res.status(403).json({ error: "You're not a party to this rental." })
    return
  }
  res.json({ method: row.method })
})

app.post('/api/delivery', requireAuth, (req, res) => {
  const { rentalPubkey, method, ownerPubkey, renterPubkey } = req.body ?? {}

  if (!isValidPubkey(rentalPubkey) || !isValidDeliveryMethod(method) || !isValidPubkey(ownerPubkey) || !isValidPubkey(renterPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  // Only the renter chooses how their own rental gets delivered.
  if (req.authPubkey !== renterPubkey) {
    res.status(403).json({ error: 'Only the renter can set the delivery method.' })
    return
  }

  const row = upsertDeliveryMethod(rentalPubkey, method, ownerPubkey, renterPubkey)
  res.json({ method: row.method })
})

// Handover phase codes (see phaseCodes.ts). Phases 1 and 4 belong to the
// owner, 2 and 3 to the renter. Either party can read a code that already
// exists, but a code is only ever issued to the acting party, and only while
// that phase is the next one on-chain, so it can't be minted early.
// Phase 5 is the owner's close-up photos for a damage dispute. It opens once
// all four handovers are done, so the owner can take the photos before signing
// the flag, and stays open while the rental is disputed.
const PHASE_ACTOR: Record<number, 'owner' | 'renter'> = { 1: 'owner', 2: 'renter', 3: 'renter', 4: 'owner', 5: 'owner' }
const DISPUTE_PHOTOS_PHASE = 5

app.get('/api/phase-code/:rentalPubkey/:phase', requireAuth, requireRentalParty, (req, res) => {
  const rentalPubkey = req.params.rentalPubkey as string
  const phase = Number(req.params.phase)
  if (!Number.isInteger(phase) || !(phase in PHASE_ACTOR)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }

  const existing = getPhaseCode(rentalPubkey, phase)
  if (existing) {
    res.json({ code: existing })
    return
  }

  const rental = req.rental!
  const actor = rental[PHASE_ACTOR[phase]]
  if (req.authPubkey !== actor) {
    res.status(404).json({ error: 'No code has been issued for this step yet.' })
    return
  }
  const open =
    phase === DISPUTE_PHOTOS_PHASE
      ? rental.currentPhase === 4 && rental.status <= RENTAL_STATUS_DISPUTED && !rental.isCompleted
      : rental.currentPhase === phase - 1
  if (!open) {
    res.status(409).json({ error: "This step isn't open yet." })
    return
  }
  res.json({ code: issuePhaseCode(rentalPubkey, phase, actor) })
})

// Damage-dispute answers (see disputeAnswers.ts). The two parties and the
// reviewers on Config can read them; only a party can write their own, once,
// and only while the rental is disputed.
app.get('/api/dispute-answers/:rentalPubkey', requireAuth, requireRentalPartyOrReviewer, (req, res) => {
  res.json(getAnswers(req.params.rentalPubkey as string))
})

app.post('/api/dispute-answers/:rentalPubkey', requireAuth, requireRentalParty, (req, res) => {
  const rentalPubkey = req.params.rentalPubkey as string
  const rental = req.rental!
  if (rental.status !== RENTAL_STATUS_DISPUTED) {
    res.status(409).json({ error: "This rental isn't in review." })
    return
  }
  const party = req.authPubkey === rental.owner ? 'owner' : 'renter'
  const answers = party === 'owner' ? validateOwnerAnswers(req.body) : validateRenterAnswers(req.body)
  if (!answers) {
    res.status(400).json({ error: 'Some answers are missing or too long.' })
    return
  }
  if (!insertAnswers(rentalPubkey, party, answers)) {
    res.status(409).json({ error: "You've already answered. Your first answers stand." })
    return
  }
  res.json(getAnswers(rentalPubkey))
})

// Listing areas: a coarse, public location (city, neighborhood, or
// postcode — never a full address) an owner attaches to their listing so a
// renter considering local pickup can judge distance before committing.
// Unlike addresses/delivery above, this exists before any rental and is
// meant to be readable by anyone browsing, so the GET has no auth gate; only
// the write is restricted, to the listing's owner.

// Bulk variant for the browse page, which needs every listing's area at
// once to compute "available in your area" — same public, no-auth read as
// the single-listing route above, just batched.
app.get('/api/listing-areas', (_req, res) => {
  const rows = getAllListingAreas()
  res.json({ areas: Object.fromEntries(rows.map((r) => [r.listing_pubkey, r.area])) })
})

app.get('/api/listing-area/:listingPubkey', (req, res) => {
  const { listingPubkey } = req.params
  if (!isValidPubkey(listingPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  const row = getListingArea(listingPubkey)
  if (!row) {
    res.status(404).json({ error: 'Not set.' })
    return
  }
  res.json({ area: row.area })
})

app.post('/api/listing-area', requireAuth, (req, res) => {
  const { listingPubkey, ownerPubkey, area } = req.body ?? {}

  if (!isValidPubkey(listingPubkey) || !isValidPubkey(ownerPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  if (typeof area !== 'string' || area.trim().length === 0 || area.length > 120) {
    res.status(400).json({ error: 'General area is required (120 characters max).' })
    return
  }
  if (req.authPubkey !== ownerPubkey) {
    res.status(403).json({ error: 'You can only set the area for your own listing.' })
    return
  }

  const row = upsertListingArea(listingPubkey, ownerPubkey, area.trim())
  res.json({ area: row.area })
})

// Dispute review notes: the dispute itself (reason, photos, frozen amount)
// lives on-chain and is read straight from the program on the frontend —
// this only stores the admin's own review status and free-text note, same
// off-chain DB as addresses. requireAdmin checks the caller's proven pubkey
// (from requireAuth) against the Config PDA's admin field read on-chain, so
// gating isn't just a frontend redirect that a direct API call could skip.
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await getAdminPubkey()
    if (req.authPubkey !== admin) {
      res.status(403).json({ error: 'Admin only.' })
      return
    }
    next()
  } catch (err) {
    console.error('Admin check failed:', err)
    res.status(500).json({ error: 'Could not verify admin access.' })
  }
}

const DISPUTE_STATUSES: DisputeReviewStatus[] = ['under_review', 'resolved']

function isValidDisputeStatus(value: unknown): value is DisputeReviewStatus {
  return typeof value === 'string' && (DISPUTE_STATUSES as string[]).includes(value)
}

app.get('/api/admin/dispute-notes', requireAuth, requireAdmin, (_req, res) => {
  res.json({ notes: listDisputeNotes() })
})

app.post('/api/admin/dispute-notes', requireAuth, requireAdmin, (req, res) => {
  const { rentalPubkey, status, note } = req.body ?? {}

  if (!isValidPubkey(rentalPubkey) || !isValidDisputeStatus(status)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }
  if (typeof note !== 'string' || note.length > 1000) {
    res.status(400).json({ error: 'Note must be 1000 characters or fewer.' })
    return
  }

  const row = upsertDisputeNote(rentalPubkey, status, note.trim())
  res.json({ note: row })
})

// Rental-tied chat: off-chain only, same shape as addresses/delivery, but
// gated by requireRentalParty (rentalAuth.ts) instead of a client-supplied
// owner/renter pair — every read and write re-checks the real on-chain
// Rental account, since a chat thread has no DB row of its own to carry
// trusted owner/renter fields the way a saved address does.

// Powers the /messages inbox list: one batched call instead of the frontend
// looping its own requireRentalParty-gated request per rental. There's no
// single rentalPubkey in the URL to hang requireRentalParty off of here, so
// each requested pubkey gets the same on-chain ownership check inline below
// instead — a caller only ever gets back data for rentals it's really a
// party to, silently skipping anything else (including rentals that don't
// exist or have no messages yet, which just means "not a conversation").
// Registered before /api/messages/:rentalPubkey below so Express doesn't
// match "summary" as a :rentalPubkey value first.
app.post('/api/messages/summary', requireAuth, async (req, res) => {
  const { rentalPubkeys } = (req.body ?? {}) as { rentalPubkeys?: unknown }
  if (!Array.isArray(rentalPubkeys) || rentalPubkeys.length === 0 || rentalPubkeys.length > 200 || !rentalPubkeys.every((p) => typeof p === 'string')) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }

  const conversations: Record<string, { lastMessageText: string; lastMessageAt: number; lastMessageIsMine: boolean; unreadCount: number }> = {}

  await Promise.all(
    (rentalPubkeys as string[]).map(async (rentalPubkey) => {
      const rental = await fetchRentalSummary(rentalPubkey).catch(() => null)
      if (!rental) return
      if (req.authPubkey !== rental.owner && req.authPubkey !== rental.renter) return

      const last = getLastMessage(rentalPubkey)
      if (!last) return

      conversations[rentalPubkey] = {
        lastMessageText: last.body,
        lastMessageAt: last.created_at,
        lastMessageIsMine: last.sender_pubkey === req.authPubkey,
        unreadCount: countUnread(rentalPubkey, req.authPubkey!),
      }
    }),
  )

  res.json({ conversations })
})

app.post('/api/messages/:rentalPubkey', requireAuth, requireRentalParty, (req, res) => {
  const { text } = req.body ?? {}
  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'Message cannot be empty.' })
    return
  }
  if (text.length > MESSAGE_MAX_LEN) {
    res.status(400).json({ error: `Messages are limited to ${MESSAGE_MAX_LEN} characters.` })
    return
  }
  if (req.rental!.isCompleted) {
    res.status(403).json({ error: 'This rental is complete.' })
    return
  }

  const row = insertMessage(req.params.rentalPubkey as string, req.authPubkey!, text.trim())
  res.json({
    message: { id: row.id, senderPubkey: row.sender_pubkey, text: row.body, createdAt: row.created_at, isMine: true, wasUnread: false },
  })
})

app.get('/api/messages/:rentalPubkey', requireAuth, requireRentalParty, (req, res) => {
  const rentalPubkey = req.params.rentalPubkey as string
  // Read before marking: a message's own read_at reflects whether it was
  // *already* unread-for-me the moment this fetch started, which is exactly
  // what the frontend needs to place its "New messages" divider. Marking
  // read is a side effect of this same call (see messages.ts) — a later
  // poll while the panel stays open will find everything already read.
  const rows = listMessages(rentalPubkey)
  const messages = rows.map((row) => ({
    id: row.id,
    senderPubkey: row.sender_pubkey,
    text: row.body,
    createdAt: row.created_at,
    isMine: row.sender_pubkey === req.authPubkey,
    wasUnread: row.sender_pubkey !== req.authPubkey && row.read_at === null,
  }))
  markReadExceptSender(rentalPubkey, req.authPubkey!)
  res.json({ messages })
})

app.get('/api/messages/:rentalPubkey/unread-count', requireAuth, requireRentalParty, (req, res) => {
  res.json({ count: countUnread(req.params.rentalPubkey as string, req.authPubkey!) })
})

app.post('/api/pin', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'No file provided (expected multipart field "file").' })
    return
  }

  try {
    const pinataForm = new FormData()
    pinataForm.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname)
    // "public" so the resulting CID is servable from any IPFS gateway —
    // Pinata defaults new uploads to "private", which needs a signed-URL
    // dance to read back and isn't what a rental's handover photos need.
    pinataForm.append('network', 'public')

    const pinataResponse = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body: pinataForm,
    })

    if (!pinataResponse.ok) {
      const body = await pinataResponse.text()
      console.error('Pinata upload failed:', pinataResponse.status, body)
      res.status(502).json({ error: `Pinata upload failed (${pinataResponse.status}).` })
      return
    }

    const json = (await pinataResponse.json()) as { data: { cid: string } }
    res.json({ cid: json.data.cid })
  } catch (err) {
    console.error('Pin request failed:', err)
    res.status(500).json({ error: 'Upload failed.' })
  }
})

app.listen(PORT, () => {
  console.log(`Grey Swan pinning server listening on http://localhost:${PORT}`)
})
