import type { PageId } from '../config/pages'
import { CLOSE_TAGS } from '../grouping/rules'
import type { Seen } from '../metrics/conversations'
import type { OrderChat } from '../metrics/orderCheck'
import type { Quote, QuoteCategory } from '../metrics/quotes'
import { daysIn, previousRange, type DateRange } from '../metrics/range'
import type { ConvRow, OrderRow, TagRow } from '../parse/types'
import { db } from './client'
import { byDay, idbStore, type DayStore, type DaySigs } from './dayCache'
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

// ---- days kept in this browser (see dayCache.ts) ----

export type Sigs = { conv: DaySigs; tag: DaySigs }

// null while migration 0007 is not installed (or the call fails): everything then loads the old way
export async function fetchDaySigs(): Promise<Sigs | null> {
  const { data, error } = await db().rpc('day_sigs')
  if (error || !Array.isArray(data)) return null
  const out: Sigs = { conv: new Map(), tag: new Map() }
  for (const r of data as { kind: string; day: string; n: number; sig: string }[]) {
    if (r.kind === 'conv' || r.kind === 'tag') out[r.kind].set(r.day, { n: Number(r.n), sig: r.sig })
  }
  return out
}

// one IndexedDB store for both kinds; undefined = not opened yet, null = this browser has none
let store: DayStore<unknown> | null | undefined
const dayStore = <T>() => {
  if (store === undefined) store = idbStore<unknown>()
  return store as DayStore<T> | null
}

// a few days per request keeps the URL short
const DAYS_PER_CALL = 10
async function perDay<T extends { day: string }>(days: string[], fetch: (days: string[]) => Promise<T[]>): Promise<Map<string, T[]>> {
  const out = new Map<string, T[]>()
  for (let i = 0; i < days.length; i += DAYS_PER_CALL) {
    for (const row of await fetch(days.slice(i, i + DAYS_PER_CALL))) {
      const list = out.get(row.day)
      if (list) list.push(row)
      else out.set(row.day, [row])
    }
  }
  return out
}

const tagDays = (days: string[]) => perDay(days, async ds => (await all<DbTagRow>((a, b) =>
  db().from('tag_daily').select('day,page_id,tag,color,count').in('day', ds).order('day').order('page_id').order('tag').range(a, b)))
  .map(fromDbTagRow))

const convDays = (days: string[]) => perDay(days, async ds => (await conversationRows((cols, a, b) =>
  db().from('conversations').select(cols).in('day', ds).order('day').order('conversation_id').range(a, b).returns<DbConv[]>()))
  .map(fromDbConv))

export async function fetchTagRows(r: DateRange, sigs: Sigs | null = null): Promise<TagRow[]> {
  const from = previousRange(r).from
  if (sigs) return byDay('tag', sigs.tag, daysIn({ from, to: r.to }), dayStore<TagRow>(), tagDays)
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
  return [...new Set(rows.flatMap(r => (r.day_from ? daysIn({ from: r.day_from, to: r.day_to ?? r.day_from }) : [])))].sort()
}

const CONV_COLS = 'day,conversation_id,page_id,first_at,last_at,msg_count,first_kind,has_phone,tags,pancake_url'

// Keep the existing dashboard readable until the topics migration is installed.
async function conversationRows(query: (cols: string, from: number, to: number) => Page<DbConv>): Promise<DbConv[]> {
  let missingTopics = false
  const rows = await all<DbConv>(async (a, b) => {
    const result = await query(missingTopics ? CONV_COLS : `${CONV_COLS},topics`, a, b)
    if (result.error && /(?:column.*topics.*does not exist|could not find.*topics.*column)/i.test(result.error.message)) {
      missingTopics = true
      return await query(CONV_COLS, a, b)
    }
    return result
  })
  return rows
}

// every export row of every chat; leads need each chat's whole history (about 3,000 rows on 18/11/2026).
// With fingerprints, only new or changed days are downloaded; the rest come from this browser.
export async function fetchAllConvs(sigs: Sigs | null = null): Promise<ConvRow[]> {
  if (sigs) return byDay('conv', sigs.conv, [...sigs.conv.keys()], dayStore<ConvRow>(), convDays, { prune: true })
  const rows = await conversationRows((cols, a, b) =>
    db().from('conversations').select(cols).order('day').order('conversation_id').range(a, b).returns<DbConv[]>())
  return rows.map(fromDbConv)
}

export async function fetchOrders(r: DateRange): Promise<OrderRow[]> {
  const rows = await all<DbOrder>((a, b) =>
    db().from('pancake_orders').select('order_id,day,confirmed_at,admin,source,page_id,amount,discount,cod,status,items')
      .gte('day', r.from).lte('day', r.to).order('day').order('order_id').range(a, b))
  return rows.map(fromDbOrder)
}

// a missing table means migration 0010 isn't installed yet: the card then shows no pairs instead of failing
const missingTable = (m: string) => /relation .* does not exist|could not find the table/i.test(m)

// which chat each order came from (hourly Pancake sync), for orders confirmed between from and to
export async function fetchOrderChats(from: string, to: string): Promise<OrderChat[]> {
  try {
    const rows = await all<{ order_id: string; conversation_id: string; page_id: string | null; day: string }>((a, b) =>
      db().from('order_chats').select('order_id,conversation_id,page_id,day').gte('day', from).lte('day', to)
        .order('order_id').range(a, b))
    return rows.map(r => ({ orderId: r.order_id, conversationId: r.conversation_id, pageId: r.page_id, day: r.day }))
  } catch (e) {
    if (missingTable((e as Error).message)) return []
    throw e
  }
}

// when the sync last sent pairs, or null if it never has
export async function fetchOrderChatSync(): Promise<string | null> {
  const { data, error } = await db().from('order_chat_sync').select('at').limit(1)
  if (error) {
    if (missingTable(error.message)) return null
    throw new Error(error.message)
  }
  return (data?.[0] as { at: string } | undefined)?.at ?? null
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
