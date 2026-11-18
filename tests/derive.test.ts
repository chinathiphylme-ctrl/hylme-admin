import { describe, expect, it } from 'vitest'
import { convsInRange, latestPerPage } from '../src/data/derive'
import type { ConvRow } from '../src/parse/types'

const FB = '100379779472465', FAT = '516356078238016', IG = 'igo_17841457670184062'
const c = (day: string, id: string, pageId: string): ConvRow => ({
  day, conversationId: id, pageId: pageId as ConvRow['pageId'], firstAt: '', lastAt: '', msgCount: 1, firstKind: 'typed',
  hasPhone: false, tags: [], topics: [], pancakeUrl: '',
})
// as fetchAllConvs returns them: by day, then by chat id in the database's order
const all = [c('2026-11-01', 'b', FB), c('2026-11-01', 'a', FAT), c('2026-11-02', 'z', FB), c('2026-11-02', 'y', FB), c('2026-11-03', 'q', FAT)]

describe('derived from all chats', () => {
  it('a range keeps the days inside it, in the same order', () => {
    expect(convsInRange(all, { from: '2026-11-02', to: '2026-11-03' }).map(x => x.conversationId)).toEqual(['z', 'y', 'q'])
    expect(convsInRange(all, { from: '2026-11-05', to: '2026-11-06' })).toEqual([])
  })

  it('the latest day of each page, pages in the config order, pages without chats left out', () => {
    expect(latestPerPage(all).map(x => [x.pageId, x.day, x.conversationId])).toEqual([
      [FB, '2026-11-02', 'z'], [FB, '2026-11-02', 'y'], [FAT, '2026-11-03', 'q'],
    ])
    expect(latestPerPage([c('2026-11-01', 'i', IG)]).map(x => x.conversationId)).toEqual(['i'])
  })
})
