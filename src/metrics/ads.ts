import type { PageId } from '../config/pages'
import { gradeOf, type Lead } from './leads'

export const MIN_CHATS = 15

// Wilson score interval for k successes in n trials; z = 1.645 is a two-sided 90% interval
export function wilson(k: number, n: number, z = 1.645): [lo: number, hi: number] {
  if (!n) return [0, 1]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]
}

export type Verdict = 'ดี' | 'ไม่ดี' | 'กลางๆ' | 'ข้อมูลยังน้อย'
export const VERDICTS: Verdict[] = ['ดี', 'ไม่ดี', 'กลางๆ', 'ข้อมูลยังน้อย']

export type AdScore = {
  rank: number | null
  tag: string; name: string | null; chats: number; good: number; closed: number; rate: number
  verdict: Verdict; pages: PageId[]; firstDay: string; lastDay: string; shortId: boolean
}

const pct = (k: number, n: number) => Math.round((k / n) * 1000) / 10

export function adScores(leads: Lead[], adNames: Record<string, string>, page: PageId | 'all'):
  { avg: number | null; adChats: number; ads: AdScore[] } {
  const sel = leads.filter(l => l.isNew && l.ads.length && (page === 'all' || l.pageId === page))
  if (!sel.length) return { avg: null, adChats: 0, ads: [] }
  // the average is over chats, so a chat with two ad tags counts once here and once for each ad below
  const p = sel.filter(l => l.closed).length / sel.length

  const byAd = new Map<string, Lead[]>()
  for (const l of sel) for (const a of l.ads) byAd.set(a, [...(byAd.get(a) ?? []), l])
  const ads = [...byAd].map(([tag, xs]): AdScore => {
    const closed = xs.filter(l => l.closed).length
    const [lo, hi] = wilson(closed, xs.length)
    const verdict: Verdict = xs.length < MIN_CHATS ? 'ข้อมูลยังน้อย' : lo > p ? 'ดี' : hi < p ? 'ไม่ดี' : 'กลางๆ'
    return {
      rank: null,
      tag,
      name: adNames[tag] ?? null,
      chats: xs.length,
      good: xs.filter(l => gradeOf(l) === 'A' || gradeOf(l) === 'B').length,
      closed,
      rate: pct(closed, xs.length),
      verdict,
      pages: [...new Set(xs.map(l => l.pageId))],
      firstDay: xs.reduce((m, l) => (l.startDay < m ? l.startDay : m), xs[0].startDay),
      lastDay: xs.reduce((m, l) => (l.lastDay > m ? l.lastDay : m), xs[0].lastDay),
      shortId: tag.length < 15,
    }
  })
  ads.sort((a, b) => Number(a.chats < MIN_CHATS) - Number(b.chats < MIN_CHATS)
    || (a.chats >= MIN_CHATS && b.chats >= MIN_CHATS ? wilson(b.closed, b.chats)[0] - wilson(a.closed, a.chats)[0] : 0)
    || b.chats - a.chats || a.tag.localeCompare(b.tag))
  ads.forEach((a, i) => { if (a.chats >= MIN_CHATS) a.rank = i + 1 })
  return { avg: pct(p * sel.length, sel.length), adChats: sel.length, ads }
}
