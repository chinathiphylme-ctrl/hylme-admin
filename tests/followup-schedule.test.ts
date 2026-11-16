import { describe, expect, it } from 'vitest'
import {
  bangkokToday, dueDay, eventBy, nextRound, queue, RESULT_LABEL, stateOf, type FuEvent, type FuLead,
} from '../src/followup/schedule'

const lead = (o: Partial<FuLead> = {}): FuLead => ({
  id: 'L1', name: 'ลูกค้า ก', product: 'EVOO 250 มล.', ownerId: 'u1', firstDay: '2026-11-13', pageId: null,
  chatUrl: '', objection: '', notes: '', status: 'active', version: 1, createdAt: '', updatedAt: '', conversationId: null, source: 'manual', ...o,
})
const ev = (roundNo: number, kind: FuEvent['kind'] = 'round', leadId = 'L1'): FuEvent => ({
  id: roundNo, leadId, kind, roundNo, result: kind === 'round' ? 'sent' : null, dueDay: null, note: '', orderId: null,
  at: '2026-11-14T03:00:00Z', by: 'u1',
})

describe('due days', () => {
  it('counts the first chat as day 1 (brief p.9 example)', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(r => dueDay('2026-11-13', r))).toEqual([
      '2026-11-14', '2026-11-17', '2026-11-19', '2026-11-26', '2026-12-12', '2026-12-27', '2027-01-11',
    ])
  })
  it('is right across month ends and leap years', () => {
    expect(dueDay('2026-01-31', 1)).toBe('2026-02-01')
    expect(dueDay('2026-01-31', 5)).toBe('2026-03-01')
    expect(dueDay('2028-02-28', 1)).toBe('2028-02-29')
    expect(dueDay('2026-12-25', 7)).toBe('2027-02-22')
  })
})

describe('next round', () => {
  it('is the lowest round with neither a record nor a skip', () => {
    expect(nextRound([])).toBe(1)
    expect(nextRound([ev(1), ev(2, 'skip')])).toBe(3)
    expect(nextRound([1, 2, 3, 4, 5, 6, 7].map(r => ev(r)))).toBeNull()
  })
  it('ignores non-round events', () => {
    expect(nextRound([{ ...ev(1), kind: 'status', roundNo: null }])).toBe(1)
  })
})

describe('state', () => {
  const today = '2026-11-17'
  it('is due on the due day and overdue after, and the due day does not move when late', () => {
    expect(stateOf(lead(), [ev(1)], today)).toBe('due') // round 2 due 17 Nov
    expect(stateOf(lead(), [], today)).toBe('overdue') // round 1 was due 14 Nov
    expect(stateOf(lead(), [ev(1), ev(2)], today)).toBe('waiting') // round 3 due 19 Nov
  })
  it('stops for won, opt-out and pause whatever the dates', () => {
    expect(stateOf(lead({ status: 'won' }), [], today)).toBe('won')
    expect(stateOf(lead({ status: 'optout' }), [], today)).toBe('optout')
    expect(stateOf(lead({ status: 'paused' }), [], today)).toBe('paused')
  })
  it('is completed after 7 rounds', () => {
    expect(stateOf(lead(), [1, 2, 3, 4, 5, 6, 7].map(r => ev(r)), today)).toBe('completed')
  })
})

describe('queue', () => {
  it('puts overdue first, then due today, then upcoming, each by due date', () => {
    const leads = [
      lead({ id: 'up', firstDay: '2026-11-16' }), // r1 due 17 → due
      lead({ id: 'late2', firstDay: '2026-11-10' }), // r1 due 11 → overdue
      lead({ id: 'late1', firstDay: '2026-11-01' }), // r1 due 2 → overdue, older
      lead({ id: 'later', firstDay: '2026-11-17' }), // r1 due 18 → waiting
      lead({ id: 'won', status: 'won' }),
    ]
    const rows = queue(leads, [], '2026-11-17')
    expect(rows.map(r => r.lead.id)).toEqual(['late1', 'late2', 'up', 'later'])
    expect(rows[0]).toMatchObject({ state: 'overdue', round: 1, due: '2026-11-02', daysLate: 15 })
  })
})

describe('bangkok today', () => {
  it('uses Thai time, not the device clock', () => {
    expect(bangkokToday(new Date('2026-11-13T17:30:00Z'))).toBe('2026-11-14')
    expect(bangkokToday(new Date('2026-11-13T16:59:00Z'))).toBe('2026-11-13')
  })
})

describe('entries the system made', () => {
  const staff = [{ id: 'u1', name: 'พี่ก้อย', role: 'admin' as const, active: true }]
  it('names who recorded an entry, or ระบบ when nobody did', () => {
    expect(eventBy(null, staff)).toBe('ระบบ')
    expect(eventBy('u1', staff)).toBe('พี่ก้อย')
    expect(eventBy('x', staff)).toBe('—')
  })
  it('labels rounds read from Pancake tags and counts them as done', () => {
    expect(RESULT_LABEL.tag).toBe('ทำแล้ว (จากแท็ก Pancake)')
    const fromTag: FuEvent = { ...ev(1), result: 'tag', by: null }
    expect(nextRound([fromTag])).toBe(2)
  })
})
