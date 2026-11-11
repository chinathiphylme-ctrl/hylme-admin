import { describe, expect, it } from 'vitest'
import { fromDbConv, fromDbTagRow, toDbConv, toDbTagRow } from '../src/data/mappers'
import type { ConvRow, TagRow } from '../src/parse/types'

const conv: ConvRow = {
  day: '2026-10-29',
  conversationId: 'c1',
  pageId: '100379779472465',
  firstAt: '2026-10-29T11:00:00+07:00',
  lastAt: '2026-10-29T13:00:00+07:00',
  msgCount: 3,
  firstKind: 'button',
  hasPhone: true,
  tags: ['29/10', 'มะกอก'],
  topics: ['ราคา/แพง'],
  pancakeUrl: 'https://pancake.vn/x',
}

describe('mappers', () => {
  it('round-trips a conversation', () => {
    expect(fromDbConv(toDbConv(conv))).toEqual(conv)
  })

  it('sends only the spec §4 conversation columns', () => {
    expect(Object.keys(toDbConv(conv)).sort()).toEqual(
      ['conversation_id', 'day', 'first_at', 'first_kind', 'has_phone', 'last_at', 'msg_count', 'page_id', 'pancake_url', 'tags', 'topics'])
  })

  it('reads timestamps that Postgres returns in UTC as Bangkok time', () => {
    const db = { ...toDbConv(conv), first_at: '2026-10-29T04:00:00+00:00', last_at: '2026-10-29T06:00:00+00:00' }
    expect(fromDbConv(db)).toEqual(conv)
  })

  it('round-trips a tag row', () => {
    const r: TagRow = { day: '2026-10-29', pageId: '516356078238016', tag: 'ปิด', color: '#b', count: 19 }
    expect(toDbTagRow(r)).toEqual({ day: '2026-10-29', page_id: '516356078238016', tag: 'ปิด', color: '#b', count: 19 })
    expect(fromDbTagRow(toDbTagRow(r))).toEqual(r)
  })
})
