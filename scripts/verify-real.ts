// Local check of the app's parse and metrics code against the real 29 ต.ค. exports in the parent folder.
// The exports contain customer data and are never committed; this script only prints totals.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { convStats, followList } from '../src/metrics/conversations'
import { summarize } from '../src/metrics/daily'
import { parseMessages } from '../src/parse/messages'
import { parseTagStats } from '../src/parse/tagStats'
import { readWorkbook } from '../src/parse/workbook'

const dir = resolve(import.meta.dirname, '..', '..')
const load = (name: string) => {
  const b = readFileSync(resolve(dir, name))
  return readWorkbook(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

const failures: string[] = []
const check = (label: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

const tags = parseTagStats(load('pages_statistics_tag_1793335738.xlsx'), 'tags')
const msgs = parseMessages(load('EXPORT_MESSAGE_1793335974628.xlsx'), 'msgs')
if (!tags.ok) throw new Error(tags.error)
if (!msgs.ok) throw new Error(msgs.error)

const day = { from: '2026-10-29', to: '2026-10-29' }
const kpi = (page: Parameters<typeof summarize>[3]) => {
  const s = summarize(tags.rows, {}, day, page)
  return [s.newChats, s.closed, s.ready, s.pending]
}
check('days', tags.days, ['2026-10-29'])
check('all pages', kpi('all'), [188, 27, 28, 174])
check('FB', kpi('100379779472465'), [118, 8, 11, 109])
check('ไขมัน', kpi('516356078238016'), [70, 19, 17, 65])
check('convs', [msgs.convs.length, msgs.messageCount], [141, 255])

const cs = convStats(msgs.convs)
check('mix', cs.mix.map(m => m[1]), [108, 11, 22])
check('closed', [cs.closedNow, cs.closedNew], [17, 2])
check('follow', followList(msgs.convs).length, 58)

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('verify ok')
