import type { PageId } from '../../src/config/pages'
import type { TagRow } from '../../src/parse/types'

// Non-zero tag counts per page for 29 ต.ค. 2026, from the verified per-page export (counts only, no customer data).
export const DAY29: Record<PageId, Record<string, number>> = {"igo_17841457670184062": {}, "100379779472465": {"1.สนใจ": 47, "2.ขอราคา": 57, "3. ขอโปรโมชั่น": 2, "4.ถามสุขภาพ อากา": 2, "5.พร้อมสั่ง": 11, "8.ลูกค้าเก่า": 3, "9.อื่นๆ .(ทักมั่ว)": 3, "10.เราทักเม้น": 11, "ทักซ้ำไม่ซื้อ": 8, "ไม่เปิดอ่าน": 67, "อ่านไม่ตอบ": 42, "ไม่สนใจ": 1, "29/10": 118, "ปิด": 8, "รอ": 1, "โอน": 3, "มะกอก": 116, "เดลี่ ออยล์": 12, "ตรวจสอบ": 1}, "923678677500634": {"เดลี่ ออยล์": 1, "Magnesium": 1, "8.ลูกค้าเก่า": 1}, "516356078238016": {"ปิด": 19, "รอ": 4, "โอน": 2, "มะกอก": 77, "เดลี่ ออยล์": 20, "Gluta": 2, "ปลายทาง": 1, "1.สนใจ": 25, "2.ขอราคา": 35, "3. ขอโปรโมชั่น": 1, "5.พร้อมสั่ง": 17, "6.ลังเล": 1, "9.อื่นๆ .(ทักมั่ว)": 4, "8.ลูกค้าเก่า": 35, "10.เราทักเม้น": 3, "ทักซ้ำไม่ซื้อ": 15, "ไม่เปิดอ่าน": 48, "อ่านไม่ตอบ": 17, "ไม่สนใจ": 1, "29/10": 70}}

export function tagRows(day: string, counts: Partial<Record<PageId, Record<string, number>>>): TagRow[] {
  return Object.entries(counts).flatMap(([pageId, tags]) =>
    Object.entries(tags!).map(([tag, count]) => ({ day, pageId: pageId as PageId, tag, color: '#000', count })))
}
