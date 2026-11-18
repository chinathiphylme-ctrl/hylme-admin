import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))
vi.mock('../src/data/client', () => ({ db: () => mock }))
import { fetchAllConvs, fetchDaySigs, fetchTagRows } from '../src/data/read'

function query(result: unknown) {
  const builder: Record<string, unknown> = {}
  for (const key of ['select', 'order', 'range', 'returns', 'limit', 'in', 'gte', 'lte', 'eq']) builder[key] = vi.fn(() => builder)
  builder.then = (done: (r: unknown) => unknown) => Promise.resolve(result).then(done)
  return builder
}
const dbConv = (day: string, id: string) => ({ day, conversation_id: id, page_id: '100379779472465', first_at: `${day}T03:00:00+00:00`,
  last_at: `${day}T03:00:00+00:00`, msg_count: 1, first_kind: 'typed', has_phone: false, tags: [], topics: [], pancake_url: '' })

beforeEach(() => { mock.from.mockReset(); mock.rpc.mockReset() })

describe('day fingerprints at the database boundary', () => {
  it('reads day_sigs() into one map per kind', async () => {
    mock.rpc.mockResolvedValue({ data: [
      { kind: 'conv', day: '2026-11-01', n: 2, sig: 'a' }, { kind: 'tag', day: '2026-11-01', n: 5, sig: 'b' },
    ], error: null })
    const s = await fetchDaySigs()
    expect(mock.rpc).toHaveBeenCalledWith('day_sigs')
    expect([...s!.conv]).toEqual([['2026-11-01', { n: 2, sig: 'a' }]])
    expect([...s!.tag]).toEqual([['2026-11-01', { n: 5, sig: 'b' }]])
  })

  it('returns null while the function is not installed, so the dashboard loads as before', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.day_sigs' } })
    expect(await fetchDaySigs()).toBeNull()
  })

  it('with fingerprints, asks only for the days it needs, sorted by day then chat id', async () => {
    const q = query({ data: [dbConv('2026-11-01', 'b'), dbConv('2026-11-02', 'c')], error: null })
    mock.from.mockReturnValue(q)
    const sigs = { conv: new Map([['2026-11-01', { n: 1, sig: 'x' }], ['2026-11-02', { n: 1, sig: 'y' }]]), tag: new Map() }
    const got = await fetchAllConvs(sigs)
    expect(got.map(c => [c.day, c.conversationId, c.firstAt])).toEqual([['2026-11-01', 'b', '2026-11-01T10:00:00+07:00'], ['2026-11-02', 'c', '2026-11-02T10:00:00+07:00']])
    expect(q.in).toHaveBeenCalledWith('day', ['2026-11-01', '2026-11-02'])
    expect(q.order).toHaveBeenNthCalledWith(1, 'day')
    expect(q.order).toHaveBeenNthCalledWith(2, 'conversation_id')
  })

  it('tag counts cover the range and the one before it, only on days that have counts', async () => {
    const q = query({ data: [{ day: '2026-11-04', page_id: '100379779472465', tag: 'ปิด', color: '', count: 3 }], error: null })
    mock.from.mockReturnValue(q)
    const tag = new Map([['2026-11-01', { n: 1, sig: 'a' }], ['2026-11-04', { n: 1, sig: 'b' }], ['2026-11-09', { n: 1, sig: 'c' }]])
    const rows = await fetchTagRows({ from: '2026-11-05', to: '2026-11-06' }, { conv: new Map(), tag })
    expect(q.in).toHaveBeenCalledWith('day', ['2026-11-04'])
    expect(rows).toEqual([{ day: '2026-11-04', pageId: '100379779472465', tag: 'ปิด', color: '', count: 3 }])
  })
})
