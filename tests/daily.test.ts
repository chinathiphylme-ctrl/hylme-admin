import { describe, expect, it } from 'vitest'
import { pageCompare, stuckRanking, summarize, trend, type Summary } from '../src/metrics/daily'
import { DAY29, tagRows } from './fixtures/day29'

const FB = '100379779472465'
const FAT = '516356078238016'
const IG = 'igo_17841457670184062'
const D29 = { from: '2026-10-29', to: '2026-10-29' }
const rows = tagRows('2026-10-29', DAY29)

function numbers(x: unknown): number[] {
  if (typeof x === 'number') return [x]
  if (x && typeof x === 'object') return Object.values(x).flatMap(numbers)
  return []
}

describe('summarize', () => {
  it('clamps negative net source tags at zero', () => {
    const negative = { day: D29.from, pageId: FB as '100379779472465', tag: '9.อื่นๆ .(ทักมั่ว)', color: '', count: -9 }
    expect(summarize([negative], {}, D29, 'all').sources).toContainEqual(['อื่นๆ (ทักมั่ว)', 0])
  })
  it('matches the verified 29 ต.ค. totals for all pages', () => {
    const s = summarize(rows, {}, D29, 'all')
    expect([s.newChats, s.closed, s.rate, s.ready, s.pending]).toEqual([188, 27, 14.4, 28, 174])
    expect(s.journey.map(j => j.count)).toEqual([74, 95, 1, 28, 27, 6, 174, 25])
    expect(s.journey[0].share).toBe(39)
  })

  it('matches FB and ไขมัน', () => {
    const fb = summarize(rows, {}, D29, FB)
    expect([fb.newChats, fb.closed, fb.rate]).toEqual([118, 8, 6.8])
    const fat = summarize(rows, {}, D29, FAT)
    expect([fat.newChats, fat.closed, fat.rate]).toEqual([70, 19, 27.1])
  })

  it('gives null rates and no NaN for an empty page', () => {
    const s: Summary = summarize(rows, {}, D29, IG)
    expect(s.rate).toBeNull()
    expect(s.journey.every(j => j.share === null)).toBe(true)
    for (const n of numbers(s)) {
      expect(Number.isNaN(n)).toBe(false)
      expect(Number.isFinite(n)).toBe(true)
    }
  })

  it('counts only the matching date tag as new on each day', () => {
    const two = [
      ...tagRows('2026-10-28', { [FB]: { '28/10': 10, 'ปิด': 2 } }),
      ...tagRows('2026-10-29', { [FB]: { '29/10': 20, '28/10': 7, 'ปิด': 3 } }),
    ]
    const s = summarize(two, {}, { from: '2026-10-28', to: '2026-10-29' }, 'all')
    expect(s.newChats).toBe(30)
    expect(s.closed).toBe(5)
    expect(trend(two, { from: '2026-10-28', to: '2026-10-30' }, FB)).toEqual([
      { day: '2026-10-28', newChats: 10, closed: 2 },
      { day: '2026-10-29', newChats: 20, closed: 3 },
      { day: '2026-10-30', newChats: 0, closed: 0 },
    ])
  })

  it('lists products, sources and ads', () => {
    const extra = [...rows, ...tagRows('2026-10-29', { [FB]: { '120250984880940': 4 } })]
    const s = summarize(extra, {}, D29, 'all')
    expect(s.products[0]).toEqual(['มะกอก', 193])
    expect(s.sources).toEqual([['ลูกค้าเก่า', 39], ['เราทักเม้น', 14], ['อื่นๆ (ทักมั่ว)', 7]])
    expect(s.ads).toEqual([['120250984880940', 4]])
  })

  it('applies group overrides', () => {
    const s = summarize(rows, { 'ไม่สนใจ': 'อื่นๆ' }, D29, 'all')
    expect(s.journey[7].count).toBe(23)
  })
})

describe('pageCompare and stuckRanking', () => {
  it('returns one summary per page', () => {
    const p = pageCompare(rows, {}, D29)
    expect(p.map(x => x.pageId)).toEqual([FB, FAT, '923678677500634', IG])
    expect(p[1].closed).toBe(19)
  })
  it('ranks stuck points without closed sales', () => {
    const r = stuckRanking(summarize(rows, {}, D29, 'all'))
    expect(r[0]).toEqual({ group: 'เงียบหาย', count: 174 })
    expect(r.find(x => x.group === 'ปิดการขาย')).toBeUndefined()
  })
})

describe('closes split into ปิด, ปิดAds and ปิดOrganic', () => {
  const FIT = '923678677500634'
  const NOV = [
    ...tagRows('2026-11-08', { [FB]: { '8/11': 38, 'ปิด': 2, 'ปิดAds': 10, 'ปิดOrganic': 1 }, [FAT]: { '8/11': 49, 'ปิด': 5, 'ปิดAds': 9 } }),
    ...tagRows('2026-11-09', { [FB]: { '9/11': 26, 'ปิด': -1, 'ปิดAds': 6, 'ปิดOrganic': 1 }, [FAT]: { '9/11': 33, 'ปิดAds': 5 }, [FIT]: { '9/11': 2 } }),
  ]
  const D8 = { from: '2026-11-08', to: '2026-11-08' }
  const D9 = { from: '2026-11-09', to: '2026-11-09' }

  it('counts all three close tags (real 8/11 export)', () => {
    const s = summarize(NOV, {}, D8, 'all')
    expect([s.newChats, s.closed]).toEqual([87, 27])
    expect(s.closedSplit).toEqual({ ads: 19, organic: 1, unspecified: 7 })
    expect(s.closedRemoved).toBe(0)
    expect(s.journey.find(j => j.group === 'ปิดการขาย')?.count).toBe(27)
  })

  it('nets a removed ปิด tag and reports it (real 9/11 export)', () => {
    const s = summarize(NOV, {}, D9, 'all')
    expect([s.newChats, s.closed]).toEqual([61, 11])
    expect(s.closedSplit).toEqual({ ads: 11, organic: 1, unspecified: 0 })
    expect(s.closedRemoved).toBe(1)
  })

  it('never shows a negative close count', () => {
    const neg = tagRows('2026-11-09', { [FB]: { '9/11': 5, 'ปิด': -2 } })
    const s = summarize(neg, {}, D9, FB)
    expect([s.closed, s.rate, s.closedRemoved]).toEqual([0, 0, 2])
    expect(s.closedSplit.unspecified).toBe(0)
    expect(trend(neg, D9, FB)[0].closed).toBe(0)
  })
})
