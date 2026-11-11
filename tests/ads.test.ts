import { describe, expect, it } from 'vitest'
import { adScores, wilson } from '../src/metrics/ads'
import type { Lead } from '../src/metrics/leads'

const FB = '100379779472465'
const FAT = '516356078238016'
let n = 0
const lead = (ads: string[], closed: boolean, over: Partial<Lead> = {}): Lead => ({
  conversationId: `l${++n}`, pageId: FB, startDay: '2026-11-01', lastDay: '2026-11-02', isNew: true,
  tags: ads, topics: [], msgs: 1, days: 1, phone: false, typedFirst: false, closed, ads, ...over,
})
const many = (k: number, ad: string[], closed: number, over: Partial<Lead> = {}) =>
  Array.from({ length: k }, (_, i) => lead(ad, i < closed, over))

describe('wilson', () => {
  it('matches hand-computed 90% bounds', () => {
    const [lo, hi] = wilson(0, 21)
    expect(lo).toBeCloseTo(0, 3)
    expect(hi).toBeCloseTo(0.114, 3)
    const [lo2, hi2] = wilson(8, 111)
    expect(lo2).toBeCloseTo(0.041, 3)
    expect(hi2).toBeCloseTo(0.123, 3)
    expect(wilson(0, 0)).toEqual([0, 1])
  })
})

describe('adScores', () => {
  const X = '120250983524320', Y = '120250983982390', Z = '120251252805530'
  it('ranks judged ads by Wilson lower bound, leaving tiny samples unranked', () => {
    const W = '120250983000000'
    const r = adScores([...many(21, [X], 0), ...many(100, [Y], 30), ...many(50, [W], 9), ...many(5, [Z], 5)], {}, 'all')
    expect(r.ads.map(a => [a.tag, a.rank])).toEqual([[Y, 1], [W, 2], [X, 3], [Z, null]])
  })
  it('breaks equal confidence scores by chat count', () => {
    expect(adScores([...many(15, [X], 0), ...many(30, [Y], 0)], {}, 'all').ads.map(a => a.tag)).toEqual([Y, X])
  })
  it('judges each ad against the average, then sorts by confidence-adjusted rank', () => {
    const r = adScores([...many(21, [X], 0), ...many(100, [Y], 30), ...many(5, [Z], 5)], {}, 'all')
    expect(r.avg).toBe(27.8)
    expect(r.adChats).toBe(126)
    expect(r.ads.map(a => [a.tag, a.verdict])).toEqual([[Y, 'กลางๆ'], [X, 'ไม่ดี'], [Z, 'ข้อมูลยังน้อย']])
    expect(r.ads[0]).toMatchObject({ chats: 100, closed: 30, rate: 30 })
  })
  it('counts a two-ad chat once in the average and once per ad', () => {
    const r = adScores([lead([X, Y], true), lead([X], false)], {}, 'all')
    expect(r.adChats).toBe(2)
    expect(r.ads.find(a => a.tag === X)?.chats).toBe(2)
    expect(r.ads.find(a => a.tag === Y)?.chats).toBe(1)
  })
  it('uses only the selected page', () => {
    const r = adScores([lead([X], true), lead([X], false, { pageId: FAT })], {}, FB)
    expect(r.ads[0]).toMatchObject({ chats: 1, pages: [FB] })
    expect(r.adChats).toBe(1)
  })
  it('counts A+B leads as good', () => {
    const r = adScores([lead([X], false, { msgs: 5 }), lead([X], false, { tags: [X, '4.ถามสุขภาพ'] }), lead([X], false)], {}, 'all')
    expect(r.ads[0].good).toBe(2)
  })
  it('returns an empty result without new ad chats', () => {
    expect(adScores([lead([], true), lead([X], true, { isNew: false })], {}, 'all')).toEqual({ avg: null, adChats: 0, ads: [] })
  })
  it('names ads and flags short ids', () => {
    const r = adScores([lead(['1252805530361'], false), lead([X], false)], { [X]: 'คลิปไขมัน' }, 'all')
    expect(r.ads.find(a => a.tag === X)).toMatchObject({ name: 'คลิปไขมัน', shortId: false })
    expect(r.ads.find(a => a.tag === '1252805530361')).toMatchObject({ name: null, shortId: true })
  })
  it('keeps the first and last day seen', () => {
    const r = adScores([lead([X], false, { startDay: '2026-11-03', lastDay: '2026-11-05' }), lead([X], false, { startDay: '2026-11-01', lastDay: '2026-11-01' })], {}, 'all')
    expect(r.ads[0]).toMatchObject({ firstDay: '2026-11-01', lastDay: '2026-11-05' })
  })
})
