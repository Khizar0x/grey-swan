import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAiConfig } from './config.js'
import { buildStagedCases, STAGED_NAMES } from './cases.js'
import { LiveClient } from './llm.js'
import { scriptedMock } from './mock.js'
import { runCase } from './pipeline.js'
import { AiStore } from './store.js'
import type { CaseFile } from './types.js'

// usage: npm run ai:run-case -- <case.json | staged-name>
// AI_MODE=live to spend real (capped) API credit; default is mock.
async function main() {
  const arg = process.argv[2]
  const here = path.dirname(fileURLToPath(import.meta.url))
  const dir = path.join(here, '..', '..', 'data', 'ai-cases')
  if (!arg) {
    console.log(`usage: npm run ai:run-case -- <case.json | ${STAGED_NAMES.join(' | ')}>`)
    process.exit(1)
  }
  let file = arg
  if (STAGED_NAMES.includes(arg)) {
    await buildStagedCases(dir)
    file = path.join(dir, `${arg}.json`)
  }
  if (!existsSync(file)) throw new Error(`No such case file: ${file}`)
  const caseFile = JSON.parse(readFileSync(file, 'utf8')) as CaseFile
  // photo paths in a hand-written case file may be relative to the file itself
  for (const p of caseFile.photos) if (!path.isAbsolute(p.path)) p.path = path.resolve(path.dirname(file), p.path)

  const config = loadAiConfig()
  const store = new AiStore(config.dbPath)
  const client = config.mode === 'live' ? new LiveClient(config, store) : scriptedMock(caseFile)
  console.log(`mode=${config.mode} models=${config.modelA},${config.modelB} judges=${config.judgeModelA},${config.judgeModelB} case=${caseFile.caseId}`)
  const res = await runCase(caseFile, { config, store, client })
  console.log(JSON.stringify(res.decision, null, 2))
  console.log(`prompt_hash=${res.promptHash}\noutput_hash=${res.outputHash}`)
  if (config.mode === 'live') console.log(`live calls today: ${store.liveCallsToday()}/${config.dailyLiveCap}`)
  if (res.reasoning.length) console.log('reasoning (human reviewers only):\n' + res.reasoning.slice(0, 4).join('\n'))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e)) // never print config / keys
  process.exit(1)
})
