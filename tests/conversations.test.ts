import { describe, expect, it } from 'vitest'
import { convStats, followList, replyOf, segmentRates, stageOf } from '../src/metrics/conversations'
import type { ConvRow } from '../src/parse/types'

let n = 0
const conv = (tags: string[], over: Partial<ConvRow> = {}): ConvRow => ({
  day: '2026-10-29',
  conversationId: `c${++n}`,
  pageId: '100379779472465',
  firstAt: '2026-10-29T10:00:00+07:00',
  lastAt: '2026-10-29T12:30:00+07:00',
  msgCount: 2,
  firstKind: 'typed',
  hasPhone: false,
  tags,
  pancakeUrl: 'https://pancake.vn/x',
  ...over,
})

describe('stageOf and replyOf', () => {
  it('lets ปิด win', () => expect(stageOf(['ปิด', '5.พร้อมสั่ง'])).toBe('ปิดแล้ว'))
  it('treats ปิดAds and ปิดOrganic as closed', () => {
    expect(stageOf(['ปิดAds', '5.พร้อมสั่ง'])).toBe('ปิดแล้ว')
    expect(stageOf(['ปิดOrganic'])).toBe('ปิดแล้ว')
  })
  it('takes the furthest numbered stage', () => expect(stageOf(['2.ขอราคา', '1.สนใจ'])).toBe('ขอราคา'))
  it('falls back to อื่นๆ', () => expect(stageOf(['มะกอก'])).toBe('อื่นๆ'))
  it('prefers ไม่เปิดอ่าน', () => expect(replyOf(['ไม่เปิดอ่าน', 'อ่านไม่ตอบ'])).toBe('ไม่เปิดอ่าน'))
  it('defaults to still talking', () => expect(replyOf(['1.สนใจ'])).toBe('ยังคุยอยู่'))
})

describe('followList', () => {
  it('keeps only open late-stage chats that went quiet, in priority order', () => {
    const list = followList([
      conv(['2.ขอราคา', 'ไม่เปิดอ่าน'], { conversationId: 'price-unread' }),
      conv(['1.สนใจ', 'ไม่เปิดอ่าน'], { conversationId: 'interest' }),
      conv(['ปิด', '5.พร้อมสั่ง', 'ไม่เปิดอ่าน'], { conversationId: 'closed' }),
      conv(['5.พร้อมสั่ง', 'ไม่เปิดอ่าน', 'มะกอก'], { conversationId: 'ready-unread' }),
      conv(['5.พร้อมสั่ง', 'อ่านไม่ตอบ', '8.ลูกค้าเก่า'], { conversationId: 'ready-read' }),
    ])
    expect(list.map(f => f.conversationId)).toEqual(['ready-read', 'ready-unread', 'price-unread'])
    expect(list[1]).toMatchObject({ stage: 'พร้อมสั่ง', status: 'ไม่เปิดอ่าน', product: 'มะกอก', last: '12:30', msgs: 2, kind: 'ใหม่' })
    expect(list[0].kind).toBe('ลูกค้าเก่า')
  })
})

describe('convStats', () => {
  it('counts mix, products, closes and hours', () => {
    const s = convStats([
      conv(['29/10', '8.ลูกค้าเก่า', 'มะกอก', 'เดลี่ ออยล์']),
      conv(['29/10', 'ปิด', 'มะกอก'], { lastAt: '2026-10-29T21:05:00+07:00' }),
      conv(['ปิด', 'ทักซ้ำไม่ซื้อ']),
      conv(['2.ขอราคา', 'อ่านไม่ตอบ']),
    ])
    expect(s.total).toBe(4)
    expect(s.mix).toEqual([['แชทใหม่ (แท็กวันที่)', 1], ['ลูกค้าเก่า', 1], ['แชทอื่น ไม่มีแท็กวันที่', 2]])
    expect(s.products).toEqual([['มะกอก', 2], ['เดลี่ ออยล์', 1]])
    expect([s.closedNow, s.closedNew, s.closedStale]).toEqual([2, 1, 1])
    expect(s.hours[12]).toBe(3)
    expect(s.hours[21]).toBe(1)
    expect(s.matrix.find(m => m.stage === 'ขอราคา')).toEqual({ stage: 'ขอราคา', talking: 0, read: 1, unread: 0, repeat: 0 })
    expect(s.matrix.find(m => m.stage === 'ปิดแล้ว')).toBeUndefined()
  })
})

describe('segmentRates', () => {
  const r = { from: '2026-10-28', to: '2026-10-29' }

  it('is not ready with one day of messages', () => {
    const c = conv(['29/10', 'ปิด'])
    expect(segmentRates([c], [{ conversationId: c.conversationId, tag: 'ปิด', firstDay: null, baseline: true }], r).ready).toBe(false)
  })

  it('counts a close first seen after the baseline day, not a baseline close', () => {
    const a1 = conv(['28/10', 'มะกอก'], { day: '2026-10-28', conversationId: 'a' })
    const a2 = conv(['28/10', 'มะกอก', 'ปิด'], { day: '2026-10-29', conversationId: 'a' })
    const b1 = conv(['28/10', 'มะกอก', 'ปิด'], { day: '2026-10-28', conversationId: 'b' })
    const seen = [
      { conversationId: 'a', tag: 'มะกอก', firstDay: null, baseline: true },
      { conversationId: 'a', tag: 'ปิด', firstDay: '2026-10-29', baseline: false },
      { conversationId: 'b', tag: 'ปิด', firstDay: null, baseline: true },
    ]
    const s = segmentRates([a1, a2, b1], seen, r)
    if (!s.ready) throw new Error(s.reason)
    expect(s.rows.find(x => x.dim === 'สินค้า' && x.name === 'มะกอก')).toEqual({ dim: 'สินค้า', name: 'มะกอก', chats: 2, closed: 1, rate: 50 })
  })

  it('only counts chats whose date tag falls in the range, and closes first seen in the range', () => {
    const r2 = { from: '2026-10-15', to: '2026-10-21' }
    const old = conv(['1/10', 'มะกอก', 'ปิด'], { day: '2026-10-20', conversationId: 'old' })
    const fresh1 = conv(['19/10', 'มะกอก'], { day: '2026-10-19', conversationId: 'fresh' })
    const fresh2 = conv(['19/10', 'มะกอก', 'ปิด'], { day: '2026-10-20', conversationId: 'fresh' })
    const early = conv(['16/10', 'มะกอก', 'ปิด'], { day: '2026-10-16', conversationId: 'early' })
    const seen = [
      { conversationId: 'old', tag: 'ปิด', firstDay: '2026-10-20', baseline: false },
      { conversationId: 'fresh', tag: 'ปิด', firstDay: '2026-10-20', baseline: false },
      { conversationId: 'early', tag: 'ปิด', firstDay: '2026-10-10', baseline: false },
    ]
    const s = segmentRates([old, fresh1, fresh2, early], seen, r2)
    if (!s.ready) throw new Error(s.reason)
    expect(s.rows.find(x => x.dim === 'สินค้า' && x.name === 'มะกอก')).toEqual({ dim: 'สินค้า', name: 'มะกอก', chats: 2, closed: 1, rate: 50 })
  })

  it('counts a ปิดAds close, but not a baseline ปิด that was swapped to ปิดAds', () => {
    const a1 = conv(['28/10', 'มะกอก'], { day: '2026-10-28', conversationId: 'a' })
    const a2 = conv(['28/10', 'มะกอก', 'ปิดAds'], { day: '2026-10-29', conversationId: 'a' })
    const b1 = conv(['28/10', 'มะกอก', 'ปิด'], { day: '2026-10-28', conversationId: 'b' })
    const b2 = conv(['28/10', 'มะกอก', 'ปิดAds'], { day: '2026-10-29', conversationId: 'b' })
    const seen = [
      { conversationId: 'a', tag: 'ปิดAds', firstDay: '2026-10-29', baseline: false },
      { conversationId: 'b', tag: 'ปิด', firstDay: null, baseline: true },
      { conversationId: 'b', tag: 'ปิดAds', firstDay: '2026-10-29', baseline: false },
    ]
    const s = segmentRates([a1, a2, b1, b2], seen, r)
    if (!s.ready) throw new Error(s.reason)
    expect(s.rows.find(x => x.dim === 'สินค้า' && x.name === 'มะกอก')).toEqual({ dim: 'สินค้า', name: 'มะกอก', chats: 2, closed: 1, rate: 50 })
  })
})
