// Pancake staff account names → the nickname the team uses. Only the nickname is saved.
const STAFF: Record<string, string> = {
  'จิตรานนท์ ชิตานุช': 'พี่ก้อย',
  'kanpriyanaka Noon': 'นุ่น',
}

export const NO_ADMIN = 'ไม่ระบุ'
export const ADMIN_TAGS: Record<string, string> = { 'พี่ก้อย': 'พี่ก้อย', 'นุ่น🤍': 'นุ่น' }
export const NAME_TAG_FROM = '2026-11-04'
// Excluded from this admin-sales report at the team's request; source orders are retained.
export const EXCLUDED_SALES_ADMINS = new Set(['chinathiphylme'])

export function adminOf(staff: unknown): string {
  const s = String(staff ?? '').trim()
  return STAFF[s] ?? (s || NO_ADMIN)
}
