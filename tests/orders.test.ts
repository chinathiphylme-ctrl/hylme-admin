import { describe, expect, it } from 'vitest'
import { detectKind } from '../src/parse/detect'
import { orderTime, parseOrders, productName } from '../src/parse/orders'
import { orderStats } from '../src/metrics/orders'
import type { Sheet } from '../src/parse/types'
import { planUpload } from '../src/ui/uploadPlan'

const FB = '100379779472465'
const FAT = '516356078238016'

// a subset of the 47 Pancake order columns, including the personal ones that must be ignored
const COLS = ['รหัสคำสั่งซื้อ', 'เวลายืนยันการสั่งซื้อ', 'เบอร์โทรลูกค้า', 'ชื่อ', 'มูลค่าคำสั่งซื้อหลังหักส่วนลด', 'ส่วนลด', 'COD',
  'จำนวน', 'รหัสสินค้า', 'สินค้า', 'แหล่งที่มาของคำสั่งซื้อ', 'พนักงานยืนยัน', 'เวลาสร้างคำสั่งซื้อ', 'ที่อยู่', 'สถานะ', 'Chat page']

const row = (o: Record<string, unknown>) => COLS.map(c => o[c] ?? null)
const order = (id: string | null, extra: Record<string, unknown> = {}) => row({
  'รหัสคำสั่งซื้อ': id, 'เวลายืนยันการสั่งซื้อ': '15:45 03/11/2026', 'เบอร์โทรลูกค้า': '0811111111', 'ชื่อ': 'ลูกค้าทดสอบ',
  'มูลค่าคำสั่งซื้อหลังหักส่วนลด': 1290, 'ส่วนลด': 670, 'COD': 1290, 'จำนวน': 4, 'รหัสสินค้า': 'HM-DOB-01',
  'สินค้า': '(จ่ายชิ้น) Hylme Daily Oils Blend 60 Softgel', 'แหล่งที่มาของคำสั่งซื้อ': `Facebook / Hylme (${FB})`,
  'พนักงานยืนยัน': 'kanpriyanaka Noon', 'เวลาสร้างคำสั่งซื้อ': '15:44 03/11/2026', 'ที่อยู่': '1 ถนนทดสอบ', 'สถานะ': 'ยืนยันแล้ว',
  ...extra,
})
const sheets = (rows: unknown[][]): Sheet[] => [{ name: 'sheet', rows: [COLS, ...rows] }]
const parse = (rows: unknown[][]) => {
  const r = parseOrders(sheets(rows), 'orders_0311.xlsx')
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('parseOrders', () => {
  it('is detected as an order file', () => {
    expect(detectKind(sheets([order('1')]))).toBe('orders')
  })

  it('reads one order per id with nickname, page and amounts, and no personal data', () => {
    const r = parse([order('10541')])
    expect(r.orders).toEqual([{
      orderId: '10541', day: '2026-11-03', confirmedAt: '2026-11-03T15:45:00+07:00', admin: 'นุ่น',
      source: 'Facebook / Hylme', pageId: FB, amount: 1290, discount: 670, cod: true, status: 'ยืนยันแล้ว',
      items: [{ sku: 'HM-DOB-01', name: 'Daily Oils Blend 60 Softgel', qty: 4 }],
    }])
    const saved = JSON.stringify(r.orders)
    for (const pii of ['0811111111', 'ลูกค้าทดสอบ', 'ถนนทดสอบ', 'kanpriyanaka']) expect(saved).not.toContain(pii)
    expect(r.days).toEqual(['2026-11-03'])
    expect(r.pageIds).toEqual([FB])
  })

  it('adds product rows without an order id to the order above', () => {
    const r = parse([
      order('1', { 'แหล่งที่มาของคำสั่งซื้อ': `Facebook / Hylme ครบจบเรื่องไขมัน (${FAT})`, 'พนักงานยืนยัน': 'จิตรานนท์ ชิตานุช' }),
      row({ 'รหัสสินค้า': 'HM-OL-01', 'สินค้า': 'Hylme Organic Extra Virgin Olive Oil', 'จำนวน': 2 }),
      order('2', { 'COD': 0, 'แหล่งที่มาของคำสั่งซื้อ': 'Telesales', 'พนักงานยืนยัน': 'ใครสักคน' }),
    ])
    expect(r.orders.map(o => [o.orderId, o.admin, o.pageId, o.source, o.cod, o.items.length])).toEqual([
      ['1', 'พี่ก้อย', FAT, 'Facebook / Hylme ครบจบเรื่องไขมัน', true, 2],
      ['2', 'ใครสักคน', null, 'Telesales', false, 1],
    ])
    expect(r.orders[0].items[1]).toEqual({ sku: 'HM-OL-01', name: 'Organic Extra Virgin Olive Oil', qty: 2 })
  })

  it('merges a repeated order number into one order', () => {
    const r = parse([order('7'), order('7', { 'รหัสสินค้า': 'HM-OL-01', 'จำนวน': 1 })])
    expect(r.orders).toHaveLength(1)
    expect(r.orders[0].items.map(i => i.sku)).toEqual(['HM-DOB-01', 'HM-OL-01'])
  })

  it('falls back to the created time and fails on a file with no orders', () => {
    expect(parse([order('1', { 'เวลายืนยันการสั่งซื้อ': '' })]).orders[0].confirmedAt).toBe('2026-11-03T15:44:00+07:00')
    expect(parseOrders(sheets([]), 'x.xlsx').ok).toBe(false)
  })

  it('parses Pancake time and product names', () => {
    expect(orderTime('08:12 03/11/2026')).toBe('2026-11-03T08:12:00+07:00')
    expect(orderTime('03/11/2026 08:12:00')).toBe('2026-11-03T08:12:00+07:00')
    expect(productName('(จ่ายชิ้น)  Hylme   Gluta Collagen')).toBe('Gluta Collagen')
  })
})

describe('orderStats', () => {
  const r = parse([
    order('1', { 'มูลค่าคำสั่งซื้อหลังหักส่วนลด': 1000 }),
    order('2', { 'มูลค่าคำสั่งซื้อหลังหักส่วนลด': 500, 'พนักงานยืนยัน': 'จิตรานนท์ ชิตานุช', 'แหล่งที่มาของคำสั่งซื้อ': `Facebook / Hylme ครบจบเรื่องไขมัน (${FAT})` }),
    order('3', { 'มูลค่าคำสั่งซื้อหลังหักส่วนลด': 2000, 'สถานะ': 'ยกเลิก' }),
  ])

  it('sums sales per admin without cancelled orders', () => {
    const s = orderStats(r.orders, 'all')
    expect([s.count, s.revenue, s.avg]).toEqual([2, 1500, 750])
    expect(s.admins).toEqual([
      { admin: 'นุ่น', orders: 1, revenue: 1000, avg: 1000, share: 66.7 },
      { admin: 'พี่ก้อย', orders: 1, revenue: 500, avg: 500, share: 33.3 },
    ])
    expect(s.products).toEqual([['Daily Oils Blend 60 Softgel', 8]])
  })

  it('filters by page', () => {
    expect(orderStats(r.orders, FAT).admins.map(a => a.admin)).toEqual(['พี่ก้อย'])
  })

  it('summarises an order file for upload', () => {
    expect(planUpload([r], new Set(), {}).files[0]).toEqual(
      { fileName: 'orders_0311.xlsx', kind: 'orders', summary: 'ออเดอร์ · 3 พ.ย. · 3 ออเดอร์ · ยอด ฿3,500' })
  })
})
