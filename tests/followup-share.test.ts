import { describe, expect, it } from 'vitest'
import { wonShare } from '../src/followup/share'
import type { FuLead } from '../src/followup/schedule'

const lead = (status: FuLead['status']): FuLead => ({
  id: 'x', name: 'x', product: '', ownerId: 'u', firstDay: '2026-11-01', pageId: null, chatUrl: '', objection: '', notes: '',
  status, version: 1, createdAt: '', updatedAt: '', conversationId: null, source: 'tag',
})

describe('bought out of the queue', () => {
  it('counts won customers over everyone given, with a one-decimal percent', () => {
    const xs = [...Array(3)].map(() => lead('won')).concat([...Array(44)].map(() => lead('active')), [lead('optout')])
    expect(wonShare(xs)).toEqual({ total: 48, won: 3, pct: 6.3 })
  })
  it('has no percent for nobody', () => {
    expect(wonShare([])).toEqual({ total: 0, won: 0, pct: null })
  })
})
