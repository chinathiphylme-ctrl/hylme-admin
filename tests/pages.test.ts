import { describe, expect, it } from 'vitest'
import { PAGES, isPageId, pageName } from '../src/config/pages'

describe('pages', () => {
  it('lists the four Hylme pages in display order', () => {
    expect(PAGES.map(p => p.id)).toEqual(['100379779472465', '516356078238016', '923678677500634', 'igo_17841457670184062'])
  })
  it('recognises page ids', () => {
    expect(isPageId('igo_17841457670184062')).toBe(true)
    expect(isPageId('123')).toBe(false)
  })
  it('names the all-pages view', () => {
    expect(pageName('all')).toBe('ทุกเพจ')
    expect(pageName('516356078238016')).toBe('ครบจบเรื่องไขมัน')
  })
})
