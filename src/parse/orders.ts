import { adminOf } from '../config/admins'
import { isPageId, type PageId } from '../config/pages'
import { isOrderHeader, ORDER_ID_COL, ORDER_STAFF_COL } from './detect'
import { toBangkokIso } from './messages'
import type { OrderItem, OrderRow, OrdersResult, Sheet } from './types'

export const ERR_NO_ORDERS = 'ไม่พบออเดอร์ในไฟล์นี้'

const COL = {
  id: ORDER_ID_COL,
  confirmed: 'เวลายืนยันการสั่งซื้อ',
  created: 'เวลาสร้างคำสั่งซื้อ',
  staff: ORDER_STAFF_COL,
  source: 'แหล่งที่มาของคำสั่งซื้อ',
  amount: 'มูลค่าคำสั่งซื้อหลังหักส่วนลด',
  discount: 'ส่วนลด',
  cod: 'COD',
  status: 'สถานะ',
  sku: 'รหัสสินค้า',
  product: 'สินค้า',
  qty: 'จำนวน',
}

const pad = (n: number) => String(n).padStart(2, '0')
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
const text = (v: unknown) => String(v ?? '').trim()

// Pancake writes order times as `hh:mm dd/mm/yyyy`; also accept the message-file order or an Excel serial
export function orderTime(v: unknown): string | null {
  const m = text(v).match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[5]}-${pad(+m[4])}-${pad(+m[3])}T${pad(+m[1])}:${m[2]}:00+07:00`
  return toBangkokIso(v)
}

// "Facebook / Hylme ครบจบเรื่องไขมัน (516356078238016)" → page id + "Facebook / Hylme ครบจบเรื่องไขมัน"
function sourceOf(v: unknown): { source: string; pageId: PageId | null } {
  const s = text(v)
  const m = s.match(/^(.*?)\s*\(([^()]+)\)$/)
  if (m && isPageId(m[2])) return { source: m[1], pageId: m[2] }
  return { source: m ? m[1] : s, pageId: null }
}

// "(จ่ายชิ้น) Hylme Daily Oils Blend 60 Softgel" → "Daily Oils Blend 60 Softgel"
export const productName = (v: unknown) => text(v).replace(/^\([^)]*\)\s*/, '').replace(/^Hylme\s+/i, '').replace(/\s+/g, ' ')

export function parseOrders(sheets: Sheet[], fileName: string): OrdersResult {
  const orders: OrderRow[] = []
  for (const s of sheets) {
    const h = s.rows.findIndex(isOrderHeader)
    if (h < 0) continue
    const idx = Object.fromEntries(Object.entries(COL).map(([k, name]) => [k, s.rows[h].indexOf(name)])) as Record<keyof typeof COL, number>
    const at = (r: unknown[], k: keyof typeof COL) => (idx[k] < 0 ? null : r[idx[k]])
    let current: OrderRow | null = null
    for (const r of s.rows.slice(h + 1)) {
      const item: OrderItem | null = text(at(r, 'sku')) || text(at(r, 'product'))
        ? { sku: text(at(r, 'sku')), name: productName(at(r, 'product')), qty: num(at(r, 'qty')) }
        : null
      const id = text(at(r, 'id'))
      // extra products of the same order come on rows with no order id
      // a repeated order number is another product line of an order already read
      const seen = id ? orders.find(o => o.orderId === id) : undefined
      if (!id || seen) {
        current = seen ?? current
        if (current && item) current.items.push(item)
        continue
      }
      const when = orderTime(at(r, 'confirmed')) ?? orderTime(at(r, 'created'))
      if (!when) { current = null; continue }
      // customer name, phone and address columns are never read
      current = {
        orderId: id,
        day: when.slice(0, 10),
        confirmedAt: when,
        admin: adminOf(at(r, 'staff')),
        ...sourceOf(at(r, 'source')),
        amount: num(at(r, 'amount')),
        discount: num(at(r, 'discount')),
        cod: num(at(r, 'cod')) > 0,
        status: text(at(r, 'status')),
        items: item ? [item] : [],
      }
      orders.push(current)
    }
  }
  if (!orders.length) return { ok: false, fileName, error: ERR_NO_ORDERS }
  return {
    ok: true,
    fileName,
    orders,
    days: [...new Set(orders.map(o => o.day))].sort(),
    pageIds: [...new Set(orders.flatMap(o => (o.pageId ? [o.pageId] : [])))],
  }
}
