import { TOPICS, type Topic } from '../parse/topics'
import { stageOf } from './conversations'
import type { Lead } from './leads'

export const BUY_REASON_TAGS = ['ส่วนผสม', 'เคยใช้และพอใจ', 'รีวิวจากผู้ใช้', 'คุณภาพสินค้า', 'มีคนแนะนำ', 'ดูแลสุขภาพ', 'โปรโมชั่น', 'มาตรฐาน/แหล่งผล']
export const LOST_REASON_TAGS = ['ราคาแพง', 'ติดราคา', 'ขอคิดดูก่อน', 'ข้อมูลไม่เพียงพ', 'ไม่ตรงความต้องก', 'เปรียบเทียบแบรน', 'ขาดความมั่นใจ', 'รอโปร', '7.เปรียบเทียบราคา', 'ไม่สนใจ']
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

export function dropStages(leads: Lead[]): [string, number][] {
  const stages = leads.filter(l => !l.closed).map(l => stageOf(l.tags))
  return ['พร้อมสั่ง', 'ลังเล', 'ขอโปร', 'ขอราคา', 'ถามสุขภาพ', 'สนใจ', 'ไม่มีแท็กขั้น'].map(s =>
    [s, stages.filter(stage => stage === (s === 'ไม่มีแท็กขั้น' ? 'อื่นๆ' : s)).length])
}
