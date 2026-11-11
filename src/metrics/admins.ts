import { ADMIN_TAGS, NAME_TAG_FROM } from '../config/admins'
import type { PageId } from '../config/pages'
import { inStart, type Lead } from './leads'
import type { DateRange } from './range'

export function adminCloses(leads: Lead[], range: DateRange, page: PageId | 'all') {
  const scope = leads.filter(inStart(range)).filter(l => l.startDay >= NAME_TAG_FROM && (page === 'all' || l.pageId === page))
  return Object.entries(ADMIN_TAGS).map(([tag, admin]) => {
    const xs = scope.filter(l => l.tags.includes(tag))
    const closed = xs.filter(l => l.closed).length
    return { admin, chats: xs.length, closed, rate: xs.length ? Math.round(closed / xs.length * 1000) / 10 : null }
  })
}
