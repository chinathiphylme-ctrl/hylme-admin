import { pageName } from '../config/pages'
import { checkByDay, MISSING, MISSING_LABEL, type DayCheck, type Missing } from '../metrics/tagCheck'
import type { ConvRow } from '../parse/types'
import { fmt, thaiDay } from './viewModel'

const R = { textAlign: 'right' } as const
// these rules only apply to some chats, so they read "X จาก Y"
const PART: Missing[] = ['buyReason', 'plainClose', 'lostReason']

function Day({ d, open }: { d: DayCheck; open: boolean }) {
  const pages = d.pageIds.length === 4 ? '4 เพจ' : d.pageIds.map(p => pageName(p)).join(', ')
  return <details open={open} className="stack" style={{ gap: 10 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
      ตรวจแท็ก · {thaiDay(d.day)} · {pages} · {fmt(d.total)} แชท · ครบ {fmt(d.complete)} แชท
    </summary>
    <div className="grid g-380" style={{ marginTop: 10 }}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>ข้อที่ขาด</th><th style={R}>แชท</th></tr></thead>
          <tbody>{MISSING.filter(m => d.counts[m].of > 0).map(m => <tr key={m}>
            <td>{MISSING_LABEL[m]}</td>
            <td className="num" style={R}>{PART.includes(m) ? `${fmt(d.counts[m].missing)} จาก ${fmt(d.counts[m].of)}` : fmt(d.counts[m].missing)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>แอดมิน</th><th style={R}>ยังไม่ครบ</th><th style={R}>จากแชท</th></tr></thead>
          <tbody>{d.byAdmin.map(a => <tr key={a.admin}>
            <td>{a.admin}</td><td className="num" style={R}>{fmt(a.incomplete)}</td><td className="num" style={R}>{fmt(a.of)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    {d.incomplete.length > 0 && <details style={{ marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13 }}>ดูแชทที่ยังไม่ครบ {fmt(d.incomplete.length)} แชท เพื่อเปิดใน Pancake</summary>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead><tr><th>เพจ</th><th>ข้อที่ขาด</th><th>ทักล่าสุด</th><th><span className="sr">เปิดแชท</span></th></tr></thead>
          <tbody>{d.incomplete.map(({ conv: c, missing }) => <tr key={`${c.pageId}|${c.conversationId}`}>
            <td className="small">{pageName(c.pageId)}</td>
            <td className="small">{missing.map(m => MISSING_LABEL[m]).join(', ')}</td>
            <td className="small" style={{ whiteSpace: 'nowrap' }}>{thaiDay(c.day)} {c.lastAt.slice(11, 16)}</td>
            <td>{c.pancakeUrl && <a className="btn-ghost" href={c.pancakeUrl} target="_blank" rel="noopener">เปิดใน Pancake</a>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </details>
}

// shown on the upload screen right after message files are saved; numbers only, no customer names or text
export function TagCheckCard({ convs }: { convs: ConvRow[] }) {
  if (!convs.length) return null
  const days = checkByDay(convs)
  return <div className="card" style={{ gap: 12 }}>
    <div className="stack" style={{ gap: 4 }}>
      <h3>ตรวจแท็กครบไหม</h3>
      <p className="desc">แชทที่ครบ: มีชื่อแอดมิน · ยังไม่ปิดมีแท็กขั้น 1.–10. · ปิดแล้วมีเหตุผลที่ซื้อและใช้ ปิดAds / ปิดOrganic · ลูกค้าเงียบมีเหตุผลที่ไม่ซื้อ</p>
    </div>
    {days.map((d, i) => <Day key={d.day} d={d} open={i === 0} />)}
    <p className="small">แชทหนึ่งขาดได้หลายข้อ · แชทที่มีสองชื่อนับให้ทั้งสองคน · แท็กปิดอาจค้างจากการซื้อครั้งก่อน (ไฟล์ไม่บอกว่าติดแท็กเมื่อไหร่)</p>
  </div>
}
