// Real-data check of lead grades and ad scores against the live database (read-only, anon key from .env.local).
// Prints totals only; no customer fields leave this script.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fromDbConv, type DbConv } from '../src/data/mappers'
import { adScores } from '../src/metrics/ads'
import { gradeStats, inStart, toLeads } from '../src/metrics/leads'

const env = Object.fromEntries(readFileSync(resolve(import.meta.dirname, '..', '.env.local'), 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const rows: DbConv[] = []
for (let a = 0; ; a += 1000) {
  const { data, error } = await db.from('conversations')
    .select('day,conversation_id,page_id,first_at,last_at,msg_count,first_kind,has_phone,tags,pancake_url')
    .order('day').order('conversation_id').range(a, a + 999)
  if (error) throw new Error(error.message)
  rows.push(...(data as DbConv[]))
  if (!data || data.length < 1000) break
}

const range = { from: '2026-10-29', to: '2026-11-10' }
const leads = toLeads(rows.map(fromDbConv)).filter(inStart(range))
const fresh = leads.filter(l => l.isNew)
console.log(`rows ${rows.length} · leads in range ${leads.length} · new ${fresh.length}`)
for (const s of gradeStats(fresh)) console.log(`${s.grade}  ${String(s.chats).padStart(4)} chats  ${s.rate}%`)
const ads = adScores(leads, {}, 'all')
console.log(`ad avg ${ads.avg}% of ${ads.adChats} chats`)
for (const a of ads.ads.filter(x => x.verdict !== 'ข้อมูลยังน้อย')) console.log(`${a.tag}  ${a.chats} chats  ${a.closed} closed  ${a.verdict}`)
console.log(`ข้อมูลยังน้อย: ${ads.ads.filter(x => x.verdict === 'ข้อมูลยังน้อย').length}`)
