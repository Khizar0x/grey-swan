import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { getIpfsFile, isCid } from './ipfsCache.js'

const CID = 'bafkreigkf3litbabsmx3pyelirf23hl3gxshhusjrbzpbamosdogje3lsm'
const reply = (status: number, body: string, type: string) => new Response(body, { status, headers: { 'content-type': type } })

test('cid check', () => {
  assert.ok(isCid(CID))
  assert.ok(!isCid('../../etc/passwd'))
  assert.ok(!isCid('short'))
})

test('retries a 429, then serves from disk without asking the gateway again', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ipfs-'))
  let calls = 0
  const fakeFetch = (async () => {
    calls += 1
    return calls === 1 ? reply(429, 'busy', 'text/html') : reply(200, '{"photos":[]}', 'application/json')
  }) as typeof fetch
  const first = await getIpfsFile(CID, dir, fakeFetch, 1)
  assert.equal(first.contentType, 'application/json')
  assert.equal(calls, 2)
  const second = await getIpfsFile(CID, dir, fakeFetch, 1)
  assert.equal(new TextDecoder().decode(second.bytes), '{"photos":[]}')
  assert.equal(calls, 2)
})

test('never stores an error page as a file', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ipfs-'))
  const fakeFetch = (async () => reply(200, '<html>challenge</html>', 'text/html')) as typeof fetch
  await assert.rejects(getIpfsFile(CID, dir, fakeFetch, 1))
})

test('gives up after repeated 429s', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ipfs-'))
  const fakeFetch = (async () => reply(429, 'busy', 'text/html')) as typeof fetch
  await assert.rejects(getIpfsFile(CID, dir, fakeFetch, 1, 3), /not available/)
})
