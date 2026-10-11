import { PublicKey } from '@solana/web3.js'
import type { NextFunction, Request, Response } from 'express'
import { getReviewerPubkeys } from './config.js'
import { fetchRentalSummary, type OnChainRentalSummary } from './rentalChain.js'

declare global {
  namespace Express {
    interface Request {
      rental?: OnChainRentalSummary
    }
  }
}

function isValidPubkey(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    new PublicKey(value)
    return true
  } catch {
    return false
  }
}

// Shared gate for every chat route: a rental only has a chat once a real
// Rental account exists on-chain (after rent_item), and only its two real
// parties may read or write it — checked fresh against the chain on every
// request, not against anything self-reported by the caller. Attaches the
// fetched summary to the request so handlers don't re-fetch it themselves.
export async function requireRentalParty(req: Request, res: Response, next: NextFunction) {
  const { rentalPubkey } = req.params
  if (!isValidPubkey(rentalPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }

  let rental: OnChainRentalSummary | null
  try {
    rental = await fetchRentalSummary(rentalPubkey)
  } catch (err) {
    console.error('Rental lookup failed:', err)
    res.status(502).json({ error: "Couldn't verify this rental right now. Try again shortly." })
    return
  }

  if (!rental) {
    res.status(404).json({ error: 'Rental not found.' })
    return
  }
  if (req.authPubkey !== rental.owner && req.authPubkey !== rental.renter) {
    res.status(403).json({ error: "You're not a party to this rental." })
    return
  }

  req.rental = rental
  next()
}

// Same as requireRentalParty, but a reviewer (or the admin) may also pass.
// Used for dispute answers, which the two parties and whoever decides the
// dispute may read. Reviewers are read from Config, never from the request.
export async function requireRentalPartyOrReviewer(req: Request, res: Response, next: NextFunction) {
  const { rentalPubkey } = req.params
  if (!isValidPubkey(rentalPubkey)) {
    res.status(400).json({ error: 'Invalid request.' })
    return
  }

  let rental: OnChainRentalSummary | null
  let reviewers: string[]
  try {
    ;[rental, reviewers] = await Promise.all([fetchRentalSummary(rentalPubkey), getReviewerPubkeys()])
  } catch (err) {
    console.error('Rental lookup failed:', err)
    res.status(502).json({ error: "Couldn't verify this rental right now. Try again shortly." })
    return
  }

  if (!rental) {
    res.status(404).json({ error: 'Rental not found.' })
    return
  }
  const caller = req.authPubkey as string
  if (caller !== rental.owner && caller !== rental.renter && !reviewers.includes(caller)) {
    res.status(403).json({ error: "You're not allowed to see this." })
    return
  }

  req.rental = rental
  next()
}
