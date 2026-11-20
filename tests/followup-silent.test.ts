import { describe, expect, it } from 'vitest'
import { notQueued, silentByDay, silentReport } from '../src/followup/silent'
import { firstRound } from '../src/ui/followup/SilentChats'
import type { FuEvent, FuLead } from '../src/followup/schedule'
import type { FollowItem } from '../src/metrics/conversations'
import type { ConvRow } from '../src/parse/types'

const FB = '100379779472465' as const
const FAT = '516356078238016' as const

const row = (id: string, day: string, tags: string[], pageId: ConvRow['pageId'] = FB): ConvRow => ({
  day, conversationId: id, pageId, firstAt: `${day}T10:00:00+07:00`, lastAt: `${day}T10:30:00+07:00`, firstKind: 'typed',
  msgCount: 2, hasPhone: false, tags, pancakeUrl: `https://pancake.vn/x/${id}`, topics: [],
})
const lead = (id: string, conv: string | null, over: Partial<FuLead> = {}): FuLead => ({
  id, name: id, product: 'มะกอก', ownerId: 'koy', firstDay: '2026-11-18', pageId: FB, chatUrl: '', objection: '', notes: '',
  status: 'active', version: 1, createdAt: '', updatedAt: '', conversationId: conv, source: 'chat', ...over,
})
const ev = (leadId: string, kind: FuEvent['kind'], over: Partial<FuEvent> = {}): FuEvent => ({
  id: 1, leadId, kind, roundNo: null, result: null, dueDay: null, note: '', orderId: null, at: '', by: null, ...over,
})
const item = (conversationId: string) => ({ conversationId }) as FollowItem

describe('silent chats', () => {
  it('notQueued drops chats already in the follow-up queue', () => {
    expect(notQueued([item('a'), item('b')], [lead('L1', 'b'), lead('L2', null)]).map(i => i.conversationId)).toEqual(['a'])
  })

  it('silentByDay lists each page-day file the way the follow list does', () => {
    const by = silentByDay([
      row('a', '2026-11-18', ['2.ขอราคา', 'อ่านไม่ตอบ']),
      row('a', '2026-11-19', ['2.ขอราคา', 'อ่านไม่ตอบ']),
      row('b', '2026-11-19', ['5.พร้อมสั่ง', 'ไม่เปิดอ่าน'], FAT),
      row('c', '2026-11-19', ['2.ขอราคา']), // replied: not silent
    ])
    expect(by.get('2026-11-18')).toEqual([{ conversationId: 'a', pageId: FB }])
    expect(by.get('2026-11-19')?.map(x => x.conversationId).sort()).toEqual(['a', 'b'])
  })

  it('silentReport counts distinct listed chats, followed ones (a round or status recorded) and won ones', () => {
    const by = new Map([
      ['2026-11-17', [{ conversationId: 'old', pageId: FB }]],
      ['2026-11-18', [{ conversationId: 'a', pageId: FB }, { conversationId: 'b', pageId: FB }]],
      ['2026-11-19', [{ conversationId: 'a', pageId: FB }, { conversationId: 'c', pageId: FAT }, { conversationId: 'd', pageId: FB }]],
    ])
    const leads = [
      lead('La', 'a', { status: 'won' }), lead('Lc', 'c', { ownerId: 'noon' }), lead('Ld', 'd'), lead('Lold', 'old', { status: 'won' }),
    ]
    const events = [
      ev('La', 'round', { roundNo: 1, result: 'won' }), ev('Lc', 'round', { roundNo: 2, result: 'tag' }),
      ev('Ld', 'auto'), ev('Ld', 'skip', { roundNo: 1 }), ev('Lold', 'status', { result: 'won' }),
    ]
    const range = { from: '2026-11-18', to: '2026-11-19' }
    expect(silentReport(by, leads, events, range, 'all', 'all')).toEqual({ listed: 4, followed: 2, won: 1 })
    expect(silentReport(by, leads, events, range, FAT, 'all')).toEqual({ listed: 1, followed: 1, won: 0 })
    // the admin filter narrows followed/won; every listed chat still counts
    expect(silentReport(by, leads, events, range, 'all', 'noon')).toEqual({ listed: 4, followed: 1, won: 0 })
  })

  it('firstRound matches fu_start_chat: past rounds skipped, day 1 no older than today − 59', () => {
    expect(firstRound('2026-11-19', '2026-11-20')).toEqual({ firstDay: '2026-11-19', round: 1 }) // round 1 due 20/11
    expect(firstRound('2026-11-17', '2026-11-20')).toEqual({ firstDay: '2026-11-17', round: 2 }) // round 1 was 18/11
    expect(firstRound('2026-08-01', '2026-11-20')).toEqual({ firstDay: '2026-09-22', round: 7 })
  })
})
