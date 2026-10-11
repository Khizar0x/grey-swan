import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { AiConfig } from './config.js'
import type { PreparedImage } from './images.js'
import type { AiStore } from './store.js'

export type Part = { type: 'text'; text: string } | { type: 'image'; image: PreparedImage }

export interface LlmRequest {
  kind: 'extract' | 'blind' | 'judge'
  model: string
  system: string
  parts: Part[]
  maxTokens: number
  runIndex: number // judge runs 0/1 — part of the cache key so run 2 is a real second opinion
  attempt: number // 0 first try, 1 the single retry after invalid output
  meta: { caseId: string; party?: 'owner' | 'renter'; slot: 'A' | 'B' }
}

export interface LlmResponse {
  text: string
  cached?: boolean
  usage?: { input: number; output: number }
}

export interface LlmClient {
  call(req: LlmRequest): Promise<LlmResponse>
}

export const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex')

export function cacheKey(req: LlmRequest): string {
  return sha256(
    JSON.stringify({
      model: req.model,
      system: req.system,
      parts: req.parts.map((p) => (p.type === 'text' ? p.text : `img:${p.image.sha256}`)),
      maxTokens: req.maxTokens,
      runIndex: req.runIndex,
      attempt: req.attempt,
    }),
  )
}

// The only client that can spend money. Order of checks: cache (free) ->
// daily cap -> reserve slot -> API call -> log tokens -> cache the answer.
export class LiveClient implements LlmClient {
  private sdk: Anthropic

  constructor(
    private cfg: AiConfig,
    private store: AiStore,
    private log: (line: string) => void = (l) => console.log(l),
  ) {
    if (!cfg.apiKey) throw new Error('AI_MODE=live needs ANTHROPIC_API_KEY in server/.env')
    // maxRetries 0: an SDK-level retry would be a second billed call that
    // bypasses our cap. We retry (once, counted) ourselves on invalid output.
    this.sdk = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 0, timeout: 120_000 })
  }

  async call(req: LlmRequest): Promise<LlmResponse> {
    const key = cacheKey(req)
    const hit = this.store.getCached(key)
    if (hit) return { text: hit.output, cached: true }

    const slot = this.store.reserveLiveCall(req.model, this.cfg.dailyLiveCap)
    const res = await this.sdk.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: req.parts.map((p) =>
            p.type === 'text'
              ? { type: 'text' as const, text: p.text }
              : { type: 'image' as const, source: { type: 'base64' as const, media_type: p.image.mediaType, data: p.image.base64 } },
          ),
        },
      ],
    })
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens }
    this.store.finishLiveCall(slot, usage.input, usage.output)
    this.log(`[ai live] ${req.kind} ${req.model} run=${req.runIndex} attempt=${req.attempt} tokens in=${usage.input} out=${usage.output}`)

    if (res.stop_reason === 'refusal') throw new Error('Model refused the request')
    if (res.stop_reason === 'max_tokens') throw new Error('Model output was cut off at max_tokens')
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    this.store.putCached(key, req.model, text, usage.input, usage.output)
    return { text, usage }
  }
}
