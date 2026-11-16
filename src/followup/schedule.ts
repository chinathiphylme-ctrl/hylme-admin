import type { PageId } from '../config/pages'
import { addDays } from '../metrics/range'

// brief p.9: day 1 is the first chat; the rounds fall on these days and never move
export const OFFSETS = [2, 5, 7, 14, 30, 45, 60] as const
export const ROUNDS = [1, 2, 3, 4, 5, 6, 7] as const
export const GOALS = [
  'สอบถามต่อจากการพูดคุย',
  'ตอบข้อสงสัยที่ยังค้าง',
  'สร้างความมั่นใจด้วยหลักฐาน',
  'ประเมินความสนใจอีกครั้ง',
  'ส่งข้อมูลใหม่ที่เกี่ยวข้อง',
  'รักษาความสัมพันธ์ ไม่เร่งขาย',
  'ติดตามครั้งสุดท้าย ขออนุญาตสื่อสารต่อ',
]

export type LeadStatus = 'active' | 'won' | 'optout' | 'paused'
export type EventKind = 'create' | 'edit' | 'round' | 'skip' | 'status' | 'reassign' | 'order' | 'import' | 'auto'
export type RoundResult = 'sent' | 'waiting' | 'won' | 'optout'
export type State = 'won' | 'optout' | 'paused' | 'completed' | 'overdue' | 'due' | 'waiting'

export const RESULT_LABEL: Record<string, string> = {
  sent: 'ส่งข้อมูลแล้ว', waiting: 'รอลูกค้าตอบ', won: 'ซื้อแล้ว', optout: 'ขอหยุดติดต่อ', legacy: 'บันทึกจากระบบเดิม', tag: 'ทำแล้ว (จากแท็ก Pancake)',
}
export const STATUS_LABEL: Record<LeadStatus, string> = {
  active: 'กำลังติดตาม', won: 'ซื้อแล้ว', optout: 'หยุดติดต่อ', paused: 'พักติดตาม',
}
export const STATE_LABEL: Record<State, string> = {
  won: 'ซื้อแล้ว', optout: 'หยุดติดต่อ', paused: 'พักติดตาม', completed: 'ครบ 7 รอบ',
  overdue: 'เลยกำหนด', due: 'ถึงกำหนดวันนี้', waiting: 'รอถึงกำหนด',
}

export type FuLead = {
  id: string; name: string; product: string; ownerId: string; firstDay: string; pageId: PageId | null
  chatUrl: string; objection: string; notes: string; status: LeadStatus; version: number; createdAt: string; updatedAt: string
  conversationId: string | null; source: 'manual' | 'tag' // 'tag' = added by the sync from a chat tagged ติดตาม
}

export type FuEvent = {
  id: number; leadId: string; kind: EventKind; roundNo: number | null; result: string | null; dueDay: string | null
  note: string; orderId: string | null; at: string; by: string | null
}

// entries written by the sync from Pancake tags have no person
export const eventBy = (by: string | null, staff: { id: string; name: string }[]) =>
  by === null ? 'ระบบ' : staff.find(s => s.id === by)?.name ?? '—'

export const dueDay = (firstDay: string, round: number) => addDays(firstDay, OFFSETS[round - 1] - 1)

export function nextRound(events: FuEvent[]): number | null {
  const done = new Set(events.filter(e => e.kind === 'round' || e.kind === 'skip').map(e => e.roundNo))
  return ROUNDS.find(r => !done.has(r)) ?? null
}

export function stateOf(lead: FuLead, events: FuEvent[], today: string): State {
  if (lead.status !== 'active') return lead.status
  const r = nextRound(events)
  if (r === null) return 'completed'
  const d = dueDay(lead.firstDay, r)
  return d < today ? 'overdue' : d === today ? 'due' : 'waiting'
}

export const isOpen = (s: State) => s === 'overdue' || s === 'due' || s === 'waiting'

export type QueueRow = { lead: FuLead; events: FuEvent[]; state: State; round: number; due: string; daysLate: number }

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)

export function groupEvents(events: FuEvent[]): Map<string, FuEvent[]> {
  const by = new Map<string, FuEvent[]>()
  for (const e of events) by.set(e.leadId, [...(by.get(e.leadId) ?? []), e])
  return by
}

const RANK: Record<State, number> = { overdue: 0, due: 1, waiting: 2, completed: 3, won: 4, optout: 5, paused: 6 }

// leads still being followed, overdue first, then due today, then upcoming; each by due date
export function queue(leads: FuLead[], events: FuEvent[], today: string): QueueRow[] {
  const by = groupEvents(events)
  const rows: QueueRow[] = []
  for (const lead of leads) {
    const evs = by.get(lead.id) ?? []
    const state = stateOf(lead, evs, today)
    const round = nextRound(evs)
    if (!isOpen(state) || round === null) continue
    const due = dueDay(lead.firstDay, round)
    rows.push({ lead, events: evs, state, round, due, daysLate: Math.max(0, daysBetween(due, today)) })
  }
  return rows.sort((a, b) => RANK[a.state] - RANK[b.state] || a.due.localeCompare(b.due) || a.lead.name.localeCompare(b.lead.name, 'th'))
}

export const stateRank = (s: State) => RANK[s]

export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10)
}
