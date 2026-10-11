import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type AiMode = 'mock' | 'live'

export interface AiConfig {
  mode: AiMode
  modelA: string
  modelB: string // extractors and the blind pass use modelA/modelB
  judgeModelA: string // the judges are configured separately
  judgeModelB: string
  dailyLiveCap: number
  dbPath: string
  // Mirrors Config.large_deposit_threshold_lamports (contract default 5 SOL). The
  // contract auto-releases only when deposit <= threshold. In production this
  // should be READ from the on-chain Config account (the admin can change it
  // with update_config); this env value is a local stand-in.
  largeDepositThresholdLamports: number
  auditRate: number // 0..1, share of otherwise-clean cases sent to a human anyway
  apiKey: string | undefined
  secret: string | undefined // seeds the per-request delimiter and canary
}

const here = path.dirname(fileURLToPath(import.meta.url))

// Read at call time (not import time) so tests and the CLI can set env first.
export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const mode = env.AI_MODE === 'live' ? 'live' : 'mock' // anything else is mock
  return {
    mode,
    modelA: env.AI_MODEL_A || 'claude-haiku-5-5',
    modelB: env.AI_MODEL_B || 'claude-sonnet-5-5',
    judgeModelA: env.AI_JUDGE_MODEL_A || 'claude-sonnet-5-5',
    judgeModelB: env.AI_JUDGE_MODEL_B || 'claude-opus-5-5',
    dailyLiveCap: Number(env.AI_DAILY_LIVE_CAP) > 0 ? Number(env.AI_DAILY_LIVE_CAP) : 40,
    dbPath: env.AI_DB_PATH || path.join(here, '..', '..', 'data', 'greyswan.db'),
    largeDepositThresholdLamports:
      Number(env.AI_LARGE_DEPOSIT_THRESHOLD_LAMPORTS) > 0 ? Number(env.AI_LARGE_DEPOSIT_THRESHOLD_LAMPORTS) : 5_000_000_000,
    auditRate: env.AI_AUDIT_RATE !== undefined ? Number(env.AI_AUDIT_RATE) : 0.1,
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    secret: env.AI_SECRET || undefined,
  }
}
