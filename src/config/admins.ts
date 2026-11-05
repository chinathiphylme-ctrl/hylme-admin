// Pancake staff account names → the nickname the team uses. Only the nickname is saved.
const STAFF: Record<string, string> = {
  'จิตรานนท์ ชิตานุช': 'พี่ก้อย',
  'kanpriyanaka Noon': 'นุ่น',
}

export const NO_ADMIN = 'ไม่ระบุ'

export function adminOf(staff: unknown): string {
  const s = String(staff ?? '').trim()
  return STAFF[s] ?? (s || NO_ADMIN)
}
