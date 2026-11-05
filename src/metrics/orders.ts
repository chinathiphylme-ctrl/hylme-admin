import type { PageId } from '../config/pages'
import type { OrderRow } from '../parse/types'

export type AdminSales = { admin: string; orders: number; revenue: number; avg: number; share: number }

const live = (o: OrderRow) => !o.status.includes('ยกเลิก')

export function orderStats(orders: OrderRow[], page: PageId | 'all') {
  const xs = orders.filter(o => live(o) && (page === 'all' || o.pageId === page))
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
  }
}
