import { describe, expect, it } from 'vitest'
import { ADDRESS_RE, parseMessages, pickCandidates } from '../src/parse/messages'
import { toDbConv } from '../src/data/mappers'
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

describe('topics and in-memory candidates', () => {
  const m = (conv: string, text: string, at = '2026-11-06T10:00:00+07:00') => ({ conv, text, at, page: FB as '100379779472465' })
  it('unions topics per chat and never copies sentences into persisted rows', () => {
    const r = parse([msg('c1', '6/11/2026 10:00:00', 'แพงจัง'), msg('c1', '6/11/2026 11:00:00', 'ส่งปลายทางได้ไหม')])
    expect(r.convs[0].topics).toEqual(['ราคา/แพง', 'ส่งของ/จ่ายเงิน'])
    const persisted = JSON.stringify(r.convs.map(toDbConv))
    expect(persisted).not.toContain('แพงจัง')
    expect(persisted).not.toContain('ส่งปลายทางได้ไหม')
    expect(persisted).not.toContain('text')
  })
  it.each([
    'บ้านเลขที่ 12 ม.3 ต.บางรัก 0812345678 ส่งปลายทางค่ะ',
    'ขอรีวิวหน่อยค่ะ อยู่ตำบลบางรัก', 'แพงจังค่ะ ส่งไปที่ถนนสุขุมวิท',
    'ขอรีวิวหน่อยค่ะ ไปรษณีย์ 10110', 'แพงจังค่ะ ติดต่อ a@example.com',
    'แพงจัง', 'สนใจ', 'ราคา', 'ช่วยเช็คราคาสินค้าหน่อยได้ไหม', 'แพง'.repeat(101),
    'จัดส่งปลายทางได้ไหมคะ',
  ])('excludes private or ineligible sentence: %s', text => expect(pickCandidates([m('a', text)])).toEqual([]))
  it('masks phones, keeps a rare topic first, and strips internal sort timestamps', () => {
    expect(pickCandidates([m('a', 'โทรมา 0812345678 ถามว่ากินคู่ยาความดันได้ไหมคะ')])).toEqual([
      { conversationId: 'a', pageId: FB, day: '2026-11-06', text: 'โทรมา [เบอร์] ถามว่ากินคู่ยาความดันได้ไหมคะ', topic: 'กลัวผลข้างเคียง' },
    ])
  })
  it('takes the earliest eligible sentence per chat before prioritizing rare topics', () => {
    const r = pickCandidates([m('a', 'ขอคิดก่อนนะคะ ขอถามสามีก่อนค่ะ', '2026-11-06T11:00:00+07:00'),
      m('a', 'ราคาแพงจังเลยนะคะ ลดได้อีกไหม'), m('b', 'ขอคิดก่อนนะคะ ขอถามลูกก่อนค่ะ')])
    expect(r.map(c => [c.conversationId, c.topic])).toEqual([['b', 'ขอคิดก่อน'], ['a', 'ราคา/แพง']])
  })
  it('limits each file to thirty distinct chats and rejects addresses after phone masking', () => {
    const r = pickCandidates(Array.from({ length: 40 }, (_, i) => m(`c${i}`, 'ราคาแพงจังเลยนะคะ ลดได้อีกไหม')))
    expect(r).toHaveLength(30)
    expect(new Set(r.map(c => c.conversationId)).size).toBe(30)
    expect(r.every(c => !ADDRESS_RE.test(c.text))).toBe(true)
    expect(pickCandidates([])).toEqual([])
  })
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

  it('splits a chat that crosses midnight into one row per day', () => {
    const r = parse([
      msg('c1', '28/10/2026 23:50:00', 'สนใจ'),
      msg('c1', '29/10/2026 00:10:00', 'ราคา'),
      msg('c2', '29/10/2026 09:00:00', 'สนใจ'),
    ])
    expect(r.convs.filter(c => c.conversationId === 'c1').map(c => c.day).sort()).toEqual(['2026-10-28', '2026-10-29'])
    expect(r.days).toEqual(['2026-10-28', '2026-10-29'])
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

describe('files that span several days', () => {
  it('keeps one row per chat per day, like daily exports', () => {
    const r = parse([
      msg('c1', '29/10/2026 10:00:00', 'สนใจ'),
      msg('c1', '29/10/2026 11:00:00', 'แพงจัง'),
      msg('c1', '2/11/2026 09:00:00', 'ส่งปลายทางได้ไหม', { 'มีโทรศัพท์': true }),
      msg('c2', '2/11/2026 12:00:00', 'สวัสดีค่ะ'),
    ])
    const c1 = r.convs.filter(c => c.conversationId === 'c1').sort((a, b) => a.day.localeCompare(b.day))
    expect(c1.map(c => [c.day, c.msgCount, c.firstKind, c.hasPhone, c.topics])).toEqual([
      ['2026-10-29', 2, 'button', false, ['ราคา/แพง']],
      ['2026-11-02', 1, 'typed', true, ['ส่งของ/จ่ายเงิน']],
    ])
    expect(c1[0].firstAt).toBe('2026-10-29T10:00:00+07:00')
    expect(c1[0].lastAt).toBe('2026-10-29T11:00:00+07:00')
    expect(r.convs).toHaveLength(3)
    expect(r.days).toEqual(['2026-10-29', '2026-11-02'])
  })
})
