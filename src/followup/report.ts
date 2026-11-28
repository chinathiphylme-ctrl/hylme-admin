import type { PageId } from '../config/pages'
import type { OrderRow } from '../parse/types'
import { bangkokToday, groupEvents, isOpen, stateOf, type FuEvent, type FuLead } from './schedule'

export type Role = 'admin' | 'gm'
export type Staff = { id: string; name: string; role: Role; active: boolean }
export type OrderLink = { orderId: string; leadId: string; linkedAt: string; linkedBy: string | null }
export type ReportFilter = { from: string; to: string; ownerId: string | 'all'; pageId: PageId | 'all'; product: string | 'all' }

export type OwnerRow = { ownerId: string; name: string; leads: number; open: number; overdue: number; followups: number; won: number; sales: number }
export type ProductRow = { product: string; leads: number; followups: number; won: number; sales: number }
// follow-ups saved on one Bangkok day; rounds[0] = round 1 … rounds[6] = round 7
export type DayRounds = { day: string; rounds: number[]; total: number }

// the same rule as the daily sales report, plus returns: a cancelled or returned order is not a sale
export const orderLive = (o: OrderRow) => !/ยกเลิก|คืน|ตีกลับ/.test(o.status)

const eventDay = (e: FuEvent) => bangkokToday(new Date(e.at))
const isWin = (e: FuEvent) => e.result === 'won'

export function report(
  input: { leads: FuLead[]; events: FuEvent[]; links: OrderLink[]; orders: OrderRow[]; staff: Staff[]; today: string },
  f: ReportFilter,
) {
  const { today } = input
  const leads = input.leads.filter(l =>
    (f.ownerId === 'all' || l.ownerId === f.ownerId) && (f.pageId === 'all' || l.pageId === f.pageId) && (f.product === 'all' || l.product === f.product))
  const ids = new Set(leads.map(l => l.id))
  const byLead = groupEvents(input.events.filter(e => ids.has(e.leadId)))
  const inRange = (day: string) => day >= f.from && day <= f.to
  const orderById = new Map(input.orders.map(o => [o.orderId, o]))

  type Acc = { leads: number; open: number; overdue: number; followups: number; won: number; sales: number }
  const blank = (): Acc => ({ leads: 0, open: 0, overdue: 0, followups: 0, won: 0, sales: 0 })
  const owners = new Map<string, Acc>()
  const products = new Map<string, Acc>()
  const days = new Map<string, DayRounds>()
  const total = { dueToday: 0, overdue: 0, followups: 0, skips: 0, won: 0, sales: 0, salesOrders: 0, pending: 0, cancelled: 0, wonNoOrder: 0, followupsToday: 0 }

  for (const l of leads) {
    const evs = byLead.get(l.id) ?? []
    const st = stateOf(l, evs, today)
    const ranged = evs.filter(e => inRange(eventDay(e)))
    const rounds = ranged.filter(e => e.kind === 'round')
    const followups = rounds.length
    for (const e of rounds) {
      const d = eventDay(e)
      const row = days.get(d) ?? { day: d, rounds: [0, 0, 0, 0, 0, 0, 0], total: 0 }
      if (e.roundNo !== null && e.roundNo >= 1 && e.roundNo <= 7) row.rounds[e.roundNo - 1]++
      row.total++
      days.set(d, row)
    }
    const won = ranged.some(isWin) ? 1 : 0
    let sales = 0
    const myLinks = input.links.filter(k => k.leadId === l.id)
    if (l.status === 'won' && myLinks.length === 0) total.wonNoOrder++
    total.followupsToday += evs.filter(e => e.kind === 'round' && eventDay(e) === today).length
    for (const link of myLinks) {
      const o = orderById.get(link.orderId)
      if (!o) { total.pending++; continue }
      if (!inRange(o.day)) continue
      if (!orderLive(o)) { total.cancelled++; continue }
      sales += o.amount
      total.salesOrders++
    }
    if (st === 'due') total.dueToday++
    if (st === 'overdue') total.overdue++
    total.followups += followups
    // skips the sync made for a chat that entered late are nobody's work
    total.skips += ranged.filter(e => e.kind === 'skip' && e.by !== null).length
    total.won += won
    total.sales += sales
    for (const [map, key] of [[owners, l.ownerId], [products, l.product]] as const) {
      const a = map.get(key) ?? blank()
      a.leads++
      if (isOpen(st)) a.open++
      if (st === 'overdue') a.overdue++
      a.followups += followups
      a.won += won
      a.sales += sales
      map.set(key, a)
    }
  }

  // every active admin is listed even with nothing to show, so a quiet week is visible
  const listed = input.staff.filter(s => (s.role === 'admin' && s.active) || owners.has(s.id))
  const byOwner: OwnerRow[] = listed
    .filter(s => f.ownerId === 'all' || s.id === f.ownerId)
    .map(s => {
      const a = owners.get(s.id) ?? blank()
      return { ownerId: s.id, name: s.name, leads: a.leads, open: a.open, overdue: a.overdue, followups: a.followups, won: a.won, sales: a.sales }
    })
  const byProduct: ProductRow[] = [...products]
    .map(([product, a]) => ({ product, leads: a.leads, followups: a.followups, won: a.won, sales: a.sales }))
    .sort((a, b) => b.leads - a.leads || a.product.localeCompare(b.product, 'th'))

  const byDay = [...days.values()].sort((a, b) => b.day.localeCompare(a.day))

  return { ...total, leads: leads.length, byOwner, byProduct, byDay }
}

export type Report = ReturnType<typeof report>
