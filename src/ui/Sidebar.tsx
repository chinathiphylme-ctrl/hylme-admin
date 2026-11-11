import { toBangkokIsoFromAny } from '../data/mappers'
import type { Upload } from '../data/read'
import { thaiDay } from './viewModel'

export type Tab = 'overview' | 'follow' | 'quotes' | 'upload' | 'tags'

export const TITLES: Record<Tab, string> = { overview: 'สรุปประจำวัน', follow: 'ต้องตามวันนี้', quotes: 'เสียงลูกค้า', upload: 'อัปโหลดไฟล์', tags: 'จัดกลุ่มแท็ก' }

const ICONS: Record<Tab, React.ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></>,
  follow: <><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3.5 21l1.4-4.9A8.5 8.5 0 1 1 21 12z" /><path d="M12 8v4l2.5 1.5" /></>,
  quotes: <><path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-4.5 3.5v-3.5h-1.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" /><path d="M8.5 10h7" /><path d="M8.5 13h4" /></>,
  upload: <><path d="M12 15V4" /><path d="M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  tags: <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0z" /><circle cx="8" cy="8" r="1.3" /></>,
}

export function uploadTime(iso: string): string {
  const b = toBangkokIsoFromAny(iso)
  return `${thaiDay(b.slice(0, 10))} ${b.slice(11, 16)}`
}

function pagesCovering(uploads: Upload[], kind: Upload['kind'], day: string): number {
  const ids = new Set(uploads
    .filter(u => u.kind === kind && u.dayFrom && u.dayFrom <= day && (u.dayTo ?? u.dayFrom) >= day)
    .flatMap(u => u.pageIds))
  return ids.size
}

export function Sidebar({ tab, setTab, followCount, unassigned, latest, uploads }: {
  tab: Tab; setTab: (t: Tab) => void; followCount: number; unassigned: number; latest: string | null; uploads: Upload[]
}) {
  const item = (key: Tab, extra?: React.ReactNode) => (
    <button type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[key]}</svg>
      <span className="label">{key === 'overview' ? 'ภาพรวม' : TITLES[key]}</span>
      {extra}
    </button>
  )
  const tagPages = latest ? pagesCovering(uploads, 'tagStats', latest) : 0
  const msgPages = latest ? pagesCovering(uploads, 'messages', latest) : 0
  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark">H</div>
        <div className="brand-text"><b>Hylme</b><span>แอดมินรายวัน</span></div>
      </div>
      <nav className="nav" aria-label="เมนูหลัก">
        {item('overview')}
        {item('follow', followCount > 0 && <span className="pill-count" style={{ background: '#F2C9B3', color: '#6E260A' }}>{followCount}</span>)}
        {item('quotes')}
        {item('upload')}
        {item('tags', unassigned > 0 && <span className="pill-count" style={{ background: '#F3DDAE', color: '#5C3A06' }}>{unassigned}</span>)}
      </nav>
      <div className="status">
        <span className="k">ข้อมูลล่าสุด</span>
        <span style={{ fontWeight: 600, fontSize: 15, marginTop: -6 }}>{latest ? thaiDay(latest) + ' ' + latest.slice(0, 4) : 'ยังไม่มีข้อมูล'}</span>
        <span className="row"><span>สถิติแท็ก</span><span className="num" style={{ color: tagPages === 4 ? '#9FD8B8' : '#F0C987' }}>{tagPages}/4 เพจ</span></span>
        <span className="row"><span>ไฟล์ข้อความ</span><span className="num" style={{ color: msgPages === 4 ? '#9FD8B8' : '#F0C987' }}>{msgPages}/4 เพจ</span></span>
        <hr />
        <span className="k">{uploads[0] ? `อัปโหลดล่าสุด ${uploadTime(uploads[0].uploadedAt)}` : 'ยังไม่มีการอัปโหลด'}</span>
      </div>
    </aside>
  )
}
