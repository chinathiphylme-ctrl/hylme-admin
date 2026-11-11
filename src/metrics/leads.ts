import type { PageId } from '../config/pages'
import { isAdTag, isCloseTag, isDateTagOf } from '../grouping/rules'
import type { ConvRow } from '../parse/types'
import type { DateRange } from './range'

export type Grade = 'A' | 'B' | 'C' | 'D'

export const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: 'A', label: 'A ร้อน', hint: 'มีสัญญาณคุยต่อเนื่องหรือพร้อมสั่ง: ติดแท็กพร้อมสั่ง มีอย่างน้อย 4 ข้อความ หรือพบแชทอย่างน้อย 2 วัน เข้าเพียงข้อเดียวก็เป็น A' },
  { grade: 'B', label: 'B อุ่น', hint: 'เริ่มสอบถามรายละเอียด: มีแท็กขอโปร/ถามสุขภาพ หรือเริ่มด้วยข้อความ/รูปและมีอย่างน้อย 2 ข้อความ โดยยังไม่เข้า A และไม่มีแท็กตัดออก D' },
  { grade: 'C', label: 'C เย็น', hint: 'ข้อมูลการคุยยังน้อย: ยังไม่เข้า A หรือ B และไม่มีแท็กตัดออก D เช่น ส่งข้อความเดียว หรือเริ่มจากปุ่มแล้วคุยไม่ถึง 4 ข้อความ' },
  { grade: 'D', label: 'D ไม่ใช่ลีด', hint: 'มีแท็กไม่สนใจ ทักมั่ว หรือทักซ้ำไม่ซื้อ และยังไม่เข้าเกณฑ์ A' },
]

export type Lead = {
  conversationId: string; pageId: PageId; startDay: string; lastDay: string; isNew: boolean
  tags: string[]; topics: string[]; msgs: number; days: number; phone: boolean; typedFirst: boolean; closed: boolean; ads: string[]
}

const OLD = '8.ลูกค้าเก่า'

// behaviour only: close tags, phone, ปลายทาง and โอน are outcomes and never decide a grade (spec §3)
export function explainGrade(l: Pick<Lead, 'tags' | 'msgs' | 'days' | 'typedFirst'>): { grade: Grade; reasons: string[] } {
  const pre = (p: string) => l.tags.some(t => t.startsWith(p))
  const matched = (rules: [boolean, string][]) => rules.filter(([yes]) => yes).map(([, reason]) => reason)
  const a = matched([[pre('5.'), 'มีแท็กพร้อมสั่ง (5.)'], [l.msgs >= 4, 'มีข้อความอย่างน้อย 4 ข้อความ'], [l.days >= 2, 'พบแชทอย่างน้อย 2 วัน']])
  if (a.length) return { grade: 'A', reasons: a }
  const d = matched([[l.tags.includes('ไม่สนใจ'), 'มีแท็กไม่สนใจ'], [pre('9.'), 'มีแท็กทักมั่ว (9.)'], [l.tags.includes('ทักซ้ำไม่ซื้อ'), 'มีแท็กทักซ้ำไม่ซื้อ']])
  if (d.length) return { grade: 'D', reasons: d }
  const b = matched([[pre('3.'), 'มีแท็กขอโปรโมชั่น (3.)'], [pre('4.'), 'มีแท็กถามสุขภาพ (4.)'], [l.typedFirst && l.msgs >= 2, 'เริ่มด้วยข้อความ/รูป และมีอย่างน้อย 2 ข้อความ']])
  if (b.length) return { grade: 'B', reasons: b }
  return { grade: 'C', reasons: [l.typedFirst ? 'เริ่มด้วยข้อความ/รูป มีเพียง 1 ข้อความ' : `เริ่มจากปุ่ม มี ${l.msgs} ข้อความ`] }
}

export const gradeOf = (l: Pick<Lead, 'tags' | 'msgs' | 'days' | 'typedFirst'>): Grade => explainGrade(l).grade

// Count only reasons that actually assigned this grade; do not show losing rules from another grade.
export function gradeReasonCounts(leads: Lead[], grade: Grade): [string, number][] {
  const counts = new Map<string, number>()
  for (const lead of leads) {
    const result = explainGrade(lead)
    if (result.grade !== grade) continue
    for (const reason of result.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])
}

// one lead per chat; tags are the union over every export, so a tag removed later still counts
export function toLeads(rows: ConvRow[]): Lead[] {
  const byConv = new Map<string, ConvRow[]>()
  for (const r of rows) byConv.set(r.conversationId, [...(byConv.get(r.conversationId) ?? []), r])
  return [...byConv].map(([conversationId, rs]) => {
    rs.sort((a, b) => a.day.localeCompare(b.day))
    const first = rs[0]
    const tags = [...new Set(rs.flatMap(r => r.tags))]
    return {
      conversationId,
      pageId: first.pageId,
      startDay: first.day,
      lastDay: rs[rs.length - 1].day,
      isNew: first.tags.some(t => isDateTagOf(t, first.day)) && !tags.includes(OLD),
      tags,
      topics: [...new Set(rs.flatMap(r => r.topics ?? []))],
      msgs: rs.reduce((s, r) => s + r.msgCount, 0),
      days: new Set(rs.map(r => r.day)).size,
      phone: rs.some(r => r.hasPhone),
      typedFirst: first.firstKind !== 'button',
      closed: tags.some(isCloseTag),
      ads: tags.filter(isAdTag),
    }
  })
}

export const inStart = (r: DateRange) => (l: Lead) => l.startDay >= r.from && l.startDay <= r.to

// close rate of new chats only: returning customers who buy are left out of both sides,
// so a small page can't show 200% (tag stats count every close but only new chats' date tags)
export function newChatCloses(leads: Lead[], range: DateRange, page: PageId | 'all'): { newChats: number; closed: number; rate: number | null } {
  const sel = leads.filter(inStart(range)).filter(l => l.isNew && (page === 'all' || l.pageId === page))
  const closed = sel.filter(l => l.closed).length
  return { newChats: sel.length, closed, rate: sel.length ? Math.round((closed / sel.length) * 1000) / 10 : null }
}

export function gradeStats(leads: Lead[]): { grade: Grade; chats: number; closed: number; rate: number | null }[] {
  return GRADES.map(({ grade }) => {
    const xs = leads.filter(l => gradeOf(l) === grade)
    const closed = xs.filter(l => l.closed).length
    return { grade, chats: xs.length, closed, rate: xs.length ? Math.round((closed / xs.length) * 1000) / 10 : null }
  })
}
