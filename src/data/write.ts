import type { ConvRow, OrderRow, TagRow } from '../parse/types'
import { db } from './client'
import { toDbConv, toDbOrder, toDbTagRow } from './mappers'

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  // RPC errors carry the Postgres message, which is already Thai
  if (error) throw new Error(error.message)
  return data as T
}

export const checkCode = (code: string) => rpc<boolean>('check_code', { p_code: code })

export const saveTagStats = (code: string, fileName: string, rows: TagRow[]) =>
  rpc<number>('save_tag_stats', { p_code: code, p_file: fileName, p_rows: rows.map(toDbTagRow) })

export const saveMessages = (code: string, fileName: string, convs: ConvRow[]) =>
  rpc<number>('save_messages', { p_code: code, p_file: fileName, p_convs: convs.map(toDbConv) })

export const saveTagGroup = (code: string, tag: string, grp: string, adName: string) =>
  rpc<void>('set_tag_group', { p_code: code, p_tag: tag, p_grp: grp, p_ad_name: adName })

export const saveOrders = (code: string, fileName: string, orders: OrderRow[]) =>
  rpc<number>('save_orders', { p_code: code, p_file: fileName, p_orders: orders.map(toDbOrder) })

export const addQuote = (code: string, q: { day: string; pageId: string; category: string; quote: string; note: string }) =>
  rpc<number>('add_quote', { p_code: code, p_day: q.day, p_page: q.pageId, p_category: q.category, p_quote: q.quote, p_note: q.note })

export const deleteQuote = (code: string, id: number) => rpc<void>('delete_quote', { p_code: code, p_id: id })
