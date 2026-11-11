import type { PageId } from '../config/pages'
import type { ConvRow, FirstKind, OrderItem, OrderRow, TagRow } from '../parse/types'

export type DbTagRow = { day: string; page_id: string; tag: string; color: string; count: number }
export type DbConv = {
  day: string; conversation_id: string; page_id: string; first_at: string; last_at: string
  msg_count: number; first_kind: string; has_phone: boolean; tags: string[]; topics?: string[]; pancake_url: string
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
  topics: c.topics,
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
  topics: c.topics ?? [],
  pancakeUrl: c.pancake_url,
})

export type DbOrder = {
  order_id: string; day: string; confirmed_at: string; admin: string; source: string; page_id: string | null
  amount: number; discount: number; cod: boolean; status: string; items: OrderItem[]
}

export const toDbOrder = (o: OrderRow): DbOrder => ({
  order_id: o.orderId, day: o.day, confirmed_at: o.confirmedAt, admin: o.admin, source: o.source, page_id: o.pageId,
  amount: o.amount, discount: o.discount, cod: o.cod, status: o.status, items: o.items,
})

export const fromDbOrder = (o: DbOrder): OrderRow => ({
  orderId: o.order_id, day: o.day, confirmedAt: toBangkokIsoFromAny(o.confirmed_at), admin: o.admin, source: o.source,
  pageId: o.page_id as PageId | null, amount: Number(o.amount), discount: Number(o.discount), cod: o.cod, status: o.status,
  items: o.items ?? [],
})
