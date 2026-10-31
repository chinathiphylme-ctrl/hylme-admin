import { pageName, type PageId } from '../config/pages'
import { groupOf } from '../grouping/rules'
import { daysIn } from '../metrics/range'
import type { MessagesResult, TagStatsResult } from '../parse/types'
import { fmt, rangeLabel, thaiDay } from './viewModel'

type Kind = 'tagStats' | 'messages'
const KIND_LABEL: Record<Kind, string> = { tagStats: 'สถิติแท็ก', messages: 'ไฟล์ข้อความ' }

const key = (kind: Kind, day: string, page: string) => `${kind}|${day}|${page}`

// what is already saved, as kind|day|page keys
export function existingKeys(uploads: { kind: Kind; dayFrom: string | null; dayTo: string | null; pageIds: string[] }[]): Set<string> {
  const out = new Set<string>()
  for (const u of uploads) {
    if (!u.dayFrom) continue
    for (const d of daysIn({ from: u.dayFrom, to: u.dayTo ?? u.dayFrom })) for (const p of u.pageIds) out.add(key(u.kind, d, p))
  }
  return out
}

export type PlannedFile = { fileName: string; kind: Kind | null; summary: string; error?: string }

export function planUpload(results: (TagStatsResult | MessagesResult)[], existing: Set<string>, overrides: Record<string, string>) {
  const files: PlannedFile[] = []
  const overwrites: string[] = []
  const unassigned = new Set<string>()
  const noteTag = (t: string) => { if (groupOf(t, overrides) === 'ยังไม่จัดกลุ่ม') unassigned.add(t) }

  for (const r of results) {
    if (!r.ok) {
      files.push({ fileName: r.fileName, kind: null, summary: '', error: r.error })
      continue
    }
    const kind: Kind = 'rows' in r ? 'tagStats' : 'messages'
    const when = rangeLabel(r.days[0], r.days[r.days.length - 1])
    if ('rows' in r) {
      files.push({ fileName: r.fileName, kind, summary: `สถิติแท็กแยกเพจ · ${when} · ${r.pageIds.length} เพจ · ${r.tags.length} แท็ก` })
      r.tags.forEach(t => noteTag(t.tag))
    } else {
      const names = r.pageIds.map(p => pageName(p)).join(', ')
      files.push({ fileName: r.fileName, kind, summary: `ข้อความรายแชท · ${when} · ${names} · ${fmt(r.convs.length)} แชท จาก ${fmt(r.messageCount)} ข้อความ` })
      r.convs.forEach(c => c.tags.forEach(noteTag))
    }
    for (const d of r.days) for (const p of r.pageIds as PageId[]) {
      if (existing.has(key(kind, d, p))) overwrites.push(`${KIND_LABEL[kind]} ${thaiDay(d)} · ${pageName(p)}`)
    }
  }
  return { files, overwrites, newUnassigned: [...unassigned] }
}
