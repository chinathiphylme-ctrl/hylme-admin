import { describe, expect, it } from 'vitest'
import { parseMessages } from '../src/parse/messages'
import { messageSheets } from './fixtures/build'

const FB = '100379779472465'
const msg = (conv: string, at: string, text: string | null, extra: Record<string, unknown> = {}) => ({
  'ID ข้อความ': `m-${conv}-${at}`,
  'ประเภทข้อความ': 'INBOX',
  'แท็ก': '29/10, มะกอก,ปิด',
  'เนื้อหาข้อความ': text,
  'ชื่อผู้ส่ง (customer_name)': 'ลูกค้าทดสอบ',
  'รหัสผู้ส่ง': 'sender-1',
  'มีโทรศัพท์': false,
  'รหัสหน้า (page_id)': FB,
  'ID การสนทนา (conversation_id)': conv,
  'แทรกที่': at,
  'Link Pancake': `https://pancake.vn/x?c_id=${conv}`,
  'หมายเหตุ': 'โน้ตลับ',
  'ผู้ใช้ที่ได้รับมอบหมาย': 'แอดมินทดสอบ',
  'หมายเลขโทรศัพท์': '0800000000',
  ...extra,
})

const parse = (rows: Record<string, unknown>[]) => {
  const r = parseMessages(messageSheets(rows), 'm.xlsx')
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('parseMessages', () => {
  it('orders rows by time within a conversation', () => {
    const r = parse([
      msg('c1', '29/10/2026 12:05:00', 'ราคา'),
      msg('c1', '29/10/2026 11:00:00', 'สนใจ'),
      msg('c1', '29/10/2026 13:00:00', null),
    ])
    expect(r.convs).toHaveLength(1)
    const c = r.convs[0]
    expect(c.firstAt).toBe('2026-10-29T11:00:00+07:00')
    expect(c.lastAt).toBe('2026-10-29T13:00:00+07:00')
    expect(c.firstKind).toBe('button')
    expect(c.msgCount).toBe(3)
    expect(r.messageCount).toBe(3)
  })

  it('classifies the first message', () => {
    const r = parse([msg('c1', '29/10/2026 10:00:00', ''), msg('c2', '29/10/2026 10:00:00', 'มีตราฮาลาลไม่คะ')])
    expect(r.convs.find(c => c.conversationId === 'c1')!.firstKind).toBe('media')
    expect(r.convs.find(c => c.conversationId === 'c2')!.firstKind).toBe('typed')
  })

  it('takes tags from the latest row', () => {
    const r = parse([
      msg('c1', '29/10/2026 10:00:00', 'สนใจ', { 'แท็ก': '29/10' }),
      msg('c1', '29/10/2026 11:00:00', 'โอนแล้ว', { 'แท็ก': '29/10, มะกอก,ปิด' }),
    ])
    expect(r.convs[0].tags).toEqual(['29/10', 'มะกอก', 'ปิด'])
  })

  it.each([true, 'True', 'true', 'TRUE'])('reads has-phone %s', v => {
    const r = parse([msg('c1', '29/10/2026 10:00:00', 'สนใจ'), msg('c1', '29/10/2026 10:01:00', 'x', { 'มีโทรศัพท์': v })])
    expect(r.convs[0].hasPhone).toBe(true)
  })

  it('keeps no customer PII', () => {
    const r = parse([msg('c1', '29/10/2026 10:00:00', 'ข้อความลับของลูกค้า'), msg('c1', '29/10/2026 10:01:00', 'อยู่บ้านเลขที่ 9')])
    const json = JSON.stringify(r)
    for (const s of ['ลูกค้าทดสอบ', '0800000000', 'ข้อความลับของลูกค้า', 'อยู่บ้านเลขที่ 9', 'sender-1', 'โน้ตลับ', 'แอดมินทดสอบ']) {
      expect(json).not.toContain(s)
    }
  })

  it('uses the day of the last message', () => {
    const r = parse([
      msg('c1', '28/10/2026 23:50:00', 'สนใจ'),
      msg('c1', '29/10/2026 00:10:00', 'ราคา'),
      msg('c2', '29/10/2026 09:00:00', 'สนใจ'),
    ])
    expect(r.convs.find(c => c.conversationId === 'c1')!.day).toBe('2026-10-29')
    expect(r.days).toEqual(['2026-10-29'])
    expect(r.pageIds).toEqual([FB])
  })

  it('reads Excel date serials as Bangkok time', () => {
    // 46324.5 = 29/10/2026 12:00
    const r = parse([msg('c1', 46324.5, 'สนใจ')])
    expect(r.convs[0].firstAt).toBe('2026-10-29T12:00:00+07:00')
  })

  it('rejects other pages', () => {
    const r = parseMessages(messageSheets([msg('c1', '29/10/2026 10:00:00', 'สนใจ', { 'รหัสหน้า (page_id)': '999' })]), 'm.xlsx')
    expect(r).toEqual({ ok: false, fileName: 'm.xlsx', error: 'ไม่พบเพจของ Hylme ในไฟล์นี้' })
  })
})
