import { describe, expect, it } from 'vitest'
import {
  bangkokToday, dueDay, eventBy, GAPS, nextDue, nextRound, planDays, queue, RESULT_LABEL, stateOf, type FuEvent, type FuLead,
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
  it('is due on the due day and overdue after', () => {
    expect(stateOf(lead(), [ev(1)], today)).toBe('due') // round 1 saved 14 Nov → round 2 due 17 Nov
    expect(stateOf(lead(), [], today)).toBe('overdue') // round 1 was due 14 Nov
    expect(stateOf(lead(), [ev(1), { ...ev(2), at: '2026-11-17T03:00:00Z' }], today)).toBe('waiting') // round 2 saved 17 Nov → round 3 due 19 Nov
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

describe('count from the day done (2026-11-23)', () => {
  const at = (day: string) => `${day}T05:00:00Z`
  const done = (r: number, day: string, kind: FuEvent['kind'] = 'round'): FuEvent => ({ ...ev(r, kind), at: at(day) })
  it('keeps the brief gaps', () => {
    expect(GAPS).toEqual([1, 3, 2, 7, 16, 15, 15])
  })
  it('counts the next round from the day the round before was saved', () => {
    // first chat 17 Nov, round 1 due 18 Nov but done 23 Nov → round 2 due 26 Nov, not 21 Nov
    const l = lead({ firstDay: '2026-11-17', createdAt: at('2026-11-17') })
    expect(nextDue(l, [done(1, '2026-11-23')])).toEqual({ round: 2, due: '2026-11-26' })
    expect(nextDue(l, [done(1, '2026-11-23'), done(2, '2026-11-27', 'skip')])).toEqual({ round: 3, due: '2026-11-29' })
    expect(stateOf(l, [done(1, '2026-11-23')], '2026-11-23')).toBe('waiting')
    expect(nextDue(l, [1, 2, 3, 4, 5, 6, 7].map(r => done(r, '2026-11-23')))).toBeNull()
  })
  it('round 1 is day 2 on time, and the entry day when the customer entered late', () => {
    expect(nextDue(lead({ firstDay: '2026-11-17', createdAt: at('2026-11-17') }), [])).toEqual({ round: 1, due: '2026-11-18' })
    expect(nextDue(lead({ firstDay: '2026-11-17', createdAt: at('2026-11-18') }), [])).toEqual({ round: 1, due: '2026-11-18' })
    expect(nextDue(lead({ firstDay: '2026-10-20', createdAt: at('2026-11-23') }), [])).toEqual({ round: 1, due: '2026-11-23' })
  })
  it('uses the Bangkok day of the save', () => {
    const l = lead({ firstDay: '2026-11-17', createdAt: at('2026-11-17') })
    expect(nextDue(l, [{ ...ev(1), at: '2026-11-22T17:30:00Z' }])).toEqual({ round: 2, due: '2026-11-26' }) // 00:30 on 23 Nov
  })
  it('falls back to the fixed day when a date is missing', () => {
    expect(nextDue(lead(), [{ ...ev(1), at: '' }])).toEqual({ round: 2, due: dueDay('2026-11-13', 2) })
    expect(nextDue(lead({ createdAt: 'x' }), [])).toEqual({ round: 1, due: '2026-11-14' })
  })
  it('plans later rounds from the next due day, done rounds on the day saved', () => {
    const l = lead({ firstDay: '2026-11-17', createdAt: at('2026-11-17') })
    expect(planDays(l, [done(1, '2026-11-23')])).toEqual([
      { round: 1, day: '2026-11-23', kind: 'done' }, { round: 2, day: '2026-11-26', kind: 'next' },
      { round: 3, day: '2026-11-28', kind: 'plan' }, { round: 4, day: '2026-12-05', kind: 'plan' },
      { round: 5, day: '2026-12-21', kind: 'plan' }, { round: 6, day: '2027-01-05', kind: 'plan' },
      { round: 7, day: '2027-01-20', kind: 'plan' },
    ])
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
