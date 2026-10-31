import type { PageId } from '../config/pages'
import type { ConvRow, FirstKind, TagRow } from '../parse/types'

export type DbTagRow = { day: string; page_id: string; tag: string; color: string; count: number }
export type DbConv = {
  day: string; conversation_id: string; page_id: string; first_at: string; last_at: string
  msg_count: number; first_kind: string; has_phone: boolean; tags: string[]; pancake_url: string
}

// Postgres returns timestamptz in UTC; the app works in Bangkok wall time
export function toBangkokIsoFromAny(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600e3)
  return `${d.toISOString().slice(0, 19)}+07:00`
}

export const toDbTagRow = (r: TagRow): DbTagRow => ({ day: r.day, page_id: r.pageId, tag: r.tag, color: r.color, count: r.count })
export const fromDbTagRow = (r: DbTagRow): TagRow => ({ day: r.day, pageId: r.page_id as PageId, tag: r.tag, color: r.color, count: r.count })

export const toDbConv = (c: ConvRow): DbConv => ({
  day: c.day,
  conversation_id: c.conversationId,
  page_id: c.pageId,
  first_at: c.firstAt,
  last_at: c.lastAt,
  msg_count: c.msgCount,
  first_kind: c.firstKind,
  has_phone: c.hasPhone,
  tags: c.tags,
  pancake_url: c.pancakeUrl,
})

export const fromDbConv = (c: DbConv): ConvRow => ({
  day: c.day,
  conversationId: c.conversation_id,
  pageId: c.page_id as PageId,
  firstAt: toBangkokIsoFromAny(c.first_at),
  lastAt: toBangkokIsoFromAny(c.last_at),
  msgCount: c.msg_count,
  firstKind: c.first_kind as FirstKind,
  hasPhone: c.has_phone,
  tags: c.tags,
  pancakeUrl: c.pancake_url,
})
