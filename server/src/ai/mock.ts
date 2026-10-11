import type { LlmClient, LlmRequest, LlmResponse } from './llm.js'
import type { CaseFile } from './types.js'

// Replays the "recorded" responses stored in a case file's `mock` section.
// Costs nothing and never touches the network; this is what mock mode and
// every test uses. Both model slots answer identically, as two well-behaved
// models would on a clear case.
export function scriptedMock(caseFile: CaseFile): LlmClient {
  const m = caseFile.mock
  if (!m) throw new Error(`Case ${caseFile.caseId} has no mock script; it can only run in live mode`)
  return {
    async call(req: LlmRequest): Promise<LlmResponse> {
      let out: unknown
      if (req.kind === 'extract') {
        const owner = req.meta.party === 'owner'
        out = {
          claims: owner ? m.ownerClaims : m.renterClaims,
          injection_detected: (owner ? m.injection?.owner : m.injection?.renter) ?? false,
        }
      } else if (req.kind === 'blind') {
        out = { entries: m.blind, text_in_photos: m.textInImage ?? false }
      } else {
        out = { findings: m.findings, injection_detected: false }
      }
      return { text: JSON.stringify(out) }
    },
  }
}

// Test helper: let a test tamper with what the "model" says.
export function tamper(base: LlmClient, fn: (req: LlmRequest, text: string) => string | Promise<string>): LlmClient {
  return {
    async call(req) {
      const r = await base.call(req)
      return { ...r, text: await fn(req, r.text) }
    },
  }
}
