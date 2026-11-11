import type { Sheet } from './types'

export const CONV_ID_COL = 'ID การสนทนา (conversation_id)'
export const COMBINED_SHEET = 'ทุกหน้า'
export const ORDER_ID_COL = 'รหัสคำสั่งซื้อ'
export const ORDER_STAFF_COL = 'พนักงานยืนยัน'

export const isOrderHeader = (row: unknown[] | undefined) => !!row && row.includes(ORDER_ID_COL) && row.includes(ORDER_STAFF_COL)

export function isTagHeader(row: unknown[] | undefined): boolean {
  return !!row && row[0] === 'ID' && row[1] === 'name'
}

export function detectKind(sheets: Sheet[]): 'tagStats' | 'messages' | 'orders' | 'combined' | 'unknown' {
  if (sheets.some(s => (s.rows[0] ?? []).includes(CONV_ID_COL))) return 'messages'
  if (sheets.some(s => s.rows.slice(0, 5).some(isOrderHeader))) return 'orders'
  if (sheets.some(s => s.name.trim() === COMBINED_SHEET)) return 'combined'
  if (sheets.some(s => s.rows.some(isTagHeader))) return 'tagStats'
  return 'unknown'
}
