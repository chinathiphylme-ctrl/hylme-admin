import type { PageId } from '../config/pages'

export const QUOTE_CATEGORIES = [
  'ราคา/แพง', 'ไม่มั่นใจ/ขอรีวิว', 'อาการ/สุขภาพ', 'กลัวผลข้างเคียง', 'ส่งของ/จ่ายเงิน', 'เทียบยี่ห้ออื่น', 'คำชม', 'อื่นๆ',
] as const
export type QuoteCategory = typeof QUOTE_CATEGORIES[number]

export type Quote = {
  id: number; createdAt: string; day: string; pageId: PageId
  category: QuoteCategory; quote: string; note: string
}

export const QUOTE_MAX = 500

// 9+ digits with optional spaces or dashes between them (Thai mobiles, landlines, +66); prices and dates stay
const PHONE = /\+?\d(?:[\s-]?\d){8,}/g
export const maskPhones = (text: string) => text.replace(PHONE, '[เบอร์]')

export function categoryCounts(quotes: Quote[]): [QuoteCategory, number][] {
  return QUOTE_CATEGORIES.map(c => [c, quotes.filter(q => q.category === c).length])
}

export type QuoteFilter = { category: QuoteCategory | 'all'; page: PageId | 'all'; from: string | null }

export function filterQuotes(quotes: Quote[], f: QuoteFilter): Quote[] {
  return quotes
    .filter(q => (f.category === 'all' || q.category === f.category)
      && (f.page === 'all' || q.pageId === f.page)
      && (!f.from || q.day >= f.from))
    .sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id)
}
