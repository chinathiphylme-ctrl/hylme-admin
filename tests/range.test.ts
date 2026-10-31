import { describe, expect, it } from 'vitest'
import { daysIn, previousRange, rangeFor } from '../src/metrics/range'

describe('ranges', () => {
  it('builds a 7-day range and the period before it', () => {
    const r = rangeFor('7d', '2026-10-29')
    expect(r).toEqual({ from: '2026-10-23', to: '2026-10-29' })
    expect(previousRange(r)).toEqual({ from: '2026-10-16', to: '2026-10-22' })
  })
  it('handles day, 30 days, month and custom', () => {
    expect(rangeFor('day', '2026-10-29')).toEqual({ from: '2026-10-29', to: '2026-10-29' })
    expect(rangeFor('30d', '2026-10-29').from).toBe('2026-09-30')
    expect(rangeFor('month', '2026-10-29').from).toBe('2026-10-01')
    expect(rangeFor('custom', '2026-10-29', { from: '2026-10-01', to: '2026-10-05' })).toEqual({ from: '2026-10-01', to: '2026-10-05' })
  })
  it('lists days across a year end', () => {
    expect(daysIn({ from: '2026-12-30', to: '2027-01-02' })).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
  })
})
