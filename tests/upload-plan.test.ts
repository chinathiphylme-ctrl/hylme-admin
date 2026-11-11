import { describe, expect, it } from 'vitest'
import type { MessagesResult, TagStatsResult } from '../src/parse/types'
import { existingKeys, planUpload } from '../src/ui/uploadPlan'

const FB = '100379779472465'
const FAT = '516356078238016'

const tagFile: TagStatsResult = {
  ok: true, fileName: 'tags.xlsx', days: ['2026-10-29'], pageIds: [FB, FAT],
  rows: [], tags: [{ tag: '29/10', color: '#a' }, { tag: 'ปิด', color: '#b' }, { tag: '120250984880940', color: '#c' }, { tag: 'ติดตาม', color: '#d' }],
}
const msgFile: MessagesResult = {
  ok: true, fileName: 'msg.xlsx', days: ['2026-10-29'], pageIds: [FB], messageCount: 255,
  candidates: [], convs: [{ day: '2026-10-29', conversationId: 'c1', pageId: FB, firstAt: '', lastAt: '', msgCount: 2, firstKind: 'typed', hasPhone: false, topics: [], tags: ['นับ New Today', 'ติดตาม'], pancakeUrl: '' }],
}
const badFile: TagStatsResult = { ok: false, fileName: 'all.xlsx', error: 'ไฟล์นี้เป็นแบบรวมทุกเพจ กรุณา export แบบแยกเพจ' }

describe('planUpload', () => {
  it('reports days and pages that will be overwritten', () => {
    const existing = existingKeys([{ kind: 'tagStats', dayFrom: '2026-10-29', dayTo: '2026-10-29', pageIds: [FB] }])
    const plan = planUpload([tagFile], existing, {})
    expect(plan.overwrites).toEqual(['สถิติแท็ก 29 ต.ค. · Hylme (Facebook)'])
  })

  it('lists new unassigned tags but not date or ad tags', () => {
    const plan = planUpload([tagFile, msgFile], new Set(), {})
    expect(plan.newUnassigned).toEqual(['ติดตาม', 'นับ New Today'])
    expect(planUpload([tagFile], new Set(), { 'ติดตาม': 'เงียบหาย' }).newUnassigned).toEqual([])
  })

  it('keeps a failed file with its error without affecting the others', () => {
    const plan = planUpload([badFile, msgFile], new Set(), {})
    expect(plan.files).toEqual([
      { fileName: 'all.xlsx', kind: null, summary: '', error: 'ไฟล์นี้เป็นแบบรวมทุกเพจ กรุณา export แบบแยกเพจ' },
      { fileName: 'msg.xlsx', kind: 'messages', summary: 'ข้อความรายแชท · 29 ต.ค. · Hylme (Facebook) · 1 แชท จาก 255 ข้อความ' },
    ])
  })

  it('summarises a tag file', () => {
    expect(planUpload([tagFile], new Set(), {}).files[0].summary).toBe('สถิติแท็กแยกเพจ · 29 ต.ค. · 2 เพจ · 4 แท็ก')
  })
})
