export type PageId = '100379779472465' | 'igo_17841457670184062' | '923678677500634' | '516356078238016'

export const PAGES: { id: PageId; name: string; platform: 'Facebook' | 'Instagram' }[] = [
  { id: '100379779472465', name: 'Hylme (Facebook)', platform: 'Facebook' },
  { id: '516356078238016', name: 'ครบจบเรื่องไขมัน', platform: 'Facebook' },
  { id: '923678677500634', name: 'ครบจบเรื่องนอน', platform: 'Facebook' },
  { id: 'igo_17841457670184062', name: 'Hylme (IG)', platform: 'Instagram' },
]

export function isPageId(x: string): x is PageId {
  return PAGES.some(p => p.id === x)
}

export function pageName(id: PageId | 'all'): string {
  if (id === 'all') return 'ทุกเพจ'
  return PAGES.find(p => p.id === id)!.name
}
