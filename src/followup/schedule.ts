import type { PageId } from '../config/pages'
import { addDays } from '../metrics/range'

// brief p.9: day 1 is the first chat and the rounds fall on days 2/5/7/14/30/45/60. Since 2026-11-23 the owner counts
// each round from the day the round before was actually done, keeping the brief's gaps (spec 2026-11-23-followup-count-from-done)
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
  conversationId: string | null; source: 'manual' | 'tag' | 'chat' // 'tag' = added by the sync from a chat tagged ติดตาม; 'chat' = started from a silent chat
}

export type FuEvent = {
  id: number; leadId: string; kind: EventKind; roundNo: number | null; result: string | null; dueDay: string | null
  note: string; orderId: string | null; at: string; by: string | null
}

// entries written by the sync from Pancake tags have no person
export const eventBy = (by: string | null, staff: { id: string; name: string }[]) =>
  by === null ? 'ระบบ' : staff.find(s => s.id === by)?.name ?? '—'

// the brief's fixed day: the example plan, and the fallback when a date is missing
export const dueDay = (firstDay: string, round: number) => addDays(firstDay, OFFSETS[round - 1] - 1)

// days from the round before (round 1: from the first chat)
export const GAPS = OFFSETS.map((o, i) => (i === 0 ? o - 1 : o - OFFSETS[i - 1]))

// the Bangkok day a row was saved; null for a missing or broken timestamp
const savedDay = (at: string): string | null => {
  const t = Date.parse(at)
  return Number.isNaN(t) ? null : bangkokToday(new Date(t))
}

const roundRow = (events: FuEvent[], r: number) => events.find(e => (e.kind === 'round' || e.kind === 'skip') && e.roundNo === r)

// as fu_round_due: round 1 is day 2, or the day the customer entered the queue if later;
// a later round is the day the round before was saved plus the gap
function dueOf(lead: FuLead, events: FuEvent[], r: number): string {
  if (r === 1) {
    const entered = savedDay(lead.createdAt)
    const day2 = addDays(lead.firstDay, GAPS[0])
    return entered && entered > day2 ? entered : day2
  }
  const prev = roundRow(events, r - 1)
  const d = prev ? savedDay(prev.at) : null
  return d ? addDays(d, GAPS[r - 1]) : dueDay(lead.firstDay, r)
}

export function nextDue(lead: FuLead, events: FuEvent[]): { round: number; due: string } | null {
  const r = nextRound(events)
  return r === null ? null : { round: r, due: dueOf(lead, events, r) }
}

export type PlanDay = { round: number; day: string; kind: 'done' | 'skip' | 'next' | 'plan' }

// done and skipped rounds on the day saved; the next one on its due day; the rest estimated as if each is done on time
export function planDays(lead: FuLead, events: FuEvent[]): PlanDay[] {
  const next = nextDue(lead, events)
  let last = ''
  return ROUNDS.map(r => {
    const e = roundRow(events, r)
    if (e) return { round: r, day: savedDay(e.at) ?? e.dueDay ?? dueDay(lead.firstDay, r), kind: e.kind === 'skip' ? 'skip' : 'done' }
    if (next && r === next.round) return { round: r, day: (last = next.due), kind: 'next' }
    last = last ? addDays(last, GAPS[r - 1]) : dueDay(lead.firstDay, r)
    return { round: r, day: last, kind: 'plan' }
  })
}

export function nextRound(events: FuEvent[]): number | null {
  const done = new Set(events.filter(e => e.kind === 'round' || e.kind === 'skip').map(e => e.roundNo))
  return ROUNDS.find(r => !done.has(r)) ?? null
}

export function stateOf(lead: FuLead, events: FuEvent[], today: string): State {
  if (lead.status !== 'active') return lead.status
  const n = nextDue(lead, events)
  if (n === null) return 'completed'
  const d = n.due
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
    const n = nextDue(lead, evs)
    if (!isOpen(state) || n === null) continue
    const { round, due } = n
    rows.push({ lead, events: evs, state, round, due, daysLate: Math.max(0, daysBetween(due, today)) })
  }
  return rows.sort((a, b) => RANK[a.state] - RANK[b.state] || a.due.localeCompare(b.due) || a.lead.name.localeCompare(b.lead.name, 'th'))
}

export const stateRank = (s: State) => RANK[s]

export function bangkokToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10)
}
