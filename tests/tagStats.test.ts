import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { detectKind } from '../src/parse/detect'
import { parseTagStats } from '../src/parse/tagStats'
import { readWorkbook } from '../src/parse/workbook'
import { tagStatsSheets } from './fixtures/build'

const FB = '100379779472465'
const FAT = '516356078238016'
const ONE_DAY = '29/10/2026 00:00:00 - 29/10/2026 23:59:59'

const twoPages = (todayCounts?: number) => tagStatsSheets({
  pages: {
    [FB]: [['29/10', '#a', [118]], ['ปิด', '#b', [8]]],
    [FAT]: [['29/10', '#a', [70]], ['ปิด', '#b', [19]]],
  },
  dayHeaders: ['29/10'],
  range: ONE_DAY,
  todayCounts,
})

describe('parseTagStats', () => {
  it('reads two pages for one day', () => {
    const sheets = twoPages()
    expect(detectKind(sheets)).toBe('tagStats')
    const r = parseTagStats(sheets, 'a.xlsx')
    if (!r.ok) throw new Error(r.error)
    expect(r.rows).toHaveLength(4)
    expect(r.rows.find(x => x.pageId === FAT && x.tag === 'ปิด')!.count).toBe(19)
    expect(r.days).toEqual(['2026-10-29'])
    expect(r.pageIds.sort()).toEqual([FB, FAT].sort())
  })

  it('ignores the hourly today sheets', () => {
    const r = parseTagStats(twoPages(5000), 'a.xlsx')
    if (!r.ok) throw new Error(r.error)
    expect(r.rows.reduce((s, x) => s + x.count, 0)).toBe(118 + 8 + 70 + 19)
  })

  it('walks days across New Year', () => {
    const sheets = tagStatsSheets({
      pages: { [FB]: [['ปิด', '#b', [1, 2]]] },
      dayHeaders: ['31/12', '1/1'],
      range: '31/12/2026 00:00:00 - 01/01/2027 23:59:59',
    })
    const r = parseTagStats(sheets, 'a.xlsx')
    if (!r.ok) throw new Error(r.error)
    expect(r.days).toEqual(['2026-12-31', '2027-01-01'])
    expect(r.rows.find(x => x.day === '2027-01-01')!.count).toBe(2)
  })

  it('treats blank cells as zero', () => {
    const sheets = tagStatsSheets({ pages: { [FB]: [['ปิด', '#b', [null]], ['รอ', '#c', ['' as unknown as number]]] }, dayHeaders: ['29/10'], range: ONE_DAY })
    const r = parseTagStats(sheets, 'a.xlsx')
    if (!r.ok) throw new Error(r.error)
    expect(r.rows.map(x => x.count)).toEqual([0, 0])
  })

  it('merges tags that are the same after trimming', () => {
    const sheets = tagStatsSheets({ pages: { [FB]: [['ปิด', '#b', [3]], [' ปิด', '#b', [2]]] }, dayHeaders: ['29/10'], range: ONE_DAY })
    const r = parseTagStats(sheets, 'a.xlsx')
    if (!r.ok) throw new Error(r.error)
    expect(r.rows).toEqual([{ day: '2026-10-29', pageId: FB, tag: 'ปิด', color: '#b', count: 5 }])
  })

  it('rejects the combined all-pages export', () => {
    const sheets = [...twoPages(), { name: 'ทุกหน้า', rows: twoPages()[0].rows }]
    expect(detectKind(sheets)).toBe('combined')
    expect(parseTagStats(sheets, 'a.xlsx')).toEqual({ ok: false, fileName: 'a.xlsx', error: 'ไฟล์นี้เป็นแบบรวมทุกเพจ กรุณา export แบบแยกเพจ' })
  })

  it('rejects files with no Hylme page', () => {
    const sheets = tagStatsSheets({ pages: { '999': [['ปิด', '#b', [1]]] }, dayHeaders: ['29/10'], range: ONE_DAY })
    expect(parseTagStats(sheets, 'a.xlsx')).toEqual({ ok: false, fileName: 'a.xlsx', error: 'ไม่พบเพจของ Hylme ในไฟล์นี้' })
  })
})

describe('readWorkbook', () => {
  it('returns every sheet as rows', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'name'], ['t1', null]]), FB)
    const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    expect(readWorkbook(buf)).toEqual([{ name: FB, rows: [['ID', 'name'], ['t1', null]] }])
  })
})

describe('detectKind', () => {
  it('returns unknown for other files', () => {
    expect(detectKind([{ name: 'x', rows: [['a', 'b']] }])).toBe('unknown')
  })
})
