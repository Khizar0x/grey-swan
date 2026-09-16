import { PublicKey } from '@solana/web3.js'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import nacl from 'tweetnacl'

declare global {
  namespace Express {
    interface Request {
      authPubkey?: string
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const secretFile = path.join(dataDir, 'session-secret.txt')

// Prefer an operator-configured SESSION_SECRET (e.g. in production). For
// local dev, generate one and persist it to disk so restarting the dev
// server (tsx watch reloads on every save) doesn't invalidate everyone's
// session — only actually losing the file does.
function loadOrCreateSecret(): string {
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim()
  const secret = randomBytes(32).toString('hex')
  writeFileSync(secretFile, secret)
  return secret
}

const SESSION_SECRET = process.env.SESSION_SECRET ?? loadOrCreateSecret()
const TOKEN_TTL = '24h'
const NONCE_TTL_MS = 5 * 60 * 1000

interface NonceEntry {
  nonce: string
  issuedAt: string
  expiresAt: number
}

// In-memory is fine here: nonces are single-use and only live for 5
// minutes — losing them on a restart just means an in-flight sign-in has to
// restart too, not a real problem.
const nonces = new Map<string, NonceEntry>()

function buildMessage(pubkey: string, nonce: string, issuedAt: string): string {
  return `Sign in to Grey Swan\n\nPublic key: ${pubkey}\nNonce: ${nonce}\nIssued at: ${issuedAt}`
}

// Step 1 of sign-in: hand the wallet something to sign that it couldn't
// have signed before (the nonce) and that can't be reused afterwards
// (deleted on verify) — otherwise a captured signature could be replayed
// forever to mint new sessions.
export function issueNonceMessage(pubkey: string): string {
  const nonce = randomBytes(16).toString('hex')
  const issuedAt = new Date().toISOString()
  nonces.set(pubkey, { nonce, issuedAt, expiresAt: Date.now() + NONCE_TTL_MS })
  return buildMessage(pubkey, nonce, issuedAt)
}

// Step 2: check the signature the wallet produced actually verifies against
// the claimed public key, using the same ed25519 scheme Solana signs
// transactions with (tweetnacl is what @solana/web3.js itself uses under
// the hood for this).
export function verifySignInSignature(pubkey: string, signatureBase64: string): boolean {
  const entry = nonces.get(pubkey)
  if (!entry || entry.expiresAt < Date.now()) return false
  nonces.delete(pubkey)

  const message = buildMessage(pubkey, entry.nonce, entry.issuedAt)
  const messageBytes = new TextEncoder().encode(message)

  let signatureBytes: Uint8Array
  let pubkeyBytes: Uint8Array
  try {
    signatureBytes = Buffer.from(signatureBase64, 'base64')
    pubkeyBytes = new PublicKey(pubkey).toBytes()
  } catch {
    return false
  }

  return nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes)
}

export function issueSessionToken(pubkey: string): string {
  return jwt.sign({ sub: pubkey }, SESSION_SECRET, { expiresIn: TOKEN_TTL })
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in required.' })
    return
  }
  try {
    const decoded = jwt.verify(header.slice('Bearer '.length), SESSION_SECRET) as { sub: string }
    req.authPubkey = decoded.sub
    next()
  } catch {
    res.status(401).json({ error: 'Session expired — sign in again.' })
  }
}
