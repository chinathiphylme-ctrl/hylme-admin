import { describe, expect, it } from 'vitest'
import { exportCsv, parseCsv, parseLegacyCsv } from '../src/followup/csv'
import type { FuLead } from '../src/followup/schedule'

const lead: FuLead = {
  id: 'L1', name: '=HYPERLINK("x")', product: 'GABA', ownerId: 'u1', firstDay: '2026-11-13', pageId: '516356078238016',
  chatUrl: 'https://pancake.vn/c/1', objection: 'ราคา / ความคุ้มค่า', notes: 'บรรทัด 1\n"อ้าง"', status: 'active', version: 3, createdAt: '', updatedAt: '',
}

describe('csv', () => {
  it('parses quotes, commas and new lines inside cells', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']])
  })

  it('exports with a BOM, guards formula cells, and round-trips through the parser', () => {
    const text = exportCsv([lead], [], new Map([['u1', 'พี่ก้อย']]), '2026-11-17')
    expect(text.startsWith('﻿')).toBe(true)
    const [head, row] = parseCsv(text.slice(1))
    const get = (k: string) => row[head.indexOf(k)]
    expect(get('ชื่อ/รหัสลูกค้า')).toBe(`'=HYPERLINK("x")`)
    expect(get('ผู้ดูแล')).toBe('พี่ก้อย')
    expect(get('เพจ')).toBe('ครบจบเรื่องไขมัน')
    expect(get('บันทึก')).toBe('บรรทัด 1\n"อ้าง"')
    expect(get('รอบถัดไป')).toBe('1')
    expect(get('สถานะ')).toBe('เลยกำหนด')
  })

  it('reads a file exported from the old HTML app', () => {
    const head = 'id,ชื่อ/รหัสลูกค้า,สินค้า,ผู้ดูแล,ช่องทาง,ลิงก์แชต,วันที่คุยครั้งแรก,เหตุผลไม่ซื้อ,บันทึก,สถานะ,ยอดขาย,ประวัติ7รอบJSON,วันสร้าง,วันอัปเดต'
    const ok = `"a1","ลูกค้า 1","GABA","แอดมิน 1","Facebook เรื่องนอน","https://x.y/1","2026-11-01","ราคา","n","won","490","[{""round"":1,""doneDate"":""2026-11-02"",""note"":""ส่งแล้ว""}]","",""`
    const bad = `"a2","","GABA","แอดมิน 1","","","2026-11-01","","","active","0","[]","",""`
    const r = parseLegacyCsv(`﻿${head}\n${ok}\n${bad}\n`)
    expect(r.skipped).toBe(1)
    expect(r.rows).toEqual([{
      name: 'ลูกค้า 1', product: 'GABA', ownerName: 'แอดมิน 1', pageId: '923678677500634', chatUrl: 'https://x.y/1',
      firstDay: '2026-11-01', objection: 'ราคา', notes: 'n', status: 'won', history: [{ round: 1, day: '2026-11-02', note: 'ส่งแล้ว' }],
    }])
  })

  it('rejects files that are not the old app export', () => {
    expect(() => parseLegacyCsv('foo,bar\n1,2')).toThrow('รูปแบบ CSV')
  })
})
