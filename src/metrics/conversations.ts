import type { PageId } from '../config/pages'
import { dateTag, groupOf } from '../grouping/rules'
import type { ConvRow } from '../parse/types'
import { addDays, type DateRange } from './range'

export type Stage = 'สนใจ' | 'ถามสุขภาพ' | 'ขอราคา' | 'ขอโปร' | 'ลังเล' | 'พร้อมสั่ง' | 'ปิดแล้ว' | 'อื่นๆ'
export type Reply = 'ยังคุยอยู่' | 'อ่านไม่ตอบ' | 'ไม่เปิดอ่าน' | 'ทักซ้ำไม่ซื้อ'
export type Seen = { conversationId: string; tag: string; firstDay: string | null; baseline: boolean }

export const STAGES: Stage[] = ['สนใจ', 'ถามสุขภาพ', 'ขอราคา', 'ขอโปร', 'ลังเล', 'พร้อมสั่ง', 'ปิดแล้ว', 'อื่นๆ']
const STAGE_PREFIX: [string, Stage][] = [['5.', 'พร้อมสั่ง'], ['6.', 'ลังเล'], ['3.', 'ขอโปร'], ['2.', 'ขอราคา'], ['4.', 'ถามสุขภาพ'], ['1.', 'สนใจ']]
const FOLLOW_ORDER: Stage[] = ['พร้อมสั่ง', 'ลังเล', 'ขอโปร', 'ขอราคา']
const OLD = '8.ลูกค้าเก่า'

export function stageOf(tags: string[]): Stage {
  if (tags.includes('ปิด')) return 'ปิดแล้ว'
  return STAGE_PREFIX.find(([p]) => tags.some(t => t.startsWith(p)))?.[1] ?? 'อื่นๆ'
}

export function replyOf(tags: string[]): Reply {
  for (const r of ['ไม่เปิดอ่าน', 'อ่านไม่ตอบ', 'ทักซ้ำไม่ซื้อ'] as const) if (tags.includes(r)) return r
  return 'ยังคุยอยู่'
}

const isProduct = (t: string) => groupOf(t, {}) === 'สินค้า'
const isNew = (c: ConvRow) => c.tags.includes(dateTag(c.day)) && !c.tags.includes(OLD)
const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length

export function convStats(convs: ConvRow[]) {
  const products = new Map<string, number>()
  for (const c of convs) for (const t of c.tags.filter(isProduct)) products.set(t, (products.get(t) ?? 0) + 1)
  const hours = Array<number>(24).fill(0)
  // only first and last times are kept, so hours count chats by the hour of the latest message
  for (const c of convs) hours[Number(c.lastAt.slice(11, 13))]++
  const closed = convs.filter(c => c.tags.includes('ปิด'))
  return {
    total: convs.length,
    matrix: STAGES.filter(s => s !== 'ปิดแล้ว').flatMap(stage => {
      const xs = convs.filter(c => stageOf(c.tags) === stage)
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

export type FollowItem = {
  conversationId: string; pageId: PageId; day: string; stage: Stage; status: Reply
  product: string; last: string; msgs: number; kind: 'ลูกค้าเก่า' | 'ใหม่'; pancakeUrl: string
}

export function followList(convs: ConvRow[]): FollowItem[] {
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
    }))
    .sort((a, b) =>
      FOLLOW_ORDER.indexOf(a.stage) - FOLLOW_ORDER.indexOf(b.stage)
      || Number(a.status !== 'อ่านไม่ตอบ') - Number(b.status !== 'อ่านไม่ตอบ')
      || a.last.localeCompare(b.last))
}

export const SEGMENT_REASON = 'ต้องมีไฟล์ข้อความอย่างน้อย 2 วันติดกัน จึงจะรู้ว่าแชทไหนปิดในช่วงนี้จริง (แท็ก "ปิด" ในไฟล์เดียวอาจค้างมาจากการซื้อครั้งก่อน)'

type SegmentRow = { dim: 'สินค้า' | 'กลุ่มลูกค้า' | 'ข้อความแรก'; name: string; chats: number; closed: number; rate: number }

export function segmentRates(convs: ConvRow[], seen: Seen[], range: DateRange):
  { ready: false; reason: string } | { ready: true; rows: SegmentRow[] } {
  const days = new Set(convs.map(c => c.day))
  if (![...days].some(d => days.has(addDays(d, 1)))) return { ready: false, reason: SEGMENT_REASON }

  const byConv = new Map<string, ConvRow[]>()
  for (const c of convs) byConv.set(c.conversationId, [...(byConv.get(c.conversationId) ?? []), c])
  const newClose = new Set(seen.filter(s => s.tag === 'ปิด' && !s.baseline && s.firstDay).map(s => s.conversationId))

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
    if (first.day < range.from || first.day > range.to) continue
    const closed = newClose.has(id)
    const tags = new Set(rows.flatMap(r => r.tags))
    for (const t of tags) if (isProduct(t)) add('สินค้า', t, closed)
    if (tags.has(OLD)) add('กลุ่มลูกค้า', 'ลูกค้าเก่า', closed)
    else if (first.tags.includes(dateTag(first.day))) add('กลุ่มลูกค้า', 'ลูกค้าใหม่', closed)
    add('ข้อความแรก', first.firstKind === 'button' ? 'กดปุ่ม/ข้อความสั้นสำเร็จรูป' : 'พิมพ์คำถามเอง/ส่งรูป', closed)
  }
  return {
    ready: true,
    rows: [...acc.values()].map(r => ({ ...r, rate: Math.round((r.closed / r.chats) * 1000) / 10 })),
  }
}
