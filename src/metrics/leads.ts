import type { PageId } from '../config/pages'
import { isAdTag, isCloseTag, isDateTagOf } from '../grouping/rules'
import type { ConvRow } from '../parse/types'
import type { DateRange } from './range'

export type Grade = 'A' | 'B' | 'C' | 'D'

export const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: 'A', label: 'A ร้อน', hint: 'พร้อมสั่ง · คุย 4 ข้อความขึ้นไป · กลับมาทักอีกวัน' },
  { grade: 'B', label: 'B อุ่น', hint: 'ขอโปร/ถามสุขภาพ · พิมพ์คุยเองมากกว่า 1 ข้อความ' },
  { grade: 'C', label: 'C เย็น', hint: 'กดปุ่มหรือส่งข้อความเดียวแล้วเงียบ' },
  { grade: 'D', label: 'D ไม่ใช่ลีด', hint: 'ไม่สนใจ · ทักมั่ว · ทักซ้ำไม่ซื้อ' },
]

export type Lead = {
  conversationId: string; pageId: PageId; startDay: string; lastDay: string; isNew: boolean
  tags: string[]; msgs: number; days: number; phone: boolean; typedFirst: boolean; closed: boolean; ads: string[]
}

const OLD = '8.ลูกค้าเก่า'

// behaviour only: close tags, phone, ปลายทาง and โอน are outcomes and never decide a grade (spec §3)
export function gradeOf(l: Pick<Lead, 'tags' | 'msgs' | 'days' | 'typedFirst'>): Grade {
  const pre = (p: string) => l.tags.some(t => t.startsWith(p))
  if (pre('5.') || l.msgs >= 4 || l.days >= 2) return 'A'
  if (l.tags.includes('ไม่สนใจ') || pre('9.') || l.tags.includes('ทักซ้ำไม่ซื้อ')) return 'D'
  if (pre('3.') || pre('4.') || (l.typedFirst && l.msgs >= 2)) return 'B'
  return 'C'
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

export function gradeStats(leads: Lead[]): { grade: Grade; chats: number; closed: number; rate: number | null }[] {
  return GRADES.map(({ grade }) => {
    const xs = leads.filter(l => gradeOf(l) === grade)
    const closed = xs.filter(l => l.closed).length
    return { grade, chats: xs.length, closed, rate: xs.length ? Math.round((closed / xs.length) * 1000) / 10 : null }
  })
}
