import { describe, expect, it } from 'vitest'
import type { Seen } from '../src/metrics/conversations'
import { orderCheck, type OrderChat } from '../src/metrics/orderCheck'
import type { ConvRow, OrderRow } from '../src/parse/types'

const FB = '100379779472465'
const DAY = '2026-11-26'

const conv = (conversationId: string, tags: string[], day = DAY): ConvRow => ({
  day, conversationId, pageId: FB, firstAt: `${day}T10:00:00+07:00`, lastAt: `${day}T12:00:00+07:00`, msgCount: 2,
  firstKind: 'typed', hasPhone: false, tags, topics: [], pancakeUrl: `https://pancake.vn/x/${conversationId}`,
})
const order = (orderId: string, o: Partial<OrderRow> = {}): OrderRow => ({
  orderId, day: DAY, confirmedAt: `${DAY}T10:00:00+07:00`, admin: 'พี่ก้อย', source: '', pageId: FB, amount: 100, discount: 0,
  cod: false, status: 'ยืนยันแล้ว', items: [], ...o,
})
const pair = (orderId: string, conversationId: string, day = DAY): OrderChat => ({ orderId, conversationId, pageId: FB, day })
const seen = (conversationId: string, firstDay: string | null, tag = 'ปิด'): Seen => ({ conversationId, tag, firstDay, baseline: firstDay === null })

const orders = [
  order('A'), order('B'), order('C'), order('D', { status: 'ยกเลิก' }), order('E', { pageId: null }), order('F'),
  order('G', { day: '2026-11-25' }),
]
const pairs = [
  pair('A', 'a'), pair('B', 'b'), pair('D', 'a'), pair('F', 'z'), pair('L', 'ln_1'), pair('X', 'c', '2026-11-29'),
  pair('Y', 'd', '2026-12-05'),
]
const convs = [
  conv('a', ['พี่ก้อย'], '2026-11-25'), conv('a', ['พี่ก้อย', 'ปิดAds']),
  conv('b', ['2.ขอราคา']),
  conv('c', ['ปิด']), conv('d', ['ปิด']), conv('e', ['ปิด']),
]
const seens = [seen('a', DAY, 'ปิดAds'), seen('c', DAY), seen('d', DAY), seen('e', '2026-11-20')]

describe('orderCheck', () => {
  const r = orderCheck(DAY, '2026-11-27', orders, pairs, convs, seens)

  it('counts live chat-page orders of the day and how they match', () => {
    expect(r).toMatchObject({ hasOrders: true, orders: 4, matched: 2, closed: 1, line: 1, windowOpen: true })
  })
  it('lists matched chats without a close tag, using the latest row', () => {
    expect(r.notClosed.map(x => [x.orderId, x.conv.conversationId])).toEqual([['B', 'b']])
  })
  it('puts orders with no pair or no chat row under noChat; cancelled orders are left out', () => {
    expect(r.noChat).toEqual(['C', 'F'])
  })
  it('lists chats closed that day with no paired order within 3 days; old close tags are left out', () => {
    expect(r.closedNoOrder.map(c => c.conversationId)).toEqual(['d'])
  })
  it('closes the window 3 days after the day, and says when the day has no orders', () => {
    expect(orderCheck(DAY, '2026-11-29', orders, pairs, convs, seens).windowOpen).toBe(false)
    expect(orderCheck('2026-11-24', '2026-11-29', orders, pairs, convs, seens)).toMatchObject({ hasOrders: false, orders: 0 })
  })
})
