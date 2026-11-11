import type { PageId } from '../config/pages'
import type { Topic } from './topics'

export type Sheet = { name: string; rows: unknown[][] }

export type TagRow = { day: string; pageId: PageId; tag: string; color: string; count: number }

export type TagStatsResult =
  | { ok: true; fileName: string; rows: TagRow[]; days: string[]; pageIds: PageId[]; tags: { tag: string; color: string }[] }
  | { ok: false; fileName: string; error: string }

export type FirstKind = 'button' | 'typed' | 'media'

export type ConvRow = {
  day: string
  conversationId: string
  pageId: PageId
  firstAt: string
  lastAt: string
  msgCount: number
  firstKind: FirstKind
  hasPhone: boolean
  tags: string[]
  topics: string[]
  pancakeUrl: string
}

export type OrderItem = { sku: string; name: string; qty: number }

export type OrderRow = {
  orderId: string
  day: string
  confirmedAt: string
  admin: string
  source: string
  pageId: PageId | null
  amount: number
  discount: number
  cod: boolean
  status: string
  items: OrderItem[]
}

export type OrdersResult =
  | { ok: true; fileName: string; orders: OrderRow[]; days: string[]; pageIds: PageId[] }
  | { ok: false; fileName: string; error: string }

export type MessagesResult =
  | { ok: true; fileName: string; convs: ConvRow[]; days: string[]; pageIds: PageId[]; messageCount: number; candidates: Candidate[] }
  | { ok: false; fileName: string; error: string }

export type Candidate = { conversationId: string; pageId: PageId; day: string; text: string; topic: Topic }
