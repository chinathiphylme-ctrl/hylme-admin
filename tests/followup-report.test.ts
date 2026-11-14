import { describe, expect, it } from 'vitest'
import { orderLive, report, type ReportFilter } from '../src/followup/report'
import type { FuEvent, FuLead } from '../src/followup/schedule'
import type { OrderRow } from '../src/parse/types'

const staff = [
  { id: 'u1', name: 'พี่ก้อย', role: 'admin' as const, active: true },
  { id: 'u2', name: 'นุ่น', role: 'admin' as const, active: true },
  { id: 'g', name: 'GM', role: 'gm' as const, active: true },
]
const lead = (id: string, o: Partial<FuLead> = {}): FuLead => ({
  id, name: id, product: 'EVOO 250 มล.', ownerId: 'u1', firstDay: '2026-11-10', pageId: '516356078238016',
  chatUrl: '', objection: '', notes: '', status: 'active', version: 1, createdAt: '', updatedAt: '', ...o,
})
let n = 0
const ev = (leadId: string, at: string, o: Partial<FuEvent> = {}): FuEvent => ({
  id: ++n, leadId, kind: 'round', roundNo: 1, result: 'sent', dueDay: null, note: '', orderId: null, at, by: 'g', ...o,
})
const order = (orderId: string, day: string, amount: number, status = 'ส่งแล้ว'): OrderRow => ({
  orderId, day, confirmedAt: `${day}T10:00:00+07:00`, admin: 'พี่ก้อย', source: '', pageId: null, amount, discount: 0, cod: false, status, items: [],
})

const all: ReportFilter = { from: '2026-11-01', to: '2026-11-30', ownerId: 'all', pageId: 'all', product: 'all' }

describe('GM report', () => {
  const leads = [
    lead('a'), // u1, round 1 due 11 Nov → overdue on 17th
    lead('b', { ownerId: 'u2', firstDay: '2026-11-16', product: 'GABA' }), // r1 due 17 → due
    lead('c', { status: 'won' }),
    lead('d', { ownerId: 'u2', status: 'won', product: 'GABA' }),
  ]
  const events = [
    ev('a', '2026-11-12T02:00:00Z', { kind: 'skip', result: null }),
    ev('c', '2026-11-11T02:00:00Z'),
    ev('c', '2026-11-13T02:00:00Z', { roundNo: 2, result: 'won', orderId: 'O1' }),
    // 23:30 Bangkok on 30 Nov is still in range even though UTC says 30 Nov 16:30
    ev('d', '2026-11-30T16:30:00Z', { kind: 'status', roundNo: null, result: 'won', orderId: 'O2' }),
    ev('d', '2026-12-01T02:00:00Z'), // outside range
  ]
  const links = [
    { orderId: 'O1', leadId: 'c', linkedAt: '', linkedBy: 'u1' },
    { orderId: 'O2', leadId: 'd', linkedAt: '', linkedBy: 'u2' },
    { orderId: 'O3', leadId: 'd', linkedAt: '', linkedBy: 'u2' }, // not uploaded yet
    { orderId: 'O4', leadId: 'c', linkedAt: '', linkedBy: 'u2' },
  ]
  const orders = [order('O1', '2026-11-13', 590), order('O2', '2026-11-30', 1290), order('O4', '2026-11-20', 300, 'ยกเลิก')]

  it('counts today, overdue, follow-ups, buyers and verified sales', () => {
    const r = report({ leads, events, links, orders, staff, today: '2026-11-17' }, all)
    expect(r).toMatchObject({ dueToday: 1, overdue: 1, followups: 2, skips: 1, won: 2, sales: 1880, salesOrders: 2, pending: 1, cancelled: 1, wonNoOrder: 0, followupsToday: 0 })
  })

  it('splits by owner using the lead owner, with every admin listed', () => {
    const r = report({ leads, events, links, orders, staff, today: '2026-11-17' }, all)
    expect(r.byOwner).toEqual([
      { ownerId: 'u1', name: 'พี่ก้อย', leads: 2, open: 1, overdue: 1, followups: 2, won: 1, sales: 590 },
      { ownerId: 'u2', name: 'นุ่น', leads: 2, open: 1, overdue: 0, followups: 0, won: 1, sales: 1290 },
    ])
    expect(r.byProduct.map(p => [p.product, p.leads, p.won, p.sales])).toEqual([['EVOO 250 มล.', 2, 1, 590], ['GABA', 2, 1, 1290]])
  })

  it('filters by owner, page, product and date range', () => {
    const base = { leads, events, links, orders, staff, today: '2026-11-17' }
    expect(report(base, { ...all, ownerId: 'u2' })).toMatchObject({ dueToday: 1, overdue: 0, won: 1, sales: 1290 })
    expect(report(base, { ...all, product: 'GABA' }).byOwner.map(o => o.leads)).toEqual([0, 2])
    const noOrder = report({ ...base, leads: [...leads, lead('e', { status: 'won' })] }, all)
    expect(noOrder.wonNoOrder).toBe(1)
    expect(report({ ...base, today: '2026-11-13' }, all).followupsToday).toBe(1)
    expect(report(base, { ...all, pageId: '923678677500634' })).toMatchObject({ dueToday: 0, won: 0 })
    expect(report(base, { ...all, from: '2026-11-12', to: '2026-11-12' })).toMatchObject({ followups: 0, skips: 1, won: 0, sales: 0 })
  })

  it('treats cancelled and returned orders as not sold', () => {
    expect(orderLive(order('x', '2026-11-01', 1, 'ยกเลิก'))).toBe(false)
    expect(orderLive(order('x', '2026-11-01', 1, 'ตีกลับ'))).toBe(false)
    expect(orderLive(order('x', '2026-11-01', 1, 'คืนสินค้า'))).toBe(false)
    expect(orderLive(order('x', '2026-11-01', 1, 'ส่งแล้ว'))).toBe(true)
  })
})
