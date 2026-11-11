import { describe, expect, it } from 'vitest'
import { QUOTE_CATEGORIES, categoryCounts, filterQuotes, maskPhones, type Quote } from '../src/metrics/quotes'

const FB = '100379779472465'
const FAT = '516356078238016'
const q = (over: Partial<Quote>): Quote => ({
  id: 1, createdAt: '2026-11-11T03:00:00Z', day: '2026-11-11', pageId: FB, category: 'ราคา/แพง', quote: 'แพงจัง', note: '', ...over,
})

describe('maskPhones', () => {
  it('replaces Thai phone numbers in any common format', () => {
    expect(maskPhones('โทรมาที่ 0812345678 นะคะ')).toBe('โทรมาที่ [เบอร์] นะคะ')
    expect(maskPhones('081-234-5678')).toBe('[เบอร์]')
    expect(maskPhones('081 234 5678 หรือ +66812345678')).toBe('[เบอร์] หรือ [เบอร์]')
    expect(maskPhones('02-123-4567')).toBe('[เบอร์]')
  })
  it('keeps short numbers like prices, amounts and dates', () => {
    expect(maskPhones('2 กระปุก 1,290 บาท ส่ง 15/11')).toBe('2 กระปุก 1,290 บาท ส่ง 15/11')
    expect(maskPhones('น้ำตาล 180 ความดัน 140/90')).toBe('น้ำตาล 180 ความดัน 140/90')
  })
})

describe('categoryCounts and filterQuotes', () => {
  const list = [
    q({ id: 1, category: 'ราคา/แพง' }),
    q({ id: 2, category: 'ราคา/แพง', pageId: FAT }),
    q({ id: 3, category: 'คำชม', day: '2026-10-01' }),
  ]
  it('counts every category in order, including zeros', () => {
    const c = categoryCounts(list)
    expect(c.map(([k]) => k)).toEqual([...QUOTE_CATEGORIES])
    expect(c.find(([k]) => k === 'ราคา/แพง')?.[1]).toBe(2)
    expect(c.find(([k]) => k === 'อื่นๆ')?.[1]).toBe(0)
  })
  it('filters by category, page and start day, newest first', () => {
    expect(filterQuotes(list, { category: 'ราคา/แพง', page: FAT, from: null }).map(x => x.id)).toEqual([2])
    expect(filterQuotes(list, { category: 'all', page: 'all', from: '2026-11-01' }).map(x => x.id)).toEqual([2, 1])
    const sorted = filterQuotes([q({ id: 5, day: '2026-11-01' }), q({ id: 6, day: '2026-11-09' })], { category: 'all', page: 'all', from: null })
    expect(sorted.map(x => x.id)).toEqual([6, 5])
  })
})
