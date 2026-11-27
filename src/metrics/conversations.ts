import type { PageId } from '../config/pages'
import { groupOf, isAdTag, isCloseTag, isDateTagOf } from '../grouping/rules'
import type { ConvRow } from '../parse/types'
import { gradeOf, type Grade } from './leads'
import { addDays, type DateRange } from './range'

export type Stage = 'สนใจ' | 'ถามสุขภาพ' | 'ขอราคา' | 'ขอโปร' | 'ลังเล' | 'พร้อมสั่ง' | 'ปิดแล้ว' | 'อื่นๆ'
export type Reply = 'ยังคุยอยู่' | 'อ่านไม่ตอบ' | 'ไม่เปิดอ่าน' | 'ทักซ้ำไม่ซื้อ'
export type Seen = { conversationId: string; tag: string; firstDay: string | null; baseline: boolean }

export const STAGES: Stage[] = ['สนใจ', 'ถามสุขภาพ', 'ขอราคา', 'ขอโปร', 'ลังเล', 'พร้อมสั่ง', 'ปิดแล้ว', 'อื่นๆ']
const STAGE_PREFIX: [string, Stage][] = [['5.', 'พร้อมสั่ง'], ['6.', 'ลังเล'], ['3.', 'ขอโปร'], ['2.', 'ขอราคา'], ['4.', 'ถามสุขภาพ'], ['1.', 'สนใจ']]
const FOLLOW_ORDER: Stage[] = ['พร้อมสั่ง', 'ลังเล', 'ขอโปร', 'ขอราคา']
const OLD = '8.ลูกค้าเก่า'

export function stageOf(tags: string[]): Stage {
  if (tags.some(isCloseTag)) return 'ปิดแล้ว'
  return STAGE_PREFIX.find(([p]) => tags.some(t => t.startsWith(p)))?.[1] ?? 'อื่นๆ'
}

// chats with no 1.–10. tag, split by whether an admin tagged anything at all;
// date and ad-id tags don't count, they only say when or from which ad the chat came
export const OTHER_TAGS = 'มีแท็กอื่น แต่ไม่มีแท็ก 1.–10.'
export const NO_TAGS = 'ไม่มีแท็กเลย'
export const isDateOrAdTag = (t: string) => /^\d{1,2}\/\d{1,2}$/.test(t.trim()) || isAdTag(t)
export const noStageLabel = (tags: string[]): string => tags.some(t => !isDateOrAdTag(t)) ? OTHER_TAGS : NO_TAGS

export const NUMBER_ROWS = ['1.สนใจ', '2.ขอราคา', '3.ขอโปร', '4.ถามสุขภาพ', '5.พร้อมสั่ง', '6.ลังเล',
  '7.เปรียบเทียบราคา', '8.ลูกค้าเก่า', '9.ทักมั่ว', '10.เราทักเม้น'] as const
const STAGE_NUMBER: Partial<Record<Stage, number>> = { 'สนใจ': 1, 'ขอราคา': 2, 'ขอโปร': 3, 'ถามสุขภาพ': 4, 'พร้อมสั่ง': 5, 'ลังเล': 6 }

// the one numbered row (1–10) an open chat sits in: its stage tag 1.–6. in stageOf's order, else 7., 10., 9., 8.
// (8.ลูกค้าเก่า last, so a returning customer with a stage shows under that stage); 0 = no numbered tag, null = closed
export function numberOf(tags: string[]): number | null {
  const s = stageOf(tags)
  if (s === 'ปิดแล้ว') return null
  if (s !== 'อื่นๆ') return STAGE_NUMBER[s]!
  return [7, 10, 9, 8].find(n => tags.some(t => t.trim().startsWith(`${n}.`))) ?? 0
}

export function replyOf(tags: string[]): Reply {
  for (const r of ['ไม่เปิดอ่าน', 'อ่านไม่ตอบ', 'ทักซ้ำไม่ซื้อ'] as const) if (tags.includes(r)) return r
  return 'ยังคุยอยู่'
}

const isProduct = (t: string) => groupOf(t, {}) === 'สินค้า'
const isNew = (c: ConvRow) => c.tags.some(t => isDateTagOf(t, c.day)) && !c.tags.includes(OLD)
const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length

export function convStats(convs: ConvRow[]) {
  const products = new Map<string, number>()
  for (const c of convs) for (const t of c.tags.filter(isProduct)) products.set(t, (products.get(t) ?? 0) + 1)
  const hours = Array<number>(24).fill(0)
  // only first and last times are kept, so hours count chats by the hour of the latest message
  for (const c of convs) hours[Number(c.lastAt.slice(11, 13))]++
  const closed = convs.filter(c => c.tags.some(isCloseTag))
  return {
    total: convs.length,
    // one row per numbered tag 1.–10.; chats with none of them are shown on their own by noStageChats
    matrix: NUMBER_ROWS.flatMap((stage, i) => {
      const xs = convs.filter(c => numberOf(c.tags) === i + 1)
      if (!xs.length) return []
      const r = (k: Reply) => count(xs, c => replyOf(c.tags) === k)
      return [{ stage, talking: r('ยังคุยอยู่'), read: r('อ่านไม่ตอบ'), unread: r('ไม่เปิดอ่าน'), repeat: r('ทักซ้ำไม่ซื้อ') }]
    }),
    closedNow: closed.length,
    closedNew: count(closed, isNew),
    closedStale: count(closed, c => c.tags.includes('ทักซ้ำไม่ซื้อ')),
    mix: [
      ['แชทใหม่ (แท็กวันที่)', count(convs, isNew)],
      ['ลูกค้าเก่า', count(convs, c => c.tags.includes(OLD))],
      ['แชทอื่น ไม่มีแท็กวันที่', count(convs, c => !isNew(c) && !c.tags.includes(OLD))],
    ] as [string, number][],
    products: [...products].sort((a, b) => b[1] - a[1]),
    hours,
  }
}

const isSilent = (c: ConvRow) => { const r = replyOf(c.tags); return r === 'อ่านไม่ตอบ' || r === 'ไม่เปิดอ่าน' }
const byLatest = (a: ConvRow, b: ConvRow) => b.lastAt.localeCompare(a.lastAt)

export type NoStageChats = {
  other: { chats: ConvRow[]; silent: number; tags: { tag: string; chats: number; silent: number }[] }
  none: { chats: ConvRow[]; rows: [string, number][] }
}

// open chats with no 1.–10. tag: which other tags they carry (and how many went quiet), and the untagged ones,
// each with its chats newest first so admins can open them in Pancake and add a stage tag
export function noStageChats(convs: ConvRow[]): NoStageChats {
  const open = convs.filter(c => numberOf(c.tags) === 0)
  const other = open.filter(c => noStageLabel(c.tags) === OTHER_TAGS).sort(byLatest)
  const none = open.filter(c => noStageLabel(c.tags) === NO_TAGS).sort(byLatest)
  const tags = new Map<string, { chats: number; silent: number }>()
  for (const c of other) for (const t of new Set(c.tags.filter(t => !isDateOrAdTag(t)))) {
    const x = tags.get(t) ?? { chats: 0, silent: 0 }
    x.chats++
    if (isSilent(c)) x.silent++
    tags.set(t, x)
  }
  const n = (f: (c: ConvRow) => boolean) => count(none, f)
  return {
    other: {
      chats: other, silent: count(other, isSilent),
      tags: [...tags].map(([tag, x]) => ({ tag, ...x })).sort((a, b) => b.chats - a.chats || a.tag.localeCompare(b.tag)),
    },
    none: { chats: none, rows: [
      ['ส่งข้อความเดียว', n(c => c.msgCount <= 1)], ['2–3 ข้อความ', n(c => c.msgCount >= 2 && c.msgCount <= 3)], ['4 ข้อความขึ้นไป', n(c => c.msgCount >= 4)],
      ['เริ่มจากกดปุ่ม', n(c => c.firstKind === 'button')], ['พิมพ์ข้อความแรกเอง', n(c => c.firstKind !== 'button')],
      ['มีเลขแอด (มาจากโฆษณา)', n(c => c.tags.some(isAdTag))],
    ] },
  }
}

export type FollowItem = {
  conversationId: string; pageId: PageId; day: string; stage: Stage; status: Reply
  product: string; last: string; msgs: number; kind: 'ลูกค้าเก่า' | 'ใหม่'; pancakeUrl: string; grade: Grade
}

const GRADE_ORDER: Grade[] = ['A', 'B', 'C', 'D']

// grades come from all of a chat's exports when known; otherwise from this one row
export function followList(convs: ConvRow[], grades: Map<string, Grade> = new Map()): FollowItem[] {
  return convs
    .map(c => ({ c, stage: stageOf(c.tags), status: replyOf(c.tags) }))
    .filter(x => FOLLOW_ORDER.includes(x.stage) && (x.status === 'ไม่เปิดอ่าน' || x.status === 'อ่านไม่ตอบ'))
    .map(({ c, stage, status }): FollowItem => ({
      conversationId: c.conversationId,
      pageId: c.pageId,
      day: c.day,
      stage,
      status,
      product: c.tags.find(isProduct) ?? '-',
      last: c.lastAt.slice(11, 16),
      msgs: c.msgCount,
      kind: c.tags.includes(OLD) ? 'ลูกค้าเก่า' : 'ใหม่',
      pancakeUrl: c.pancakeUrl,
      grade: grades.get(c.conversationId)
        ?? gradeOf({ tags: c.tags, msgs: c.msgCount, days: 1, typedFirst: c.firstKind !== 'button' }),
    }))
    .sort((a, b) =>
      GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)
      || FOLLOW_ORDER.indexOf(a.stage) - FOLLOW_ORDER.indexOf(b.stage)
      || Number(a.status !== 'อ่านไม่ตอบ') - Number(b.status !== 'อ่านไม่ตอบ')
      || a.last.localeCompare(b.last))
}

export const SEGMENT_REASON = 'ต้องมีไฟล์ข้อความอย่างน้อย 2 วันติดกัน จึงจะรู้ว่าแชทไหนปิดในช่วงนี้จริง (แท็กปิดในไฟล์เดียวอาจค้างมาจากการซื้อครั้งก่อน)'

// earliest d/m date tag on any row, with the year taken from that row's day (a later month means last year)
function startDay(rows: ConvRow[]): string | null {
  let best: string | null = null
  for (const r of rows) for (const t of r.tags) {
    const m = t.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (!m) continue
    const [y, mo] = [Number(r.day.slice(0, 4)), Number(r.day.slice(5, 7))]
    const month = Number(m[2])
    const d = `${month > mo ? y - 1 : y}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`
    if (!best || d < best) best = d
  }
  return best
}

type SegmentRow = { dim: 'สินค้า' | 'กลุ่มลูกค้า' | 'ข้อความแรก'; name: string; chats: number; closed: number; rate: number }

export function segmentRates(convs: ConvRow[], seen: Seen[], range: DateRange):
  { ready: false; reason: string } | { ready: true; rows: SegmentRow[] } {
  const days = new Set(convs.map(c => c.day))
  if (![...days].some(d => days.has(addDays(d, 1)))) return { ready: false, reason: SEGMENT_REASON }

  const byConv = new Map<string, ConvRow[]>()
  for (const c of convs) byConv.set(c.conversationId, [...(byConv.get(c.conversationId) ?? []), c])
  const inRange = (d: string | null) => !!d && d >= range.from && d <= range.to
  // a close counts only when the chat's first close tag (ปิด, ปิดAds or ปิดOrganic) appeared inside the range;
  // a baseline close means it was already closed before we saw it, even if the tag was later swapped
  const firstClose = new Map<string, string | null>()
  for (const s of seen.filter(x => isCloseTag(x.tag))) {
    const prev = firstClose.get(s.conversationId)
    const day = s.baseline ? null : s.firstDay
    if (prev === undefined) firstClose.set(s.conversationId, day)
    else firstClose.set(s.conversationId, prev === null || day === null ? null : (day < prev ? day : prev))
  }
  const newClose = new Set([...firstClose].filter(([, d]) => inRange(d)).map(([id]) => id))

  const acc = new Map<string, SegmentRow>()
  const add = (dim: SegmentRow['dim'], name: string, closed: boolean) => {
    const k = `${dim}|${name}`
    const row = acc.get(k) ?? { dim, name, chats: 0, closed: 0, rate: 0 }
    row.chats++
    if (closed) row.closed++
    acc.set(k, row)
  }
  for (const [id, rows] of byConv) {
    rows.sort((a, b) => a.day.localeCompare(b.day))
    const first = rows[0]
    // the chat started on its earliest date tag; chats without one have an unknown start and are left out
    if (!inRange(startDay(rows))) continue
    const closed = newClose.has(id)
    const tags = new Set(rows.flatMap(r => r.tags))
    for (const t of tags) if (isProduct(t)) add('สินค้า', t, closed)
    if (tags.has(OLD)) add('กลุ่มลูกค้า', 'ลูกค้าเก่า', closed)
    else add('กลุ่มลูกค้า', 'ลูกค้าใหม่', closed)
    add('ข้อความแรก', first.firstKind === 'button' ? 'กดปุ่ม/ข้อความสั้นสำเร็จรูป' : 'พิมพ์คำถามเอง/ส่งรูป', closed)
  }
  return {
    ready: true,
    rows: [...acc.values()].map(r => ({ ...r, rate: Math.round((r.closed / r.chats) * 1000) / 10 })),
  }
}
