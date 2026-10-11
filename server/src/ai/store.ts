import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export class LiveCapError extends Error {}

export interface VerdictRow {
  case_id: string
  mode: string
  decision: 'HUMAN_REVIEW' | 'POST_VERDICT'
  tiers: string | null
  reasons: string
  prompt_hash: string
  output_hash: string
  models: string
  reasoning: string // for human reviewers only
  created_at: number
}

// One handle per config path. ':memory:' gives tests a fresh private DB.
export class AiStore {
  readonly db: DatabaseSync

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_cache (
        key TEXT PRIMARY KEY, model TEXT NOT NULL, output TEXT NOT NULL,
        input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_live_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, model TEXT NOT NULL,
        input_tokens INTEGER, output_tokens INTEGER, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_verdicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL, mode TEXT NOT NULL, decision TEXT NOT NULL, tiers TEXT,
        reasons TEXT NOT NULL, prompt_hash TEXT NOT NULL, output_hash TEXT NOT NULL,
        models TEXT NOT NULL, reasoning TEXT NOT NULL, created_at INTEGER NOT NULL
      );
    `)
  }

  getCached(key: string): { output: string } | undefined {
    return this.db.prepare('SELECT output FROM ai_cache WHERE key = ?').get(key) as { output: string } | undefined
  }

  putCached(key: string, model: string, output: string, inTok: number, outTok: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO ai_cache (key, model, output, input_tokens, output_tokens, created_at) VALUES (?,?,?,?,?,?)')
      .run(key, model, output, inTok, outTok, Date.now())
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10)
  }

  liveCallsToday(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM ai_live_calls WHERE day = ?').get(this.today()) as { n: number }
    return r.n
  }

  // Reserve a slot BEFORE the request, so a call that errors or times out
  // still counts against the cap (it may well have been billed).
  reserveLiveCall(model: string, cap: number): number {
    if (this.liveCallsToday() >= cap) throw new LiveCapError(`Daily live-call cap of ${cap} reached; refusing live call.`)
    const r = this.db
      .prepare('INSERT INTO ai_live_calls (day, model, created_at) VALUES (?,?,?)')
      .run(this.today(), model, Date.now())
    return Number(r.lastInsertRowid)
  }

  finishLiveCall(id: number, inTok: number, outTok: number): void {
    this.db.prepare('UPDATE ai_live_calls SET input_tokens=?, output_tokens=? WHERE id=?').run(inTok, outTok, id)
  }

  insertVerdict(v: Omit<VerdictRow, 'created_at'>): void {
    this.db
      .prepare(
        'INSERT INTO ai_verdicts (case_id, mode, decision, tiers, reasons, prompt_hash, output_hash, models, reasoning, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(v.case_id, v.mode, v.decision, v.tiers, v.reasons, v.prompt_hash, v.output_hash, v.models, v.reasoning, Date.now())
  }

  listVerdicts(caseId?: string): VerdictRow[] {
    const q = caseId ? this.db.prepare('SELECT * FROM ai_verdicts WHERE case_id=? ORDER BY id') : this.db.prepare('SELECT * FROM ai_verdicts ORDER BY id')
    return (caseId ? q.all(caseId) : q.all()) as unknown as VerdictRow[]
  }
}
