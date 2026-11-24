import { describe, expect, it } from 'vitest'
import { toLeads, type Lead } from '../src/metrics/leads'
import { closedOnDay, dropStages, latestDay, noStageBreakdown, reasonTagStats, topicCoverage, topicStats, whoOf } from '../src/metrics/reasons'

const lead = (topics: string[] = [], closed = false, tags: string[] = []): Lead => ({
  conversationId: 'c', pageId: '100379779472465', startDay: '2026-11-06', lastDay: '2026-11-06',
  isNew: true, tags, topics, msgs: 1, days: 1, phone: false, typedFirst: true, closed, closeDay: closed ? '2026-11-06' : null, ads: [],
})
describe('reasons', () => {
  it('compares topics against the same cohort, counts no-topic chats and flags small samples', () => {
    const xs = [lead(['ราคา/แพง'], true), ...Array.from({ length: 3 }, () => lead(['ราคา/แพง'])),
      ...Array.from({ length: 3 }, () => lead(['ส่งของ/จ่ายเงิน'], true)), ...Array.from({ length: 3 }, () => lead())]
    expect(topicStats(xs)).toEqual({ avg: 40, none: 3,
      buy: [{ topic: 'ส่งของ/จ่ายเงิน', chats: 3, closed: 3, rate: 100, thin: true }],
      notBuy: [{ topic: 'ราคา/แพง', chats: 4, closed: 1, rate: 25, thin: true }] })
    expect(topicCoverage(xs)).toEqual({ withTopics: 7, total: 10 })
  })
  it('keeps zero rows and counts each chat once for coverage even with multiple reasons', () => {
    const r = reasonTagStats([lead([], false, ['ติดราคา', 'ไม่สนใจ']), lead([], true, ['ส่วนผสม', 'ติดราคา'])])
    expect(r.buy).toMatchObject({ tagged: 1, total: 1 })
    expect(r.lost).toMatchObject({ tagged: 1, total: 1 })
    expect(r.buy.rows[0]).toEqual(['ส่วนผสม', 1])
    expect(r.lost.rows.slice(0, 2)).toEqual([['ติดราคา', 1], ['ไม่สนใจ', 1]])
    expect(r.lost.rows).toContainEqual(['ราคาแพง', 0])
  })
  it('uses stage precedence, ignores closed chats and keeps fixed zero stages', () => {
    expect(dropStages([lead([], false, ['2.ขอราคา', '5.พร้อมสั่ง']), lead([], false, ['2.ขอราคา']), lead(), lead([], true)]))
      .toEqual([['พร้อมสั่ง', 1], ['ลังเล', 0], ['ขอโปร', 0], ['ขอราคา', 1], ['ถามสุขภาพ', 0], ['สนใจ', 0]])
  })
  it('has no invalid rates for an empty cohort', () => {
    expect(topicStats([])).toEqual({ avg: null, buy: [], notBuy: [], none: 0 })
    expect(topicCoverage([])).toEqual({ withTopics: 0, total: 0 })
    expect(reasonTagStats([]).buy).toMatchObject({ tagged: 0, total: 0 })
  })
  it('unions topics over exports without duplicates', () => {
    const row = { day: '2026-11-06', conversationId: 'c', pageId: '100379779472465' as const,
      firstAt: '', lastAt: '', firstKind: 'typed' as const, msgCount: 1, hasPhone: false, tags: ['6/11'], pancakeUrl: '' }
    expect(toLeads([{ ...row, topics: ['ราคา/แพง'] }, { ...row, day: '2026-11-07', topics: ['ราคา/แพง', 'ขอคิดก่อน'] }])[0].topics)
      .toEqual(['ราคา/แพง', 'ขอคิดก่อน'])
  })
  it('splits new chats from returning customers', () => {
    const xs = [lead(), { ...lead(), conversationId: 'o', isNew: false }]
    expect(whoOf(xs, 'all')).toHaveLength(2)
    expect(whoOf(xs, 'new').map(l => l.conversationId)).toEqual(['c'])
    expect(whoOf(xs, 'old').map(l => l.conversationId)).toEqual(['o'])
  })
  it('counts chats first closed on a day and how many carry a buy reason', () => {
    const xs = [
      { ...lead([], true, ['ปิด', 'ส่วนผสม']), closeDay: '2026-11-19' },
      { ...lead([], true, ['ปิดAds']), closeDay: '2026-11-19' },
      { ...lead([], true, ['ปิด']), closeDay: '2026-11-18' },
      lead(),
    ]
    expect(closedOnDay(xs, '2026-11-19')).toEqual({ closed: 2, tagged: 1 })
    expect(closedOnDay(xs, '2026-11-20')).toEqual({ closed: 0, tagged: 0 })
    expect(latestDay([{ ...lead(), lastDay: '2026-11-19' }, lead()])).toBe('2026-11-19')
    expect(latestDay([])).toBeNull()
  })
  it('takes the close day from the first export carrying a close tag', () => {
    const row = { day: '2026-11-06', conversationId: 'c', pageId: '100379779472465' as const,
      firstAt: '', lastAt: '', firstKind: 'typed' as const, msgCount: 1, hasPhone: false, tags: ['6/11'], pancakeUrl: '' }
    expect(toLeads([row, { ...row, day: '2026-11-08', tags: ['6/11', 'ปิดAds'] }, { ...row, day: '2026-11-09', tags: ['ปิด'] }])[0].closeDay)
      .toBe('2026-11-08')
    expect(toLeads([row])[0].closeDay).toBeNull()
  })
})

describe('noStageBreakdown', () => {
  it('splits open no-stage chats into other-tag counts and untagged chats; date and ad tags do not count', () => {
    const ad = { ...lead([], false, ['12/11', '120247446239640']), ads: ['120247446239640'], typedFirst: false }
    const r = noStageBreakdown([
      lead([], false, ['9.อื่นๆ .(ทักมั่ว)', 'ไม่เปิดอ่าน', '12/11']), lead([], false, ['ไม่เปิดอ่าน']), ad,
      { ...lead(), msgs: 5 }, lead([], false, ['2.ขอราคา']), lead([], true, ['ไม่เปิดอ่าน']),
    ])
    expect(r.other).toEqual({ total: 2, rows: [['ไม่เปิดอ่าน', 2], ['9.อื่นๆ .(ทักมั่ว)', 1]] })
    expect(r.none.total).toBe(2)
    expect(r.none.rows).toEqual([['ส่งข้อความเดียว', 1], ['2–3 ข้อความ', 0], ['4 ข้อความขึ้นไป', 1],
      ['เริ่มจากกดปุ่ม', 1], ['พิมพ์ข้อความแรกเอง', 1], ['มีเลขแอด (มาจากโฆษณา)', 1]])
  })
})
