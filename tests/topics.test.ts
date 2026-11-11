import { describe, expect, it } from 'vitest'
import { TOPICS, topicsOf } from '../src/parse/topics'

describe('keyword topics', () => {
  it.each([
    ['แพงจัง ลดหน่อยได้ไหม', 'ราคา/แพง'], ['มีรีวิวจากผู้ใช้ไหม', 'ไม่มั่นใจ/ขอรีวิว'],
    ['เป็นเบาหวานอยู่ค่ะ', 'อาการ/สุขภาพ'], ['ทานคู่ยาได้ไหม', 'กลัวผลข้างเคียง'],
    ['ขอคิดก่อนนะคะ', 'ขอคิดก่อน'], ['เคยทานยี่ห้ออื่น', 'เทียบยี่ห้ออื่น'],
    ['ส่งปลายทางได้ไหม', 'ส่งของ/จ่ายเงิน'], ['ชอบมาก หลับดีขึ้นค่ะ', 'คำชม'],
  ])('classifies %s', (text, topic) => expect(topicsOf(text)).toContain(topic))
  it.each(['', 'สนใจ', 'สนใจสั่งซื้อค่ะ', 'ราคา', 'ปริมาณ-ราคา', 'ช่วยเช็คราคาสินค้าหน่อยได้ไหม'])('excludes button %s', text => expect(topicsOf(text)).toEqual([]))
  it('returns multiple topics in canonical order', () => {
    expect(topicsOf('แพงและกินคู่ยาเบาหวานได้ไหม')).toEqual(['ราคา/แพง', 'อาการ/สุขภาพ', 'กลัวผลข้างเคียง'])
    expect(TOPICS).not.toContain('อื่นๆ')
  })
})
