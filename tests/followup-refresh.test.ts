import { describe, expect, it } from 'vitest'
import { changedLeadIds, mergeFollowup, type FollowupData } from '../src/data/followup'
import type { FuEvent, FuLead } from '../src/followup/schedule'

const lead = (id: string, o: Partial<FuLead> = {}): FuLead => ({
  id, name: id, product: 'มะกอก', ownerId: 'u1', firstDay: '2026-11-10', pageId: null, chatUrl: '', objection: '', notes: '',
  status: 'active', version: 1, createdAt: '', updatedAt: 't1', conversationId: null, source: 'tag', ...o,
})
const ev = (id: number, leadId: string): FuEvent => ({ id, leadId, kind: 'round', roundNo: 1, result: 'sent', dueDay: null, note: '', orderId: null, at: '', by: null })
const staff = [{ id: 'u1', name: 'นุ่น', role: 'admin' as const, active: true }]

const prev: FollowupData = {
  staff, links: [],
  leads: [lead('a', { firstDay: '2026-11-09' }), lead('b'), lead('c', { firstDay: '2026-11-12' })],
  events: [ev(1, 'a'), ev(2, 'b'), ev(3, 'c')],
}
const stamp = (l: FuLead) => ({ id: l.id, version: l.version, updatedAt: l.updatedAt })

describe('refresh after a save', () => {
  it('asks again only for customers that are new or whose version or update time moved', () => {
    const stamps = [stamp(prev.leads[0]), { id: 'b', version: 2, updatedAt: 't2' }, { id: 'c', version: 1, updatedAt: 't9' }, { id: 'd', version: 1, updatedAt: 't1' }]
    expect(changedLeadIds(prev.leads, stamps)).toEqual(['b', 'c', 'd'])
    expect(changedLeadIds(prev.leads, prev.leads.map(stamp))).toEqual([])
  })

  it('replaces changed customers, adds new ones, drops deleted ones with their history, keeps order by first day', () => {
    const b2 = lead('b', { version: 2, status: 'won' })
    const d = lead('d', { firstDay: '2026-11-10' })
    const out = mergeFollowup(prev, [stamp(prev.leads[0]), stamp(b2), stamp(d)], {
      leads: [b2, d], events: [ev(3, 'c'), ev(4, 'b'), ev(5, 'd')], staff, links: [{ orderId: 'O1', leadId: 'b', linkedAt: '', linkedBy: 'u1' }],
    })
    expect(out.leads.map(l => [l.id, l.status])).toEqual([['a', 'active'], ['b', 'won'], ['d', 'active']])
    expect(out.events.map(e => e.id)).toEqual([1, 2, 4, 5]) // c was deleted: its history goes too; 3 is not doubled
    expect(out.links).toEqual([{ orderId: 'O1', leadId: 'b', linkedAt: '', linkedBy: 'u1' }])
  })

  it('an event seen again in the overlap is not doubled', () => {
    const out = mergeFollowup(prev, prev.leads.map(stamp), { leads: [], events: [ev(2, 'b'), ev(3, 'c')], staff, links: [] })
    expect(out.events.map(e => e.id)).toEqual([1, 2, 3])
  })
})

describe('refresh at the database boundary', () => {
  it('reads stamps, the changed customers only, and history after the newest on screen minus a small overlap', async () => {
    const { vi } = await import('vitest')
    const calls: { table: string; ops: [string, unknown[]][] }[] = []
    const rows: Record<string, unknown[]> = {
      fu_leads: [{ id: 'a', version: 1, updated_at: 't1' }, { id: 'b', version: 5, updated_at: 't5' }],
      fu_events: [], staff: [{ id: 'u1', name: 'นุ่น', role: 'admin', active: true }], fu_orders: [],
    }
    const from = (table: string) => {
      const c = { table, ops: [] as [string, unknown[]][] }
      calls.push(c)
      const b: Record<string, unknown> = {}
      for (const k of ['select', 'order', 'range', 'returns', 'in', 'gt', 'limit']) b[k] = (...a: unknown[]) => { c.ops.push([k, a]); return b }
      b.then = (done: (r: unknown) => unknown) => {
        const inIds = c.ops.find(o => o[0] === 'in')
        const data = table === 'fu_leads' && inIds
          ? [{ ...lead('b'), owner_id: 'u1', first_day: '2026-11-10', page_id: null, chat_url: '', created_at: '', updated_at: 't5', conversation_id: null, version: 5 }]
          : rows[table]
        return Promise.resolve({ data, error: null }).then(done)
      }
      return b
    }
    vi.resetModules()
    vi.doMock('../src/data/client', () => ({ db: () => ({ from }) }))
    const { refreshFollowup } = await import('../src/data/followup')
    const before = { ...prev, leads: [lead('a'), lead('b')], events: [ev(120, 'a')] }
    const out = await refreshFollowup(before)
    const leadCalls = calls.filter(c => c.table === 'fu_leads')
    expect(leadCalls[0].ops[0]).toEqual(['select', ['id,version,updated_at']])
    expect(leadCalls[1].ops.find(o => o[0] === 'in')).toEqual(['in', ['id', ['b']]])
    expect(calls.find(c => c.table === 'fu_events')!.ops.find(o => o[0] === 'gt')).toEqual(['gt', ['id', 70]])
    expect(out.leads.find(l => l.id === 'b')!.version).toBe(5)
    vi.doUnmock('../src/data/client')
  })
})
