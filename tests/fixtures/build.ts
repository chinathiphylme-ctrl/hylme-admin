import type { Sheet } from '../../src/parse/types'

type TagLine = [tag: string, color: string, counts: (number | null)[]]

// Mirrors the per-page Pancake tag export: one `<id>` sheet and one hourly `<id> today` sheet per page.
export function tagStatsSheets(opts: { pages: Record<string, TagLine[]>; dayHeaders: string[]; range: string; todayCounts?: number }): Sheet[] {
  const sheets: Sheet[] = []
  for (const [id, lines] of Object.entries(opts.pages)) {
    const head: unknown[][] = [
      ['ดาวน์โหลดเมื่อ: 30/10/2026 11:49:06', null, null],
      [`หน้า: Hylme (${id})`, null, null],
      [`ช่วงเวลาดาวน์โหลด: ${opts.range}`, null, null],
      [null, null, null],
      ['ID', 'name', 'color', 'total', ...opts.dayHeaders],
    ]
    const body = lines.map(([tag, color, counts], i) => [`tag_${i}`, tag, color, '', ...counts])
    sheets.push({ name: id, rows: [...head, ...body] })
    const today = lines.map(([tag, color], i) => [`tag_${i}`, tag, color, '', opts.todayCounts ?? 999])
    sheets.push({ name: `${id} today`, rows: [...head.slice(0, 4), ['ID', 'name', 'color', 'total', '00:00'], ...today] })
  }
  return sheets
}

export const MESSAGE_COLUMNS = ['ID ข้อความ', 'ประเภทข้อความ', 'แท็ก', 'แท็กการสั่งซื้อ', 'เนื้อหาข้อความ', 'ชื่อผู้ส่ง (customer_name)', 'รหัสผู้ส่ง', 'ชอบ', 'ลบออก', 'ซ่อน', 'มีโทรศัพท์', 'มีเอกสารแนบ', 'ผู้ให้บริการ', 'รหัสหน้า (page_id)', 'ID การสนทนา (conversation_id)', 'แทรกที่', 'Link Pancake', 'หมายเหตุ', 'ผู้ใช้ที่ได้รับมอบหมาย', 'หมายเลขโทรศัพท์']

export function messageSheets(rows: Record<string, unknown>[]): Sheet[] {
  return [{ name: 'Sheet1', rows: [MESSAGE_COLUMNS, ...rows.map(r => MESSAGE_COLUMNS.map(c => r[c] ?? null))] }]
}
