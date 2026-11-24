import { TOPICS, type Topic } from '../parse/topics'
import { NO_TAGS, noStageLabel, OTHER_TAGS, stageOf } from './conversations'
import type { Lead } from './leads'
import { BUY_REASON_TAGS, LOST_REASON_TAGS } from '../grouping/rules'

export { BUY_REASON_TAGS, LOST_REASON_TAGS }
export const MIN_TOPIC_CHATS = 10
export type TopicRow = { topic: Topic; chats: number; closed: number; rate: number; thin: boolean }
export type ReasonSide = { rows: [string, number][]; tagged: number; total: number }
const percent = (k: number, n: number) => Math.round(k / n * 1000) / 10

export const topicCoverage = (leads: Lead[]) => ({ withTopics: leads.filter(l => l.topics.length).length, total: leads.length })

export function topicStats(leads: Lead[]): { avg: number | null; buy: TopicRow[]; notBuy: TopicRow[]; none: number } {
  if (!leads.length) return { avg: null, buy: [], notBuy: [], none: 0 }
  const average = leads.filter(l => l.closed).length / leads.length
  const rows = TOPICS.flatMap(topic => {
    const xs = leads.filter(l => l.topics.includes(topic))
    if (!xs.length) return []
    const closed = xs.filter(l => l.closed).length
    return [{ topic, chats: xs.length, closed, rate: percent(closed, xs.length), thin: xs.length < MIN_TOPIC_CHATS }]
  }).sort((a, b) => b.chats - a.chats)
  // Compare unrounded rates: rounding should never change which side a topic belongs to.
  return { avg: percent(leads.filter(l => l.closed).length, leads.length),
    buy: rows.filter(r => r.closed / r.chats >= average), notBuy: rows.filter(r => r.closed / r.chats < average),
    none: leads.filter(l => !l.topics.length).length }
}

export function reasonTagStats(leads: Lead[]): { buy: ReasonSide; lost: ReasonSide } {
  const side = (xs: Lead[], tags: string[]): ReasonSide => ({
    rows: tags.map((tag): [string, number] => [tag, xs.filter(l => l.tags.includes(tag)).length]).sort((a, b) => b[1] - a[1]),
    tagged: xs.filter(l => tags.some(t => l.tags.includes(t))).length, total: xs.length,
  })
  return { buy: side(leads.filter(l => l.closed), BUY_REASON_TAGS), lost: side(leads.filter(l => !l.closed), LOST_REASON_TAGS) }
}

export type Who = 'all' | 'new' | 'old'
// old = returning customers and chats without that day's date tag (anything that is not a new chat)
export const whoOf = (leads: Lead[], who: Who): Lead[] => who === 'all' ? leads : leads.filter(l => l.isNew === (who === 'new'))

export const latestDay = (leads: Lead[]): string | null =>
  leads.reduce<string | null>((m, l) => (m === null || l.lastDay > m ? l.lastDay : m), null)

// chats whose close tag first shows up in that day's file, and how many of them carry a buy reason tag
export function closedOnDay(leads: Lead[], day: string): { closed: number; tagged: number } {
  const xs = leads.filter(l => l.closeDay === day)
  return { closed: xs.length, tagged: xs.filter(l => BUY_REASON_TAGS.some(t => l.tags.includes(t))).length }
}

export function dropStages(leads: Lead[]): [string, number][] {
  const stages = leads.filter(l => !l.closed).map(l => { const s = stageOf(l.tags); return s === 'อื่นๆ' ? noStageLabel(l.tags) : s })
  return ['พร้อมสั่ง', 'ลังเล', 'ขอโปร', 'ขอราคา', 'ถามสุขภาพ', 'สนใจ', OTHER_TAGS, NO_TAGS].map(s =>
    [s, stages.filter(stage => stage === s).length])
}
