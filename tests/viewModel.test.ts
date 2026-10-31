import { describe, expect, it } from 'vitest'
import { summarize } from '../src/metrics/daily'
import { buildInsights, deltaText, fixList, thaiDay } from '../src/ui/viewModel'
import { DAY29, tagRows } from './fixtures/day29'

const D29 = { from: '2026-10-29', to: '2026-10-29' }
const rows = tagRows('2026-10-29', DAY29)

describe('deltaText', () => {
  it('shows the change against the previous period', () => {
    expect(deltaText(30, 18, true)).toBe('+12 จากช่วงก่อน')
    expect(deltaText(15, 18, true)).toBe('-3 จากช่วงก่อน')
    expect(deltaText(18, 18, true)).toBe('เท่ากับช่วงก่อน')
  })
  it('shows a dash when the previous period has no data', () => {
    expect(deltaText(30, 0, false)).toBe('—')
  })
})

describe('thaiDay', () => {
  it('formats short Thai dates', () => {
    expect(thaiDay('2026-10-29')).toBe('29 ต.ค.')
    expect(thaiDay('2027-01-01')).toBe('1 ม.ค.')
  })
})

describe('fixList', () => {
  it('ranks the top four stuck points with advice', () => {
    const f = fixList(summarize(rows, {}, D29, 'all'))
    expect(f.map(x => x.group)).toEqual(['เงียบหาย', 'ติดเรื่องราคา', 'เริ่มสนใจ', 'พร้อมสั่ง'])
    expect(f[3].name).toBe('พร้อมสั่งแต่ยังไม่ปิด')
    expect(f[0].advice).toContain('1–2 ชั่วโมง')
  })
})

describe('buildInsights', () => {
  const pages = [
    { name: 'Hylme (Facebook)', newChats: 118, closed: 8, old: 3 },
    { name: 'ครบจบเรื่องไขมัน', newChats: 70, closed: 19, old: 35 },
    { name: 'ครบจบเรื่องนอน', newChats: 0, closed: 0, old: 1 },
  ]

  it('builds the four prototype insights from real inputs', () => {
    const list = buildInsights({ readySilent: 11, priceRead: 9, priceUnread: 30, convNew: 108, closedNew: 2, convLabel: 'Hylme (Facebook)', pages })
    expect(list.map(i => i.kind)).toEqual(['ตามด่วน', 'ขอราคาแล้วเงียบ', 'แชทใหม่ยังไม่ปิด', 'เทียบเพจ'])
    expect(list[1].text).toBe('ลูกค้าขอราคาแล้วเงียบ 39 แชท ยังไม่เปิดอ่าน 30 อ่านแล้วไม่ตอบ 9 (Hylme (Facebook))')
    expect(list[3].text).toContain('ครบจบเรื่องไขมันปิดได้ 19 จาก 70 แชทใหม่')
    expect(list[3].text).toContain('ลูกค้าเก่า 35 แชท')
  })

  it('hides insights whose inputs are zero', () => {
    const list = buildInsights({ readySilent: 0, priceRead: 0, priceUnread: 0, convNew: 0, closedNew: 0, convLabel: '', pages: pages.slice(0, 1) })
    expect(list).toEqual([])
  })
})
