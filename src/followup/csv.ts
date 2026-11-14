import { pageName, type PageId } from '../config/pages'
import { dueDay, nextRound, STATE_LABEL, stateOf, type FuEvent, type FuLead, type LeadStatus } from './schedule'

export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++ } else quoted = !quoted
    } else if (c === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      if (row.some(s => s !== '')) rows.push(row)
      row = []; cell = ''
    } else cell += c
  }
  row.push(cell)
  if (row.some(s => s !== '')) rows.push(row)
  return rows
}

// a cell starting with = + - @ would run as a formula in Excel
const cell = (v: unknown) => {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function exportCsv(leads: FuLead[], events: FuEvent[], names: Map<string, string>, today: string): string {
  const head = ['ชื่อ/รหัสลูกค้า', 'สินค้า', 'ผู้ดูแล', 'เพจ', 'ลิงก์แชต', 'วันที่คุยครั้งแรก', 'เหตุผลที่ยังไม่ซื้อ', 'บันทึก', 'สถานะ', 'รอบถัดไป', 'วันติดตามถัดไป', 'ติดตามแล้ว (ครั้ง)']
  const rows = leads.map(l => {
    const evs = events.filter(e => e.leadId === l.id)
    const r = l.status === 'active' ? nextRound(evs) : null
    return [l.name, l.product, names.get(l.ownerId) ?? '', l.pageId ? pageName(l.pageId) : '', l.chatUrl, l.firstDay, l.objection, l.notes,
      STATE_LABEL[stateOf(l, evs, today)], r ?? '', r ? dueDay(l.firstDay, r) : '', evs.filter(e => e.kind === 'round').length]
  })
  return '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
}

export type LegacyRow = {
  name: string; product: string; ownerName: string; pageId: PageId | null; chatUrl: string; firstDay: string
  objection: string; notes: string; status: LeadStatus; history: { round: number; day: string; note: string }[]
}

// channel names used by the old HTML app
const LEGACY_PAGES: Record<string, PageId> = {
  'Facebook Page HYLME': '100379779472465',
  'Facebook เรื่องไขมัน': '516356078238016',
  'Facebook เรื่องนอน': '923678677500634',
  'Instagram': 'igo_17841457670184062',
}
const STATUSES: LeadStatus[] = ['active', 'won', 'optout', 'paused']
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function parseLegacyCsv(text: string): { rows: LegacyRow[]; skipped: number } {
  const [head = [], ...body] = parseCsv(text.replace(/^﻿/, ''))
  const need = ['ชื่อ/รหัสลูกค้า', 'สินค้า', 'ผู้ดูแล', 'วันที่คุยครั้งแรก', 'สถานะ']
  if (!need.every(k => head.includes(k))) throw new Error('รูปแบบ CSV ไม่ถูกต้อง ใช้ไฟล์ที่ส่งออกจากเว็บแอปติดตามลูกค้าตัวเดิม')
  const get = (r: string[], k: string) => (head.indexOf(k) < 0 ? '' : (r[head.indexOf(k)] ?? '').trim())
  const rows: LegacyRow[] = []
  let skipped = 0
  for (const r of body) {
    const name = get(r, 'ชื่อ/รหัสลูกค้า'), product = get(r, 'สินค้า'), firstDay = get(r, 'วันที่คุยครั้งแรก')
    if (!name || !product || !DAY.test(firstDay)) { skipped++; continue }
    let raw: unknown = []
    try { raw = JSON.parse(get(r, 'ประวัติ7รอบJSON') || '[]') } catch { raw = [] }
    const history = (Array.isArray(raw) ? raw : [])
      .map(h => ({ round: Number(h?.round), day: String(h?.doneDate ?? ''), note: String(h?.note ?? '').slice(0, 350) }))
      .filter(h => Number.isInteger(h.round) && h.round >= 1 && h.round <= 7 && DAY.test(h.day))
    const status = get(r, 'สถานะ') as LeadStatus
    rows.push({
      name: name.slice(0, 120), product, ownerName: get(r, 'ผู้ดูแล'), pageId: LEGACY_PAGES[get(r, 'ช่องทาง')] ?? null,
      chatUrl: /^https?:\/\//.test(get(r, 'ลิงก์แชต')) ? get(r, 'ลิงก์แชต') : '', firstDay,
      objection: get(r, 'เหตุผลไม่ซื้อ'), notes: get(r, 'บันทึก').slice(0, 1000),
      status: STATUSES.includes(status) ? status : 'active', history,
    })
  }
  return { rows, skipped }
}
