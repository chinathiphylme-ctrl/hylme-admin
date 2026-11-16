import { describe, expect, it } from 'vitest'
import { syncFailedText, syncSummary } from '../src/data/write'

describe('upload page line for the follow-up queue', () => {
  it('counts linked customers as added', () => {
    expect(syncSummary({ added: 3, linked: 1, rounds: 2, skipped: 5, won: 1 }))
      .toBe('เพิ่มเข้าคิว 4 ราย · บันทึกรอบจากแท็ก 2 · ซื้อแล้ว 1 ราย')
  })
  it('says the upload itself is safe when the sync fails', () => {
    expect(syncFailedText('boom'))
      .toBe('ไฟล์ข้อความบันทึกแล้ว แต่ดึงลูกค้าเข้าคิวติดตามไม่สำเร็จ: boom — ระบบจะลองใหม่ตอนเปิดแท็บติดตาม')
  })
})
