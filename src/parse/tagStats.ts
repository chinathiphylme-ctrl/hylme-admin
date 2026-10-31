import { isPageId, type PageId } from '../config/pages'
import { detectKind, isTagHeader } from './detect'
import type { Sheet, TagRow, TagStatsResult } from './types'

export const ERR_COMBINED = 'ไฟล์นี้เป็นแบบรวมทุกเพจ กรุณา export แบบแยกเพจ'
export const ERR_NO_PAGE = 'ไม่พบเพจของ Hylme ในไฟล์นี้'
export const ERR_NO_HEADER = 'หาหัวตารางสถิติแท็กไม่เจอ'

const pad = (n: number) => String(n).padStart(2, '0')

function startYear(rows: unknown[][]): number | null {
  for (const r of rows) {
    const m = String(r[0] ?? '').match(/ช่วงเวลาดาวน์โหลด:\s*\d{1,2}\/\d{1,2}\/(\d{4})/)
    if (m) return Number(m[1])
  }
  return null
}

// day columns are `d/m`; the year starts from the download range and rolls over when the month drops
function dayColumns(header: unknown[], year: number): { col: number; day: string }[] {
  const out: { col: number; day: string }[] = []
  let prevMonth = 0
  header.forEach((h, col) => {
    const m = String(h ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})$/)
    if (col < 4 || !m) return
    const month = Number(m[2])
    if (prevMonth && month < prevMonth) year++
    prevMonth = month
    out.push({ col, day: `${year}-${pad(month)}-${pad(Number(m[1]))}` })
  })
  return out
}

function toCount(v: unknown): number {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').trim())
  return v === null || String(v).trim() === '' || Number.isNaN(n) ? 0 : n
}

export function parseTagStats(sheets: Sheet[], fileName: string): TagStatsResult {
  const fail = (error: string): TagStatsResult => ({ ok: false, fileName, error })
  const kind = detectKind(sheets)
  if (kind === 'combined') return fail(ERR_COMBINED)
  if (kind !== 'tagStats') return fail(ERR_NO_HEADER)

  const pageSheets = sheets.filter(s => !s.name.endsWith(' today') && isPageId(s.name.trim()))
  if (!pageSheets.length) return fail(ERR_NO_PAGE)

  const rows: TagRow[] = []
  const tags = new Map<string, string>()
  const days = new Set<string>()
  for (const s of pageSheets) {
    const pageId = s.name.trim() as PageId
    const h = s.rows.findIndex(isTagHeader)
    const year = startYear(s.rows)
    if (h < 0 || year === null) return fail(ERR_NO_HEADER)
    const cols = dayColumns(s.rows[h], year)
    for (const r of s.rows.slice(h + 1)) {
      const tag = String(r[1] ?? '').trim()
      if (!tag) continue
      const color = String(r[2] ?? '')
      if (!tags.has(tag)) tags.set(tag, color)
      for (const { col, day } of cols) {
        days.add(day)
        rows.push({ day, pageId, tag, color, count: toCount(r[col]) })
      }
    }
  }
  return {
    ok: true,
    fileName,
    rows,
    days: [...days].sort(),
    pageIds: pageSheets.map(s => s.name.trim() as PageId),
    tags: [...tags].map(([tag, color]) => ({ tag, color })),
  }
}
