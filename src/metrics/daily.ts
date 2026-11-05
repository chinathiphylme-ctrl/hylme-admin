import { PAGES, type PageId } from '../config/pages'
import { STAGE_GROUPS, groupOf, isDateTagOf } from '../grouping/rules'
import type { TagRow } from '../parse/types'
import { daysIn, type DateRange } from './range'

export type Summary = {
  newChats: number
  closed: number
  rate: number | null
  ready: number
  pending: number
  journey: { group: string; count: number; tags: string; share: number | null }[]
  products: [string, number][]
  sources: [string, number][]
  ads: [string, number][]
}

const SOURCES: [label: string, tags: string[]][] = [
  ['ลูกค้าเก่า', ['8.ลูกค้าเก่า']],
  ['เราทักเม้น', ['10.เราทักเม้น', '10เราทักเม้น']],
  ['อื่นๆ (ทักมั่ว)', ['9.อื่นๆ .(ทักมั่ว)']],
]

const inRange = (r: DateRange) => (x: TagRow) => x.day >= r.from && x.day <= r.to
const onPage = (page: PageId | 'all') => (x: TagRow) => page === 'all' || x.pageId === page
const byCount = (a: [string, number], b: [string, number]) => b[1] - a[1]

export function rate(closed: number, newChats: number): number | null {
  return newChats ? Math.round((closed / newChats) * 1000) / 10 : null
}

export function summarize(rows: TagRow[], overrides: Record<string, string>, range: DateRange, page: PageId | 'all'): Summary {
  const sel = rows.filter(inRange(range)).filter(onPage(page))
  // a day's new chats are its own date tag only; older date tags on that day are follow-ups
  const newChats = sel.filter(x => isDateTagOf(x.tag, x.day)).reduce((s, x) => s + x.count, 0)
  const byTag = new Map<string, number>()
  for (const x of sel) byTag.set(x.tag, (byTag.get(x.tag) ?? 0) + x.count)
  const tag = (t: string) => byTag.get(t) ?? 0

  const byGroup = new Map<string, [string, number][]>()
  for (const [t, n] of byTag) {
    const g = groupOf(t, overrides)
    byGroup.set(g, [...(byGroup.get(g) ?? []), [t, n]])
  }
  const groupTotal = (g: string) => (byGroup.get(g) ?? []).reduce((s, [, n]) => s + n, 0)
  const listed = (g: string) => (byGroup.get(g) ?? []).filter(([, n]) => n > 0).sort(byCount)

  const closed = tag('ปิด')
  return {
    newChats,
    closed,
    rate: rate(closed, newChats),
    ready: tag('5.พร้อมสั่ง'),
    pending: tag('ไม่เปิดอ่าน') + tag('อ่านไม่ตอบ'),
    journey: STAGE_GROUPS.map(group => {
      const count = groupTotal(group)
      return {
        group,
        count,
        tags: (byGroup.get(group) ?? []).map(([t]) => t).join(' · '),
        share: newChats ? Math.round((count / newChats) * 100) : null,
      }
    }),
    products: listed('สินค้า'),
    sources: SOURCES.map(([label, tags]) => [label, tags.reduce((s, t) => s + tag(t), 0)]),
    ads: listed('โฆษณา'),
  }
}

export function pageCompare(rows: TagRow[], overrides: Record<string, string>, range: DateRange): (Summary & { pageId: PageId })[] {
  return PAGES.map(p => ({ ...summarize(rows, overrides, range, p.id), pageId: p.id }))
}

export function trend(rows: TagRow[], range: DateRange, page: PageId | 'all'): { day: string; newChats: number; closed: number }[] {
  return daysIn(range).map(day => {
    const s = summarize(rows, {}, { from: day, to: day }, page)
    return { day, newChats: s.newChats, closed: s.closed }
  })
}

export function stuckRanking(s: Summary): { group: string; count: number }[] {
  return s.journey
    .filter(j => j.group !== 'ปิดการขาย' && j.count > 0)
    .map(({ group, count }) => ({ group, count }))
    .sort((a, b) => b.count - a.count)
}
