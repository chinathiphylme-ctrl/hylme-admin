import { PAGES, type PageId } from '../config/pages'
import { CLOSE_TAGS } from '../grouping/rules'
import type { Seen } from '../metrics/conversations'
import type { Quote, QuoteCategory } from '../metrics/quotes'
import { previousRange, type DateRange } from '../metrics/range'
import type { ConvRow, OrderRow, TagRow } from '../parse/types'
import { db } from './client'
import { fromDbConv, fromDbOrder, fromDbTagRow, type DbConv, type DbOrder, type DbTagRow } from './mappers'

const PAGE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function all<T>(query: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

export async function fetchTagRows(r: DateRange): Promise<TagRow[]> {
  const from = previousRange(r).from
  const rows = await all<DbTagRow>((a, b) =>
    db().from('tag_daily').select('day,page_id,tag,color,count').gte('day', from).lte('day', r.to)
      .order('day').order('page_id').order('tag').range(a, b))
  return rows.map(fromDbTagRow)
}

export async function fetchLatestDay(): Promise<string | null> {
  const { data, error } = await db().from('tag_daily').select('day').order('day', { ascending: false }).limit(1)
  if (error) throw new Error(error.message)
  return data?.[0]?.day ?? null
}

export async function fetchDays(): Promise<string[]> {
  const rows = await all<{ day_from: string | null; day_to: string | null; kind: string }>((a, b) =>
    db().from('uploads').select('day_from,day_to,kind').eq('kind', 'tagStats').order('id').range(a, b))
  return [...new Set(rows.flatMap(r => (r.day_from ? [r.day_from, r.day_to ?? r.day_from] : [])))].sort()
}

const CONV_COLS = 'day,conversation_id,page_id,first_at,last_at,msg_count,first_kind,has_phone,tags,pancake_url'

export async function fetchConvs(r: DateRange): Promise<ConvRow[]> {
  const rows = await all<DbConv>((a, b) =>
    db().from('conversations').select(CONV_COLS).gte('day', r.from).lte('day', r.to)
      .order('day').order('conversation_id').range(a, b))
  return rows.map(fromDbConv)
}

// every row from a day on, so a chat that started in the range keeps the rows it got after range.to
export async function fetchConvsFrom(from: string): Promise<ConvRow[]> {
  const rows = await all<DbConv>((a, b) =>
    db().from('conversations').select(CONV_COLS).gte('day', from).order('day').order('conversation_id').range(a, b))
  return rows.map(fromDbConv)
}

export async function fetchConvsByIds(ids: string[]): Promise<ConvRow[]> {
  const out: ConvRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const rows = await all<DbConv>((a, b) =>
      db().from('conversations').select(CONV_COLS).in('conversation_id', chunk).order('day').order('conversation_id').range(a, b))
    out.push(...rows.map(fromDbConv))
  }
  return out
}

export async function fetchOrders(r: DateRange): Promise<OrderRow[]> {
  const rows = await all<DbOrder>((a, b) =>
    db().from('pancake_orders').select('order_id,day,confirmed_at,admin,source,page_id,amount,discount,cod,status,items')
      .gte('day', r.from).lte('day', r.to).order('day').order('order_id').range(a, b))
  return rows.map(fromDbOrder)
}

// the newest message day of each page, for the follow-up list
export async function fetchLatestConvs(): Promise<ConvRow[]> {
  const perPage = await Promise.all(PAGES.map(async ({ id }: { id: PageId }) => {
    const { data, error } = await db().from('conversations').select('day').eq('page_id', id)
      .order('day', { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    const day = data?.[0]?.day
    if (!day) return []
    const rows = await all<DbConv>((a, b) =>
      db().from('conversations').select(CONV_COLS).eq('page_id', id).eq('day', day).order('conversation_id').range(a, b))
    return rows.map(fromDbConv)
  }))
  return perPage.flat()
}

// segment rates only need when a close tag first appeared
export async function fetchSeen(): Promise<Seen[]> {
  const rows = await all<{ conversation_id: string; tag: string; first_day: string | null; baseline: boolean }>((a, b) =>
    db().from('conv_tag_seen').select('conversation_id,tag,first_day,baseline').in('tag', Object.values(CLOSE_TAGS))
      .order('conversation_id').range(a, b))
  return rows.map(r => ({ conversationId: r.conversation_id, tag: r.tag, firstDay: r.first_day, baseline: r.baseline }))
}

export async function fetchGroups(): Promise<{ overrides: Record<string, string>; adNames: Record<string, string> }> {
  const rows = await all<{ tag: string; grp: string | null; ad_name: string | null }>((a, b) =>
    db().from('tag_groups').select('tag,grp,ad_name').order('tag').range(a, b))
  const overrides: Record<string, string> = {}
  const adNames: Record<string, string> = {}
  for (const r of rows) {
    if (r.grp) overrides[r.tag] = r.grp
    if (r.ad_name) adNames[r.tag] = r.ad_name
  }
  return { overrides, adNames }
}

export async function fetchQuotes(): Promise<Quote[]> {
  const rows = await all<{ id: number; created_at: string; day: string; page_id: string; category: string; quote: string; note: string }>((a, b) =>
    db().from('customer_quotes').select('id,created_at,day,page_id,category,quote,note').order('id').range(a, b))
  return rows.map(r => ({
    id: r.id, createdAt: r.created_at, day: r.day, pageId: r.page_id as PageId,
    category: r.category as QuoteCategory, quote: r.quote, note: r.note,
  }))
}

export type Upload = { uploadedAt: string; kind: 'tagStats' | 'messages' | 'orders'; fileName: string; dayFrom: string | null; dayTo: string | null; pageIds: PageId[]; rows: number }

export async function fetchUploads(): Promise<Upload[]> {
  const { data, error } = await db().from('uploads').select('uploaded_at,kind,file_name,day_from,day_to,page_ids,rows')
    .order('uploaded_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    uploadedAt: r.uploaded_at, kind: r.kind, fileName: r.file_name, dayFrom: r.day_from, dayTo: r.day_to,
    pageIds: r.page_ids, rows: r.rows,
  }))
}

// every tag the database knows, for the tag-group screen
export async function fetchAllTags(): Promise<{ tag: string; color: string; total: number }[]> {
  return all<{ tag: string; color: string; total: number }>((a, b) =>
    db().from('tag_totals').select('tag,color,total').order('tag').range(a, b))
}
