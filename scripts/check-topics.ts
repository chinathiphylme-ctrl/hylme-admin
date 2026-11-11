// Local-only verification. Never print or write customer sentences/IDs.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { toLeads } from '../src/metrics/leads'
import { topicStats } from '../src/metrics/reasons'
import { ADDRESS_RE, parseMessages } from '../src/parse/messages'
import type { ConvRow } from '../src/parse/types'
import { readWorkbook } from '../src/parse/workbook'

const dir = resolve(import.meta.dirname, '..', '..')
const files = readdirSync(dir).filter(f => /^EXPORT_MESSAGE_.*\.xlsx$/i.test(f)).sort()
assert(files.length, 'No local message exports found')
const convs: ConvRow[] = []
for (const file of files) {
  const b = readFileSync(resolve(dir, file))
  const r = parseMessages(readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), file)
  if (!r.ok) throw new Error(r.error)
  convs.push(...r.convs)
  assert(r.candidates.length <= 30)
  assert(new Set(r.candidates.map(c => `${c.pageId}|${c.conversationId}`)).size === r.candidates.length)
  assert(r.candidates.every(c => !ADDRESS_RE.test(c.text) && !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(c.text)))
  console.log(JSON.stringify({ file, chats: r.convs.length, candidates: r.candidates.length,
    topics: Object.fromEntries([...new Set(r.convs.flatMap(c => c.topics))].map(t => [t, r.convs.filter(c => c.topics.includes(t)).length])),
    candidateLengths: r.candidates.map(c => ({ topic: c.topic, length: c.text.length })) }))
}
const leads = toLeads(convs)
const stats = topicStats(leads)
console.log(JSON.stringify({ files: files.length, distinctChats: leads.length, noTopic: stats.none,
  topics: [...stats.buy, ...stats.notBuy].sort((a, b) => b.chats - a.chats) }))
