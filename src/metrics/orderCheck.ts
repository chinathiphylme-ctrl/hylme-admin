import { orderLive } from '../followup/report'
import { isCloseTag } from '../grouping/rules'
import type { ConvRow, OrderRow } from '../parse/types'
import type { Seen } from './conversations'
import { addDays } from './range'

// which chat a Pancake order came from, sent by the hourly order sync (no customer data)
export type OrderChat = { orderId: string; conversationId: string; pageId: string | null; day: string }

export type OrderCheck = {
  hasOrders: boolean
  orders: number
  matched: number
  closed: number
  notClosed: { orderId: string; conv: ConvRow }[]
  noChat: string[]
  line: number
  closedNoOrder: ConvRow[]
  windowOpen: boolean
}

// an order may be confirmed a few days after the customer agreed, so a close tag looks for an order this many days around it
export const ORDER_WINDOW_DAYS = 3

// for one day: live chat-page orders of that day and whether their chats carry a close tag (the chat's latest tags),
// and chats whose close tag first showed up that day with no order paired to them
export function orderCheck(day: string, today: string, orders: OrderRow[], pairs: OrderChat[], convs: ConvRow[], seen: Seen[]): OrderCheck {
  const latest = new Map<string, ConvRow>()
  for (const c of convs) {
    const prev = latest.get(c.conversationId)
    if (!prev || c.day > prev.day) latest.set(c.conversationId, c)
  }
  const pairOf = new Map(pairs.map(p => [p.orderId, p]))
  const ofDay = orders.filter(o => o.day === day)
  const pageOrders = ofDay.filter(o => o.pageId !== null && orderLive(o))

  const notClosed: OrderCheck['notClosed'] = []
  const noChat: string[] = []
  let closed = 0
  for (const o of pageOrders) {
    const p = pairOf.get(o.orderId)
    const c = p && latest.get(p.conversationId)
    if (!c) noChat.push(o.orderId)
    else if (c.tags.some(isCloseTag)) closed++
    else notClosed.push({ orderId: o.orderId, conv: c })
  }

  const from = addDays(day, -ORDER_WINDOW_DAYS), to = addDays(day, ORDER_WINDOW_DAYS)
  const paired = new Set(pairs.filter(p => p.day >= from && p.day <= to).map(p => p.conversationId))
  const closedToday = new Set(seen.filter(s => s.firstDay === day && isCloseTag(s.tag)).map(s => s.conversationId))
  const closedNoOrder = convs.filter(c => c.day === day && closedToday.has(c.conversationId) && !paired.has(c.conversationId))

  return {
    hasOrders: ofDay.length > 0,
    orders: pageOrders.length,
    matched: closed + notClosed.length,
    closed,
    notClosed,
    noChat,
    line: pairs.filter(p => p.day === day && p.conversationId.startsWith('ln_')).length,
    closedNoOrder,
    windowOpen: to > today,
  }
}
