import { isPageId, type PageId } from '../config/pages'
import { CONV_ID_COL } from './detect'
import { ERR_NO_PAGE } from './tagStats'
import type { ConvRow, FirstKind, MessagesResult, Sheet } from './types'

export const BUTTON_RE = /^(สนใจ(สั่งซื้อ)?|ราคา(เท่าไร)?|ช่วยเช็คราคาสินค้าหน่อยได้ไหม|ปริมาณ-ราคา)(ค่ะ|ครับ|คะ)?$/
export const ERR_NO_MESSAGE_HEADER = 'หาหัวตารางไฟล์ข้อความไม่เจอ'

const COL = {
  conv: CONV_ID_COL,
  page: 'รหัสหน้า (page_id)',
  at: 'แทรกที่',
  tags: 'แท็ก',
  phone: 'มีโทรศัพท์',
  link: 'Link Pancake',
  text: 'เนื้อหาข้อความ',
}

const pad = (n: number) => String(n).padStart(2, '0')

// `dd/mm/yyyy hh:mm:ss` text or an Excel serial, both as Bangkok wall time
export function toBangkokIso(v: unknown): string | null {
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 864e5))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`
  }
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}T${pad(+m[4])}:${m[5]}:${m[6] ?? '00'}+07:00`
}

function kindOf(text: unknown): FirstKind {
  const t = String(text ?? '').trim()
  if (!t) return 'media'
  return BUTTON_RE.test(t) ? 'button' : 'typed'
}

type Msg = { conv: string; page: PageId; at: string; tags: string; phone: boolean; link: string; kind: FirstKind }

export function parseMessages(sheets: Sheet[], fileName: string): MessagesResult {
  const fail = (error: string): MessagesResult => ({ ok: false, fileName, error })
  const msgs: Msg[] = []
  let sawHeader = false
  for (const s of sheets) {
    const h = s.rows.findIndex(r => r.includes(COL.conv))
    if (h < 0) continue
    sawHeader = true
    const idx = Object.fromEntries(Object.entries(COL).map(([k, name]) => [k, s.rows[h].indexOf(name)])) as Record<keyof typeof COL, number>
    for (const r of s.rows.slice(h + 1)) {
      const conv = String(r[idx.conv] ?? '').trim()
      const page = String(r[idx.page] ?? '').trim()
      const at = toBangkokIso(r[idx.at])
      if (!conv || !at || !isPageId(page)) continue
      // message text is read only here, to classify it, and never stored
      msgs.push({
        conv, page, at,
        tags: String(r[idx.tags] ?? ''),
        phone: String(r[idx.phone]).toLowerCase() === 'true',
        link: String(r[idx.link] ?? ''),
        kind: kindOf(r[idx.text]),
      })
    }
  }
  if (!sawHeader) return fail(ERR_NO_MESSAGE_HEADER)
  if (!msgs.length) return fail(ERR_NO_PAGE)

  const byConv = new Map<string, Msg[]>()
  for (const m of msgs) byConv.set(m.conv, [...(byConv.get(m.conv) ?? []), m])

  const convs: ConvRow[] = [...byConv.values()].map(list => {
    list.sort((a, b) => a.at.localeCompare(b.at))
    const first = list[0]
    const last = list[list.length - 1]
    return {
      day: last.at.slice(0, 10),
      conversationId: first.conv,
      pageId: first.page,
      firstAt: first.at,
      lastAt: last.at,
      msgCount: list.length,
      firstKind: first.kind,
      hasPhone: list.some(m => m.phone),
      tags: last.tags.split(',').map(t => t.trim()).filter(Boolean),
      pancakeUrl: last.link,
    }
  })
  return {
    ok: true,
    fileName,
    convs,
    days: [...new Set(convs.map(c => c.day))].sort(),
    pageIds: [...new Set(convs.map(c => c.pageId))],
    messageCount: msgs.length,
  }
}
