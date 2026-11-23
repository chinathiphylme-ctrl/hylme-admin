import type { FuLead } from './schedule'

// how many of these customers bought (status won, by hand or from a Pancake close tag); a plain count and percent
export function wonShare(leads: FuLead[]): { total: number; won: number; pct: number | null } {
  const won = leads.filter(l => l.status === 'won').length
  return { total: leads.length, won, pct: leads.length ? Math.round((won / leads.length) * 1000) / 10 : null }
}
