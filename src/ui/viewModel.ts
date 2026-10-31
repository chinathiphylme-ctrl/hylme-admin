import { stuckRanking, type Summary } from '../metrics/daily'

export const CRIT = '#C2410C'
export const WARN = '#B45309'
export const GOOD = '#1F7A4A'
export const ACCENT = '#1E6B4F'

export const ADVICE: Record<string, string> = {
  'เงียบหาย': 'ตามภายใน 1–2 ชั่วโมงหลังลูกค้าทัก ข้อความสั้น จบด้วยคำถามที่เลือกตอบง่าย',
  'ติดเรื่องราคา': 'ส่งราคาพร้อมรีวิวและชุดคุ้มในข้อความเดียว แล้วถามต่อทันทีว่าจะรับแบบไหน',
  'เริ่มสนใจ': 'ถามอาการหรือเป้าหมายก่อน แล้วแนะนำสินค้าที่ตรง พาไปถึงขั้นถามราคา',
  'พร้อมสั่ง': 'ขอที่อยู่และส่งเลขบัญชีหรือเสนอเก็บปลายทางทันที อย่าปล่อยข้ามวัน',
  'ไม่ซื้อ': 'ถามเหตุผลสั้นๆ แล้วติดแท็กเหตุผลไว้ จะเห็นปัญหาจริงในวันถัดไป',
  'ออเดอร์ค้าง/มีปัญหา': 'เคลียร์แชท “รอ” และ “ตรวจสอบ” ให้จบภายในวัน',
  'ลังเล': 'ส่งรีวิวลูกค้าจริง หรือเสนอเก็บเงินปลายทางเพื่อลดความกังวล',
}

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'))

export function thaiDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

export function thaiDayLong(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `วัน${WEEKDAYS[wd]}ที่ ${d} ${MONTHS_LONG[m - 1]} ${y}`
}

export const thaiMonth = (y: number, m: number) => `${MONTHS_LONG[m - 1]} ${y}`

export function rangeLabel(from: string, to: string): string {
  return from === to ? thaiDay(from) : `${thaiDay(from)} – ${thaiDay(to)}`
}

export const rateColor = (r: number | null) => (r == null ? '#7A8981' : r < 10 ? CRIT : r >= 20 ? GOOD : WARN)

export function deltaText(now: number, before: number, hasBefore: boolean): string {
  if (!hasBefore) return '—'
  const d = now - before
  if (d === 0) return 'เท่ากับช่วงก่อน'
  return `${d > 0 ? '+' : ''}${fmt(d)} จากช่วงก่อน`
}

export function fixList(s: Summary) {
  return stuckRanking(s).slice(0, 4).map(j => ({
    group: j.group,
    name: j.group === 'พร้อมสั่ง' ? 'พร้อมสั่งแต่ยังไม่ปิด' : j.group,
    count: j.count,
    advice: ADVICE[j.group] ?? '',
  }))
}

export type Insight = { kind: string; tone: 'crit' | 'warn' | 'info'; text: string }

export function buildInsights(x: {
  readySilent: number
  priceRead: number
  priceUnread: number
  convNew: number
  closedNew: number
  convLabel: string
  pages: { name: string; newChats: number; closed: number; old: number }[]
}): Insight[] {
  const out: Insight[] = []
  if (x.readySilent) {
    out.push({ kind: 'ตามด่วน', tone: 'crit', text: `ลูกค้าพร้อมสั่ง ${fmt(x.readySilent)} แชทยังเงียบอยู่ (${x.convLabel}) เป็นกลุ่มที่ปิดง่ายที่สุด ควรตามก่อน` })
  }
  if (x.priceRead + x.priceUnread) {
    out.push({
      kind: 'ขอราคาแล้วเงียบ', tone: 'crit',
      text: `ลูกค้าขอราคาแล้วเงียบ ${fmt(x.priceRead + x.priceUnread)} แชท ยังไม่เปิดอ่าน ${fmt(x.priceUnread)} อ่านแล้วไม่ตอบ ${fmt(x.priceRead)} (${x.convLabel})`,
    })
  }
  if (x.convNew) {
    out.push({
      kind: 'แชทใหม่ยังไม่ปิด', tone: 'warn',
      text: `แชทใหม่ ${fmt(x.convNew)} แชท (${x.convLabel}) มีแท็กปิดแค่ ${fmt(x.closedNew)} แชท ณ ตอน export แชทใหม่ส่วนใหญ่ต้องตามต่อวันถัดไป`,
    })
  }
  const active = x.pages.filter(p => p.newChats > 0)
  if (active.length >= 2) {
    const byRate = [...active].sort((a, b) => b.closed / b.newChats - a.closed / a.newChats)
    const best = byRate[0]
    const worst = byRate[byRate.length - 1]
    let text = `${best.name}ปิดได้ ${fmt(best.closed)} จาก ${fmt(best.newChats)} แชทใหม่ ส่วน ${worst.name} ปิด ${fmt(worst.closed)} จาก ${fmt(worst.newChats)}`
    if (best.old > worst.old) {
      text += ` แต่${best.name}มีลูกค้าเก่า ${fmt(best.old)} แชท ${worst.name}มีแค่ ${fmt(worst.old)} ส่วนต่างส่วนหนึ่งน่าจะมาจากลูกค้าเก่าที่กลับมาซื้อ`
    }
    out.push({ kind: 'เทียบเพจ', tone: 'info', text })
  }
  return out
}
