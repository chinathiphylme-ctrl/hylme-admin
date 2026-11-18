import { PAGES } from '../config/pages'
import type { DateRange } from '../metrics/range'
import type { ConvRow } from '../parse/types'

// The dashboard downloads every chat once (fetchAllConvs); these give the same rows the range and latest-day
// queries used to download again, in the same order.

export const convsInRange = (all: ConvRow[], r: DateRange): ConvRow[] => all.filter(c => c.day >= r.from && c.day <= r.to)

// the newest message day of each page, for the follow-up list
export function latestPerPage(all: ConvRow[]): ConvRow[] {
  return PAGES.flatMap(({ id }) => {
    const mine = all.filter(c => c.pageId === id)
    const day = mine.reduce<string | null>((m, c) => (m === null || c.day > m ? c.day : m), null)
    return mine.filter(c => c.day === day)
  })
}
