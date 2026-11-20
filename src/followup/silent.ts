// Silent chats: the follow list (ต้องตามวันนี้) — chats at ขั้น พร้อมสั่ง/ลังเล/ขอโปร/ขอราคา that went unread or unanswered in
// a page's message file. They live in the follow-up tab; recording a result adds them to the queue (fu_start_chat).
import type { PageId } from '../config/pages'
import { followList, type FollowItem } from '../metrics/conversations'
import type { Grade } from '../metrics/leads'
import type { DateRange } from '../metrics/range'
import type { ConvRow } from '../parse/types'
import type { FuEvent, FuLead } from './schedule'

export type Listed = { conversationId: string; pageId: PageId }

// the ones nobody has put in the queue yet
export const notQueued = (items: FollowItem[], leads: FuLead[]): FollowItem[] => {
  const queued = new Set(leads.flatMap(l => (l.conversationId ? [l.conversationId] : [])))
  return items.filter(i => !queued.has(i.conversationId))
}

// which chats were on the follow list of each day's file, per page (the list itself reads one page-day file at a time)
export function silentByDay(convs: ConvRow[], grades: Map<string, Grade> = new Map()): Map<string, Listed[]> {
  const files = new Map<string, ConvRow[]>()
  for (const c of convs) {
    const k = `${c.day}|${c.pageId}`
    const rows = files.get(k)
    if (rows) rows.push(c)
    else files.set(k, [c])
  }
  const out = new Map<string, Listed[]>()
  for (const [k, rows] of files) {
    const day = k.slice(0, 10)
    const listed = followList(rows, grades).map(f => ({ conversationId: f.conversationId, pageId: f.pageId }))
    if (listed.length) out.set(day, [...(out.get(day) ?? []), ...listed])
  }
  return out
}

// listed = distinct chats on the list in the range; followed = those in the queue with a round or status recorded
// (by a person or a ติดตามN tag); won = those bought. The admin filter narrows followed and won only.
export function silentReport(
  byDay: Map<string, Listed[]>, leads: FuLead[], events: FuEvent[], range: DateRange, pageId: PageId | 'all', ownerId: string | 'all',
): { listed: number; followed: number; won: number } {
  const ids = new Set<string>()
  for (const [day, xs] of byDay) {
    if (day < range.from || day > range.to) continue
    for (const x of xs) if (pageId === 'all' || x.pageId === pageId) ids.add(x.conversationId)
  }
  const acted = new Set(events.filter(e => e.kind === 'round' || e.kind === 'status').map(e => e.leadId))
  const followed = leads.filter(l => l.conversationId && ids.has(l.conversationId) && acted.has(l.id) && (ownerId === 'all' || l.ownerId === ownerId))
  return { listed: ids.size, followed: followed.length, won: followed.filter(l => l.status === 'won').length }
}
