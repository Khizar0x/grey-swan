import { PublicKey } from '@solana/web3.js'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { type AddressRole, getAddress, upsertAddress } from './addresses.js'
import { issueNonceMessage, issueSessionToken, requireAuth, verifySignInSignature } from './auth.js'
import { getAdminPubkey } from './config.js'
import { type DisputeReviewStatus, listDisputeNotes, upsertDisputeNote } from './disputes.js'
import { getProfile, upsertProfile } from './profiles.js'

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
    res.status(401).json({ error: 'Signature verification failed — try signing in again.' })
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
