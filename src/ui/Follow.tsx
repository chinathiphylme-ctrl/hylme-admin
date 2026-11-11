import { useState } from 'react'
import { pageName } from '../config/pages'
import type { FollowItem, Stage } from '../metrics/conversations'
import { GradePill } from './LeadGrades'
import { CRIT, thaiDay } from './viewModel'

const FILTERS: [Stage | 'all', string, string][] = [
  ['all', 'ทั้งหมด', 'แชทค้างที่ลูกค้ายังเงียบ'],
  ['พร้อมสั่ง', 'พร้อมสั่ง', 'ปิดง่ายสุด ตามก่อน'],
  ['ลังเล', 'ลังเล', 'ยังตัดสินใจไม่ได้'],
  ['ขอโปร', 'ขอโปร', 'ถามโปรแล้วเงียบ'],
  ['ขอราคา', 'ขอราคา', 'ได้ราคาแล้วเงียบ'],
]
const STAGE_STYLE: Partial<Record<Stage, React.CSSProperties>> = {
  'พร้อมสั่ง': { background: '#FCE6DA', color: '#8A2E07' },
  'ขอราคา': { background: '#F7E7C6', color: '#5C3A06' },
  'ขอโปร': { background: '#ECE6F5', color: '#4B2F7A' },
}

export function Follow({ items }: { items: FollowItem[] }) {
  const [filter, setFilter] = useState<Stage | 'all'>('all')
  const rows = items.filter(f => filter === 'all' || f.stage === filter)
  return (
    <section className="stack" style={{ gap: 16 }}>
      <p style={{ fontSize: 15, color: '#24352C', maxWidth: '72ch' }}>
        แชทที่ลูกค้าค้างอยู่และยังเงียบ จากไฟล์ข้อความล่าสุดของแต่ละเพจ เรียงจากโอกาสปิดสูงสุด กด “เปิดใน Pancake” เพื่อตอบต่อได้ทันที
      </p>
      <div className="filter-cards" role="group" aria-label="กรองตามขั้น">
        {FILTERS.map(([k, label, hint]) => (
          <button key={k} type="button" className="fcard" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            <span style={{ fontSize: 13, color: '#55665D' }}>{label}</span>
            <span className="n" style={{ color: k === 'พร้อมสั่ง' ? CRIT : '#12241B' }}>{k === 'all' ? items.length : items.filter(f => f.stage === k).length}</span>
            <span className="small">{hint}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <section className="card" style={{ border: '1px dashed #C9D3CD' }}>
          <p className="desc" style={{ fontSize: 14 }}>ยังไม่มีแชทที่ต้องตาม หรือยังไม่ได้อัปโหลดไฟล์ข้อความ</p>
        </section>
      ) : (
        <div className="table-wrap">
          <table style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th><th>เพจ</th><th>เกรด · ขั้น</th><th>สถานะ</th><th>สินค้า</th><th>ลูกค้า</th><th>ทักล่าสุด</th>
                <th style={{ textAlign: 'right' }}>ข้อความ</th><th><span className="sr">เปิดแชท</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={f.conversationId}>
                  <td className="num" style={{ color: '#6A7A71', fontSize: 13 }}>{i + 1}</td>
                  <td style={{ fontSize: 13, color: '#435349' }}>{pageName(f.pageId)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><GradePill grade={f.grade} /> <span className="stage-pill" style={STAGE_STYLE[f.stage]}>{f.stage}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}><span className="sdot" style={{ background: f.status === 'ไม่เปิดอ่าน' ? '#B4401A' : '#E3A33B' }} />{f.status}</td>
                  <td>{f.product}</td>
                  <td style={{ color: '#435349' }}>{f.kind === 'ใหม่' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'}</td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{f.day ? `${thaiDay(f.day)} ` : ''}{f.last}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{f.msgs}</td>
                  <td style={{ textAlign: 'right', padding: '6px 14px' }}>
                    {f.pancakeUrl ? <a className="btn-ghost" href={f.pancakeUrl} target="_blank" rel="noopener">เปิดใน Pancake</a> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small">ไม่แสดงชื่อลูกค้า เบอร์โทร หรือเนื้อหาข้อความ เพราะเว็บเปิดดูได้ทุกคนที่มีลิงก์ ดูรายละเอียดได้ใน Pancake</p>
    </section>
  )
}
