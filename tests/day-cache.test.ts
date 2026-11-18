import { describe, expect, it } from 'vitest'
import { byDay, memoryStore, type DaySigs } from '../src/data/dayCache'

type Row = { day: string; id: string }
const sigs = (o: Record<string, [number, string]>): DaySigs => new Map(Object.entries(o).map(([d, [n, sig]]) => [d, { n, sig }]))

// a fake server: what it holds per day, and which days each call asked for
function server(data: Record<string, Row[]>) {
  const calls: string[][] = []
  const fetchDays = async (days: string[]) => {
    calls.push(days)
    return new Map(days.map(d => [d, data[d] ?? []]))
  }
  return { calls, fetchDays, data }
}

const r = (day: string, id: string): Row => ({ day, id })

describe('byDay', () => {
  it('downloads every day the first time and keeps each day’s rows in the server’s order, days ascending', async () => {
    const s = server({ '2026-11-01': [r('2026-11-01', 'b'), r('2026-11-01', 'a')], '2026-11-02': [r('2026-11-02', 'c')] })
    const store = memoryStore<Row>()
    const got = await byDay('conv', sigs({ '2026-11-02': [1, 'y'], '2026-11-01': [2, 'x'] }), ['2026-11-02', '2026-11-01'], store, s.fetchDays)
    expect(got.map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(s.calls).toEqual([['2026-11-01', '2026-11-02']])
  })

  it('next time only downloads days whose fingerprint changed or that are new', async () => {
    const s = server({ '2026-11-01': [r('2026-11-01', 'a')], '2026-11-02': [r('2026-11-02', 'c')] })
    const store = memoryStore<Row>()
    await byDay('conv', sigs({ '2026-11-01': [1, 'x'], '2026-11-02': [1, 'y'] }), ['2026-11-01', '2026-11-02'], store, s.fetchDays)
    s.data['2026-11-02'] = [r('2026-11-02', 'c2')]
    s.data['2026-11-03'] = [r('2026-11-03', 'd')]
    const got = await byDay('conv', sigs({ '2026-11-01': [1, 'x'], '2026-11-02': [1, 'y2'], '2026-11-03': [1, 'z'] }),
      ['2026-11-01', '2026-11-02', '2026-11-03'], store, s.fetchDays)
    expect(got.map(x => x.id)).toEqual(['a', 'c2', 'd'])
    expect(s.calls[1]).toEqual(['2026-11-02', '2026-11-03'])
    // nothing changed: no request at all
    await byDay('conv', sigs({ '2026-11-01': [1, 'x'], '2026-11-02': [1, 'y2'], '2026-11-03': [1, 'z'] }),
      ['2026-11-01', '2026-11-02', '2026-11-03'], store, s.fetchDays)
    expect(s.calls).toHaveLength(2)
  })

  it('skips days the server has no rows for and keeps kinds apart', async () => {
    const s = server({ '2026-11-01': [r('2026-11-01', 'a')] })
    const store = memoryStore<Row>()
    await byDay('conv', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01', '2026-11-05'], store, s.fetchDays)
    expect(s.calls).toEqual([['2026-11-01']])
    await byDay('tag', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01'], store, s.fetchDays)
    expect(s.calls).toHaveLength(2)
  })

  it('does not keep a day whose download does not match its row count (an upload landed in between)', async () => {
    const s = server({ '2026-11-01': [r('2026-11-01', 'a'), r('2026-11-01', 'b')] })
    const store = memoryStore<Row>()
    const got = await byDay('conv', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01'], store, s.fetchDays)
    expect(got).toHaveLength(2) // shows what the server has now
    await byDay('conv', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01'], store, s.fetchDays)
    expect(s.calls).toHaveLength(2) // asked again
  })

  it('with prune, forgets days of that kind the server no longer has', async () => {
    const s = server({ '2026-11-01': [r('2026-11-01', 'a')], '2026-11-02': [r('2026-11-02', 'c')] })
    const store = memoryStore<Row>()
    await byDay('conv', sigs({ '2026-11-01': [1, 'x'], '2026-11-02': [1, 'y'] }), ['2026-11-01', '2026-11-02'], store, s.fetchDays)
    await byDay('tag', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01'], store, s.fetchDays)
    await byDay('conv', sigs({ '2026-11-02': [1, 'y'] }), ['2026-11-02'], store, s.fetchDays, { prune: true })
    expect((await store.keys()).sort()).toEqual(['v1:conv:2026-11-02', 'v1:tag:2026-11-01'])
  })

  it('works like a plain download when the browser cannot store anything', async () => {
    const s = server({ '2026-11-01': [r('2026-11-01', 'a')] })
    const broken = {
      get: async () => { throw new Error('blocked') }, put: async () => { throw new Error('blocked') },
      keys: async () => { throw new Error('blocked') }, del: async () => { throw new Error('blocked') },
    }
    expect((await byDay('conv', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01'], broken, s.fetchDays, { prune: true })).map(x => x.id)).toEqual(['a'])
    expect((await byDay('conv', sigs({ '2026-11-01': [1, 'x'] }), ['2026-11-01'], null, s.fetchDays)).map(x => x.id)).toEqual(['a'])
  })
})
