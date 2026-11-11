import { describe, expect, it } from 'vitest'
import { adminCloses } from '../src/metrics/admins'
import type { Lead } from '../src/metrics/leads'
const FB = '100379779472465'
const lead = (over: Partial<Lead> = {}): Lead => ({
  conversationId: 'c', pageId: FB, startDay: '2026-11-04', lastDay: '2026-11-08', isNew: false,
  tags: ['พี่ก้อย'], topics: [], msgs: 1, days: 1, phone: false, typedFirst: false, closed: true, ads: [], ...over,
})
const range = { from: '2026-11-01', to: '2026-11-10' }
describe('adminCloses', () => {
  it('counts shared chats for both admins, including returning customers', () => {
    expect(adminCloses([lead({ tags: ['พี่ก้อย', 'นุ่น🤍'] }), lead({ closed: false })], range, 'all')).toEqual([
      { admin: 'พี่ก้อย', chats: 2, closed: 1, rate: 50 }, { admin: 'นุ่น', chats: 1, closed: 1, rate: 100 },
    ])
  })
  it('excludes pre-policy chats, other pages and start dates outside the chosen range', () => {
    const r = adminCloses([lead({ startDay: '2026-11-03' }), lead({ pageId: '516356078238016' }), lead({ startDay: '2026-11-11' })], range, FB)
    expect(r.every(a => a.chats === 0 && a.closed === 0 && a.rate === null)).toBe(true)
    expect(adminCloses([lead()], { from: '2026-11-05', to: '2026-11-10' }, 'all')[0].chats).toBe(0)
  })
})
