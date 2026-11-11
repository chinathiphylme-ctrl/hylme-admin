import { describe, expect, it } from 'vitest'
import { isAdTag } from '../src/grouping/rules'
import { explainGrade, gradeOf, gradeReasonCounts, gradeStats, inStart, newChatCloses, toLeads, type Lead } from '../src/metrics/leads'
import type { ConvRow } from '../src/parse/types'

const row = (conversationId: string, day: string, tags: string[], over: Partial<ConvRow> = {}): ConvRow => ({
  day, conversationId, pageId: '100379779472465', firstAt: `${day}T10:00:00+07:00`, lastAt: `${day}T12:00:00+07:00`,
  msgCount: 1, firstKind: 'typed', hasPhone: false, tags, topics: [], pancakeUrl: 'https://pancake.vn/x', ...over,
})
const g = (tags: string[], msgs: number, days: number, typedFirst: boolean) => gradeOf({ tags, msgs, days, typedFirst })

describe('gradeOf', () => {
  it('explains the winning grade, including multiple matching reasons, without using purchase outcomes', () => {
    expect(explainGrade({ tags: ['5.พร้อมสั่ง', 'ไม่สนใจ', 'ปิดAds'], msgs: 4, days: 2, typedFirst: true })).toEqual({
      grade: 'A', reasons: ['มีแท็กพร้อมสั่ง (5.)', 'มีข้อความอย่างน้อย 4 ข้อความ', 'พบแชทอย่างน้อย 2 วัน'],
    })
    expect(explainGrade({ tags: ['ไม่สนใจ', '3. ขอโปรโมชั่น'], msgs: 2, days: 1, typedFirst: true })).toEqual({ grade: 'D', reasons: ['มีแท็กไม่สนใจ'] })
  })
  it('explains C button chats with two or three messages without claiming they are silent', () => {
    for (const msgs of [2, 3]) expect(explainGrade({ tags: ['2.ขอราคา'], msgs, days: 1, typedFirst: false }))
      .toEqual({ grade: 'C', reasons: [`เริ่มจากปุ่ม มี ${msgs} ข้อความ`] })
  })
  it('counts only actual matching reasons inside the assigned grade', () => {
    const ls = toLeads([
      row('a', '2026-11-10', ['10/11', '5.พร้อมสั่ง'], { msgCount: 4 }),
      row('b', '2026-11-10', ['10/11'], { msgCount: 4 }),
      row('d', '2026-11-10', ['10/11', 'ไม่สนใจ', '3. ขอโปรโมชั่น']),
    ])
    expect(gradeReasonCounts(ls, 'A')).toEqual([['มีข้อความอย่างน้อย 4 ข้อความ', 2], ['มีแท็กพร้อมสั่ง (5.)', 1]])
    expect(gradeReasonCounts(ls, 'B')).toEqual([])
    expect(gradeReasonCounts(ls, 'D')).toEqual([['มีแท็กไม่สนใจ', 1]])
  })
  it('puts A before D', () => expect(g(['5.พร้อมสั่ง', 'ไม่สนใจ'], 1, 1, false)).toBe('A'))
  it('puts D before B', () => expect(g(['ไม่สนใจ', '3. ขอโปรโมชั่น'], 1, 1, true)).toBe('D'))
  it('grades 4+ messages A', () => expect(g([], 4, 1, false)).toBe('A'))
  it('grades a return visit A', () => expect(g([], 1, 2, false)).toBe('A'))
  it('grades a health question B', () => expect(g(['4.ถามสุขภาพ'], 1, 1, false)).toBe('B'))
  it('grades a typed first message with a reply B', () => expect(g([], 2, 1, true)).toBe('B'))
  it('grades a button tap with one more message C', () => expect(g([], 2, 1, false)).toBe('C'))
  it('ignores outcome tags', () => expect(g(['ปิดAds', 'ปลายทาง'], 1, 1, false)).toBe('C'))
  it('grades ทักมั่ว D', () => expect(g(['9.อื่นๆ .(ทักมั่ว)'], 1, 1, true)).toBe('D'))
})

describe('toLeads', () => {
  it('merges a chat across days and keeps tags that later disappear', () => {
    const [l] = toLeads([
      row('a', '2026-11-02', ['1/11', 'ปิดAds'], { msgCount: 3, hasPhone: true }),
      row('a', '2026-11-01', ['1/11', '120250984880940'], { firstKind: 'button' }),
    ])
    expect(l).toMatchObject({
      conversationId: 'a', startDay: '2026-11-01', lastDay: '2026-11-02', isNew: true,
      msgs: 4, days: 2, phone: true, typedFirst: false, closed: true, ads: ['120250984880940'],
    })
    expect(l.tags).toEqual(expect.arrayContaining(['1/11', '120250984880940', 'ปิดAds']))
  })
  it('is not new without its own date tag on the first day, or as an old customer', () => {
    const ls = toLeads([
      row('b', '2026-11-01', ['31/10']),
      row('c', '2026-11-01', ['1/11']),
      row('c', '2026-11-02', ['1/11', '8.ลูกค้าเก่า']),
    ])
    expect(ls.map(l => [l.conversationId, l.isNew])).toEqual([['b', false], ['c', false]])
  })
  it('filters by start day', () => {
    const ls = toLeads([row('d', '2026-11-01', ['1/11']), row('d', '2026-11-02', ['1/11']), row('e', '2026-11-02', ['2/11'])])
    expect(ls.filter(inStart({ from: '2026-11-02', to: '2026-11-02' })).map(l => l.conversationId)).toEqual(['e'])
  })
})

describe('gradeStats', () => {
  it('gives four rows with rates', () => {
    const base = { conversationId: 'x', pageId: '100379779472465', startDay: '2026-11-01', lastDay: '2026-11-01', isNew: true, phone: false, ads: [] } as const
    const leads: Lead[] = [
      { ...base, tags: [], msgs: 5, days: 1, typedFirst: true, closed: true },
      { ...base, tags: [], msgs: 5, days: 1, typedFirst: true, closed: false },
      { ...base, tags: [], msgs: 1, days: 1, typedFirst: false, closed: false },
    ]
    expect(gradeStats(leads)).toEqual([
      { grade: 'A', chats: 2, closed: 1, rate: 50 },
      { grade: 'B', chats: 0, closed: 0, rate: null },
      { grade: 'C', chats: 1, closed: 0, rate: 0 },
      { grade: 'D', chats: 0, closed: 0, rate: null },
    ])
  })
})

describe('isAdTag', () => {
  it('matches 12+ digit tags only', () => {
    expect(isAdTag('120250984880940')).toBe(true)
    expect(isAdTag('29/10')).toBe(false)
    expect(isAdTag('12345')).toBe(false)
  })
})

describe('newChatCloses', () => {
  const NON = '923678677500634'
  // real 10/11 shape on ครบจบเรื่องนอน: 1 new chat not closed, 2 returning customers closed as ปิดOrganic
  const rows = [
    row('new', '2026-11-10', ['10/11', '3. ขอโปรโมชั่น', 'อ่านไม่ตอบ'], { pageId: NON }),
    row('old1', '2026-11-08', ['9/11', '8.ลูกค้าเก่า'], { pageId: NON }),
    row('old1', '2026-11-10', ['9/11', '8.ลูกค้าเก่า', 'ปิดOrganic'], { pageId: NON }),
    row('old2', '2026-11-10', ['ปิดOrganic', '8.ลูกค้าเก่า'], { pageId: NON }),
    row('fb', '2026-11-10', ['10/11', 'ปิดAds']),
  ]
  const D10 = { from: '2026-11-10', to: '2026-11-10' }
  it('rates only new chats, never above 100%', () => {
    expect(newChatCloses(toLeads(rows), D10, NON)).toEqual({ newChats: 1, closed: 0, rate: 0 })
  })
  it('sums pages for all and gives null without new chats', () => {
    expect(newChatCloses(toLeads(rows), D10, 'all')).toEqual({ newChats: 2, closed: 1, rate: 50 })
    expect(newChatCloses(toLeads(rows), { from: '2026-11-01', to: '2026-11-01' }, 'all')).toEqual({ newChats: 0, closed: 0, rate: null })
  })
})
