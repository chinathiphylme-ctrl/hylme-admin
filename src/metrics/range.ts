export type RangeKey = 'day' | '7d' | '30d' | 'month' | 'custom'
export type DateRange = { from: string; to: string }

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`)
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  return toDay(toTime(day) + n * 864e5)
}

export function rangeFor(key: RangeKey, latest: string, custom?: DateRange, selectedDay?: string): DateRange {
  switch (key) {
    case 'day': return { from: selectedDay ?? latest, to: selectedDay ?? latest }
    case '7d': return { from: addDays(latest, -6), to: latest }
    case '30d': return { from: addDays(latest, -29), to: latest }
    case 'month': return { from: `${latest.slice(0, 8)}01`, to: latest }
    case 'custom': return custom ?? { from: latest, to: latest }
  }
}

export function daysIn(r: DateRange): string[] {
  const out: string[] = []
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) out.push(d)
  return out
}

export function previousRange(r: DateRange): DateRange {
  const len = daysIn(r).length
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) }
}
