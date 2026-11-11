import { QUOTE_CATEGORIES } from '../metrics/quotes'
import { BUTTON_RE } from './buttons'

export const TOPICS = QUOTE_CATEGORIES.filter((t): t is Exclude<typeof t, 'อื่นๆ'> => t !== 'อื่นๆ')
export type Topic = typeof TOPICS[number]
export const CANDIDATE_ORDER: Topic[] = [
  'กลัวผลข้างเคียง', 'ขอคิดก่อน', 'ไม่มั่นใจ/ขอรีวิว', 'เทียบยี่ห้ออื่น', 'อาการ/สุขภาพ', 'คำชม', 'ราคา/แพง',
]
const KEYWORDS: Record<Topic, RegExp> = {
  'ราคา/แพง': /แพง|ส่วนลด|ลดได้|ลดหน่อย|ถูกกว่า|โปร/,
  'ไม่มั่นใจ/ขอรีวิว': /รีวิว|ได้ผล|เห็นผล|จริงไหม|จริงมั้ย|ของแท้|อย\./,
  'อาการ/สุขภาพ': /เบาหวาน|น้ำตาล|ความดัน|ไขมัน|คอเลส|นอนไม่หลับ|หลับยาก|ชา|หัวใจ|ไต|ตับ|ปวด/,
  'กลัวผลข้างเคียง': /ผลข้างเคียง|กินยา|ทานยา|กินคู่|ทานคู่|แพ้|ปลอดภัย|หมอ/,
  'ขอคิดก่อน': /คิดดู|ขอคิด|ไว้ก่อน|ปรึกษา|ถาม(?:ลูก|แฟน|สามี)/,
  'เทียบยี่ห้ออื่น': /ยี่ห้อ|ที่อื่น|แบรนด์|เคยกิน|เคยทาน/,
  'ส่งของ/จ่ายเงิน': /ปลายทาง|เก็บเงิน|โอน|ค่าส่ง|กี่วัน|จัดส่ง/,
  'คำชม': /ดีมาก|ชอบ|ขอบคุณ.*ดี|ได้ผลดี|หลับดี|ดีขึ้น/,
}

export function topicsOf(text: string): Topic[] {
  const t = text.trim()
  return !t || BUTTON_RE.test(t) ? [] : TOPICS.filter(topic => KEYWORDS[topic].test(t))
}
