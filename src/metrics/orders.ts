import { isPageId, type PageId } from '../config/pages'
import { EXCLUDED_SALES_ADMINS } from '../config/admins'
import type { OrderRow } from '../parse/types'

export type AdminSales = { admin: string; orders: number; revenue: number; avg: number; share: number }
export type OtherChannels = { count: number; revenue: number; bySource: { source: string; orders: number; revenue: number }[] }

const live = (o: OrderRow) => !o.status.includes('ยกเลิก')

export function orderStats(orders: OrderRow[], page: PageId | 'all') {
  const kept = orders.filter(o => live(o) && !EXCLUDED_SALES_ADMINS.has(o.admin.trim().toLowerCase()))
  // the admin report is about chat work: only orders from the Facebook/IG pages count; Telesales, CRM and Line
  // orders carry no page and are shown apart so their money is not lost (team decision 17 Nov 2026)
  const xs = kept.filter(o => o.pageId !== null && isPageId(o.pageId) && (page === 'all' || o.pageId === page))
  const others = page === 'all' ? kept.filter(o => o.pageId === null || !isPageId(o.pageId)) : []
  const bySource = new Map<string, { orders: number; revenue: number }>()
  for (const o of others) {
    const b = bySource.get(o.source || 'ไม่ระบุ') ?? { orders: 0, revenue: 0 }
    b.orders++
    b.revenue += o.amount
    bySource.set(o.source || 'ไม่ระบุ', b)
  }
  const other: OtherChannels = {
    count: others.length,
    revenue: others.reduce((t, o) => t + o.amount, 0),
    bySource: [...bySource].map(([source, b]) => ({ source, ...b })).sort((a, b) => b.revenue - a.revenue),
  }
  const revenue = xs.reduce((s, o) => s + o.amount, 0)
  const byAdmin = new Map<string, { orders: number; revenue: number }>()
  const products = new Map<string, number>()
  const sources = new Map<string, number>()
  for (const o of xs) {
    const a = byAdmin.get(o.admin) ?? { orders: 0, revenue: 0 }
    a.orders++
    a.revenue += o.amount
    byAdmin.set(o.admin, a)
    for (const it of o.items) products.set(it.name || it.sku, (products.get(it.name || it.sku) ?? 0) + it.qty)
    const src = o.source || 'ไม่ระบุ'
    sources.set(src, (sources.get(src) ?? 0) + 1)
  }
  const admins: AdminSales[] = [...byAdmin].map(([admin, a]) => ({
    admin, orders: a.orders, revenue: a.revenue,
    avg: Math.round(a.revenue / a.orders),
    share: revenue ? Math.round((a.revenue / revenue) * 1000) / 10 : 0,
  })).sort((a, b) => b.revenue - a.revenue)
  const desc = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])
  return {
    count: xs.length,
    revenue,
    avg: xs.length ? Math.round(revenue / xs.length) : null,
    cod: xs.filter(o => o.cod).length,
    admins,
    products: desc(products),
    sources: desc(sources),
    other,
  }
}
