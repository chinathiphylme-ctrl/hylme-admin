export type Group = string

// indexes 6 and 7 are the "lost" stages
export const STAGE_GROUPS = ['เริ่มสนใจ', 'ติดเรื่องราคา', 'ลังเล', 'พร้อมสั่ง', 'ปิดการขาย', 'ออเดอร์ค้าง/มีปัญหา', 'เงียบหาย', 'ไม่ซื้อ'] as const

export const ALL_GROUPS: string[] = ['ยังไม่จัดกลุ่ม', ...STAGE_GROUPS, 'ที่มาลูกค้า', 'โฆษณา', 'สินค้า', 'เรื่องสุขภาพ', 'การชำระเงิน', 'สะสมแต้ม', 'แอดมิน', 'อื่นๆ']

const BY_NUMBER: Record<string, Group> = {
  1: 'เริ่มสนใจ', 4: 'เริ่มสนใจ',
  2: 'ติดเรื่องราคา', 3: 'ติดเรื่องราคา', 7: 'ติดเรื่องราคา',
  6: 'ลังเล', 5: 'พร้อมสั่ง',
  8: 'ที่มาลูกค้า', 9: 'ที่มาลูกค้า', 10: 'ที่มาลูกค้า',
}

const BY_NAME: Record<string, Group> = {
  'ปิด': 'ปิดการขาย',
  'รอ': 'ออเดอร์ค้าง/มีปัญหา', 'ตรวจสอบ': 'ออเดอร์ค้าง/มีปัญหา', 'ยกเลิก': 'ออเดอร์ค้าง/มีปัญหา', 'โอนเงินคืน': 'ออเดอร์ค้าง/มีปัญหา',
  'ไม่เปิดอ่าน': 'เงียบหาย', 'อ่านไม่ตอบ': 'เงียบหาย',
  'ทักซ้ำไม่ซื้อ': 'ไม่ซื้อ', 'ไม่สนใจ': 'ไม่ซื้อ',
  'โอน': 'การชำระเงิน', 'ปลายทาง': 'การชำระเงิน',
  'รอสะสมแต้ม': 'สะสมแต้ม', 'สะสมแต้มแล้ว': 'สะสมแต้ม',
  'นุ่น🤍': 'แอดมิน', 'พี่ก้อย': 'แอดมิน',
  'มะกอก': 'สินค้า', 'เดลี่ ออยล์': 'สินค้า', 'Gluta': 'สินค้า', 'Magnesium': 'สินค้า',
  'ความดัน': 'เรื่องสุขภาพ', 'อาการชา': 'เรื่องสุขภาพ', 'เบาหวาน': 'เรื่องสุขภาพ', 'ไขมัน': 'เรื่องสุขภาพ',
}

// rule order from spec §7: override, date, ad id, numbered prefix, name, unassigned
export function groupOf(tag: string, overrides: Record<string, string>): Group | 'วันที่' {
  const t = tag.trim()
  if (overrides[t]) return overrides[t]
  if (/^\d{1,2}\/\d{1,2}$/.test(t)) return 'วันที่'
  if (/^\d{12,}$/.test(t)) return 'โฆษณา'
  const m = t.match(/^(\d+)\.?\s*\D/)
  if (m && BY_NUMBER[m[1]]) return BY_NUMBER[m[1]]
  return BY_NAME[t] ?? 'ยังไม่จัดกลุ่ม'
}

export function dateTag(day: string): string {
  const [, m, d] = day.split('-')
  return `${Number(d)}/${Number(m)}`
}
