import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CasePhoto, CaseFile, PartyInput, PhaseKey } from './ai/types.js'
import type { OwnerAnswers, RenterAnswers } from './disputeAnswers.js'

// Turns a real rental plus what each party answered into the AI pipeline's
// case-file format (ai/types.ts CaseFile). The pipeline reads photos from
// local files, so this downloads each pinned photo into `photoDir` first.
// Nothing here changes the pipeline; it only prepares its input.

const GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

export type ManifestCids = Partial<Record<PhaseKey, string>>

export interface CaseInputs {
  rentalPubkey: string
  depositLamports: number
  // One manifest CID per phase: p1 to p4 from the rental account, and
  // `dispute` for the owner's close-ups from their answers.
  manifests: ManifestCids
  owner: OwnerAnswers | null
  renter: RenterAnswers | null
  photoDir: string
  fetchBytes?: (url: string) => Promise<Uint8Array>
}

async function defaultFetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch ${url} (HTTP ${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

const clip = (value: string, max: number) => value.slice(0, max)

// Answer keys and values stay inside the pipeline's sanitise limits
// (key 40, value 200, 20 entries).
export function ownerPartyInput(a: OwnerAnswers | null): PartyInput {
  if (!a) return { answers: {}, statement: '' }
  const answers: Record<string, string> = {
    item_damaged: 'yes',
    where: clip(a.areas.join(', '), 200),
    what: a.damageType,
    severity: a.severity,
  }
  if (a.missingAccessories) answers.missing_accessories = clip(a.missingAccessories, 200)
  return { answers, statement: a.statement }
}

export function renterPartyInput(a: RenterAnswers | null): PartyInput {
  if (!a) return { answers: {}, statement: '' }
  return {
    answers: { item_damaged: a.agrees, during_use: a.duringUse, during_packing: a.duringPacking },
    statement: a.statement,
  }
}

const PHASE_PREFIX: Record<PhaseKey, string> = { p1: 'P1', p2: 'P2', p3: 'P3', p4: 'P4', dispute: 'D' }

export async function buildCaseFile(inputs: CaseInputs): Promise<CaseFile> {
  const fetchBytes = inputs.fetchBytes ?? defaultFetchBytes
  await mkdir(inputs.photoDir, { recursive: true })

  const photos: CasePhoto[] = []
  for (const phase of Object.keys(PHASE_PREFIX) as PhaseKey[]) {
    const manifestCid = inputs.manifests[phase]
    if (!manifestCid) continue
    const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes(`${GATEWAY}${manifestCid}`))) as { photos?: unknown }
    const cids = Array.isArray(manifest.photos) ? manifest.photos.filter((c): c is string => typeof c === 'string') : []
    for (const [i, cid] of cids.entries()) {
      const id = `${PHASE_PREFIX[phase]}-${i + 1}`
      const file = path.join(inputs.photoDir, `${id}.jpg`)
      await writeFile(file, await fetchBytes(`${GATEWAY}${cid}`))
      photos.push({ id, phase, path: file })
    }
  }

  return {
    caseId: `rental-${inputs.rentalPubkey}`,
    depositLamports: inputs.depositLamports,
    photos,
    owner: ownerPartyInput(inputs.owner),
    renter: renterPartyInput(inputs.renter),
  }
}
