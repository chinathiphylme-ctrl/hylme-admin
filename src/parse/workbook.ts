import * as XLSX from 'xlsx'
import type { Sheet } from './types'

export function readWorkbook(buf: ArrayBuffer): Sheet[] {
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null }),
  }))
}
