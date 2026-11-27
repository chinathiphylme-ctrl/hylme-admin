import { describe, expect, it } from 'vitest'
import { checkByDay, missingOf } from '../src/metrics/tagCheck'
import type { ConvRow } from '../src/parse/types'

let n = 0
const conv = (tags: string[], over: Partial<ConvRow> = {}): ConvRow => ({
  day: '2026-11-26',
  conversationId: `c${++n}`,
  pageId: '100379779472465',
  firstAt: '2026-11-26T10:00:00+07:00',
  lastAt: '2026-11-26T12:30:00+07:00',
  msgCount: 2,
  firstKind: 'typed',
  hasPhone: false,
  tags,
  topics: [],
  pancakeUrl: 'https://pancake.vn/x',
  ...over,
})

describe('missingOf', () => {
  it('complete chats pass', () => {
    expect(missingOf(['พี่ก้อย', '2.ขอราคา'])).toEqual([])
    expect(missingOf(['นุ่น🤍', 'ปิดAds', 'ส่วนผสม'])).toEqual([])
    expect(missingOf(['นุ่น🤍', '1.สนใจ', 'อ่านไม่ตอบ', 'ราคาแพง'])).toEqual([])
  })
  it('flags each rule', () => {
    expect(missingOf(['2.ขอราคา'])).toEqual(['admin'])
    expect(missingOf(['พี่ก้อย', 'มะกอก'])).toEqual(['stage'])
    expect(missingOf(['พี่ก้อย', 'ปิด'])).toEqual(['buyReason', 'plainClose'])
    expect(missingOf(['พี่ก้อย', '6.ลังเล', 'ไม่เปิดอ่าน'])).toEqual(['lostReason'])
    expect(missingOf([])).toEqual(['admin', 'stage'])
  })
  it('trims tags', () => {
    expect(missingOf([' พี่ก้อย', ' ปิดAds ', 'ส่วนผสม '])).toEqual([])
  })
  it('closed chat skips stage and silent rules', () => {
    expect(missingOf(['พี่ก้อย', 'ปิดOrganic', 'อ่านไม่ตอบ', 'เคยใช้และพอใจ'])).toEqual([])
  })
  it('plain ปิด next to ปิดAds is not flagged', () => {
    expect(missingOf(['พี่ก้อย', 'ปิด', 'ปิดAds', 'โปรโมชั่น'])).toEqual([])
  })
})

describe('checkByDay', () => {
  it('groups per day newest first, counts rules, admins and incomplete chats', () => {
    const r = checkByDay([
      conv(['พี่ก้อย', '2.ขอราคา']),
      conv(['พี่ก้อย', 'นุ่น🤍', 'ปิด'], { conversationId: 'x', lastAt: '2026-11-26T09:00:00+07:00' }),
      conv(['อ่านไม่ตอบ'], { conversationId: 'y', lastAt: '2026-11-26T15:00:00+07:00', pageId: '516356078238016' }),
      conv(['นุ่น🤍', '1.สนใจ'], { day: '2026-11-25' }),
    ])
    expect(r.map(d => d.day)).toEqual(['2026-11-26', '2026-11-25'])
    const d = r[0]
    expect([d.total, d.complete]).toEqual([3, 1])
    expect(d.pageIds).toEqual(['100379779472465', '516356078238016'])
    expect(d.counts.admin).toEqual({ missing: 1, of: 3 })
    expect(d.counts.stage).toEqual({ missing: 1, of: 2 })
    expect(d.counts.buyReason).toEqual({ missing: 1, of: 1 })
    expect(d.counts.plainClose).toEqual({ missing: 1, of: 1 })
    expect(d.counts.lostReason).toEqual({ missing: 1, of: 1 })
    expect(d.byAdmin).toEqual([
      { admin: 'พี่ก้อย', incomplete: 1, of: 2 }, { admin: 'นุ่น', incomplete: 1, of: 1 }, { admin: 'ไม่มีชื่อ', incomplete: 1, of: 1 }])
    expect(d.incomplete.map(i => i.conv.conversationId)).toEqual(['y', 'x'])
    expect(d.incomplete[0].missing).toEqual(['admin', 'stage', 'lostReason'])
    expect(r[1].byAdmin).toEqual([{ admin: 'นุ่น', incomplete: 0, of: 1 }])
  })

  it('counts a chat once when two files of the same day hold it, using the later one', () => {
    const r = checkByDay([
      conv(['2.ขอราคา'], { conversationId: 'z', lastAt: '2026-11-26T10:00:00+07:00' }),
      conv(['พี่ก้อย', '2.ขอราคา'], { conversationId: 'z', lastAt: '2026-11-26T18:00:00+07:00' }),
      conv(['พี่ก้อย'], { conversationId: 'z', lastAt: '2026-11-26T12:00:00+07:00' }),
    ])
    expect([r[0].total, r[0].complete, r[0].incomplete.length]).toEqual([1, 1, 0])
  })
})
