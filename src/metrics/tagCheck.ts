import { ADMIN_TAGS } from '../config/admins'
import type { PageId } from '../config/pages'
import { BUY_REASON_TAGS, CLOSE_TAGS, isCloseTag, LOST_REASON_TAGS } from '../grouping/rules'
import type { ConvRow } from '../parse/types'
import { numberOf } from './conversations'

// the four rules for a fully tagged chat, so the owner can tell whether the "why not bought" data is complete
export type Missing = 'admin' | 'stage' | 'buyReason' | 'plainClose' | 'lostReason'
export const MISSING: Missing[] = ['admin', 'stage', 'buyReason', 'plainClose', 'lostReason']
export const MISSING_LABEL: Record<Missing, string> = {
  admin: 'ไม่มีชื่อแอดมิน',
  stage: 'ยังไม่ปิด ไม่มีแท็กขั้น 1.–10.',
  buyReason: 'ปิดแล้ว ไม่มีเหตุผลที่ซื้อ',
  plainClose: 'ปิดด้วย "ปิด" เฉยๆ ไม่แยก Ads/Organic',
  lostReason: 'ลูกค้าเงียบ ไม่มีเหตุผลที่ไม่ซื้อ',
}
export const NO_NAME = 'ไม่มีชื่อ'

const SILENT = ['อ่านไม่ตอบ', 'ไม่เปิดอ่าน', 'ทักซ้ำไม่ซื้อ']
const clean = (tags: string[]) => tags.map(t => t.trim())
const adminsOf = (tags: string[]) => Object.entries(ADMIN_TAGS).filter(([tag]) => tags.includes(tag)).map(([, nick]) => nick)

// the rules that apply to a chat, in MISSING order
export function appliesTo(raw: string[]): Missing[] {
  const tags = clean(raw)
  if (tags.some(isCloseTag)) return ['admin', 'buyReason', 'plainClose']
  return tags.some(t => SILENT.includes(t)) ? ['admin', 'stage', 'lostReason'] : ['admin', 'stage']
}

function fails(rule: Missing, tags: string[]): boolean {
  switch (rule) {
    case 'admin': return adminsOf(tags).length === 0
    case 'stage': return numberOf(tags) === 0
    case 'buyReason': return !tags.some(t => BUY_REASON_TAGS.includes(t))
    case 'plainClose': return !tags.includes(CLOSE_TAGS.ads) && !tags.includes(CLOSE_TAGS.organic)
    case 'lostReason': return !tags.some(t => LOST_REASON_TAGS.includes(t))
  }
}

export function missingOf(raw: string[]): Missing[] {
  const tags = clean(raw)
  return appliesTo(tags).filter(rule => fails(rule, tags))
}

export type DayCheck = {
  day: string
  pageIds: PageId[]
  total: number
  complete: number
  counts: Record<Missing, { missing: number; of: number }>
  byAdmin: { admin: string; incomplete: number; of: number }[]
  incomplete: { conv: ConvRow; missing: Missing[] }[]
}

function checkDay(day: string, convs: ConvRow[]): DayCheck {
  const counts = Object.fromEntries(MISSING.map(m => [m, { missing: 0, of: 0 }])) as DayCheck['counts']
  const admins = new Map([...Object.values(ADMIN_TAGS), NO_NAME].map(a => [a, { admin: a, incomplete: 0, of: 0 }]))
  const incomplete: DayCheck['incomplete'] = []
  for (const conv of convs) {
    const missing = missingOf(conv.tags)
    for (const rule of appliesTo(conv.tags)) counts[rule].of++
    for (const rule of missing) counts[rule].missing++
    const names = adminsOf(clean(conv.tags))
    for (const a of names.length ? names : [NO_NAME]) {
      const row = admins.get(a)!
      row.of++
      if (missing.length) row.incomplete++
    }
    if (missing.length) incomplete.push({ conv, missing })
  }
  incomplete.sort((a, b) => b.conv.lastAt.localeCompare(a.conv.lastAt))
  return {
    day,
    pageIds: [...new Set(convs.map(c => c.pageId))],
    total: convs.length,
    complete: convs.length - incomplete.length,
    counts,
    byAdmin: [...admins.values()].filter(r => r.of > 0),
    incomplete,
  }
}

// one check per day in the uploaded chats, newest day first; when two files of the same day hold a chat
// (an export and a later re-export), only the copy with the latest message counts, as the database keeps one row
export function checkByDay(convs: ConvRow[]): DayCheck[] {
  const latest = new Map<string, ConvRow>()
  for (const c of convs) {
    const k = `${c.day}|${c.pageId}|${c.conversationId}`
    const prev = latest.get(k)
    if (!prev || c.lastAt > prev.lastAt) latest.set(k, c)
  }
  const days = new Map<string, ConvRow[]>()
  for (const c of latest.values()) days.set(c.day, [...(days.get(c.day) ?? []), c])
  return [...days.keys()].sort().reverse().map(d => checkDay(d, days.get(d)!))
}
