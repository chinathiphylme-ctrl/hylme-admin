import { describe, expect, it } from 'vitest'
import { ALL_GROUPS, STAGE_GROUPS, dateTag, groupOf } from '../src/grouping/rules'

describe('groupOf', () => {
  it.each([
    ['29/10', 'วันที่'],
    ['120250984880940', 'โฆษณา'],
    ['1.สนใจ', 'เริ่มสนใจ'],
    ['3. ขอโปรโมชั่น', 'ติดเรื่องราคา'],
    ['7.เปรียบเทียบราคา', 'ติดเรื่องราคา'],
    ['10เราทักเม้น', 'ที่มาลูกค้า'],
    ['9.อื่นๆ .(ทักมั่ว)', 'ที่มาลูกค้า'],
    ['มะกอก', 'สินค้า'],
    ['นุ่น🤍', 'แอดมิน'],
    [' ปิด ', 'ปิดการขาย'],
    ['ติดตาม', 'ยังไม่จัดกลุ่ม'],
  ])('%s → %s', (tag, group) => {
    expect(groupOf(tag, {})).toBe(group)
  })

  it('uses the saved override first', () => {
    expect(groupOf('ติดตาม', { 'ติดตาม': 'เงียบหาย' })).toBe('เงียบหาย')
  })

  it('has the stage and full group lists', () => {
    expect(STAGE_GROUPS[6]).toBe('เงียบหาย')
    expect(ALL_GROUPS).toContain('โฆษณา')
  })
})

describe('dateTag', () => {
  it('drops zero padding', () => {
    expect(dateTag('2026-10-08')).toBe('8/10')
  })
})
