import { pageName } from '../config/pages'
import { isDateOrAdTag, NO_TAGS, noStageChats, OTHER_TAGS, replyOf } from '../metrics/conversations'
import type { ConvRow } from '../parse/types'
import { fmt, thaiDay } from './viewModel'

const SHOW_TAGS = 12
const R = { textAlign: 'right' } as const
const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : '—')
const last = (c: ConvRow) => `${thaiDay(c.day)} ${c.lastAt.slice(11, 16)}`

function TagTable({ rows, total }: { rows: { tag: string; chats: number; silent: number }[]; total: number }) {
  return <div className="table-wrap">
    <table>
      <thead><tr><th>แท็กที่ติดไว้แทน</th><th style={R}>แชท</th><th style={R}>%</th><th style={R}>เงียบ</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.tag}>
        <td>{r.tag}</td><td className="num" style={R}>{fmt(r.chats)}</td><td className="num" style={R}>{pct(r.chats, total)}</td>
        <td className="num" style={R}>{fmt(r.silent)}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function CountTable({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return <div className="table-wrap">
    <table>
      <thead><tr><th>{title}</th><th style={R}>แชท</th><th style={R}>%</th></tr></thead>
      <tbody>{rows.map(([k, v]) => <tr key={k}>
        <td>{k}</td><td className="num" style={R}>{fmt(v)}</td><td className="num" style={R}>{pct(v, total)}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

// the chats themselves, so an admin can open each one and add a stage tag; no names or message text
function ChatList({ chats, withTags }: { chats: ConvRow[]; withTags: boolean }) {
  return <details>
    <summary style={{ cursor: 'pointer', fontSize: 13 }}>ดูแชททั้ง {fmt(chats.length)} แชท เพื่อเปิดใน Pancake</summary>
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table>
        <thead><tr><th>เพจ</th>{withTags ? <><th>แท็กที่มี</th><th>สถานะ</th></> : <th>เริ่มจาก</th>}<th style={R}>ข้อความ</th><th>ทักล่าสุด</th><th><span className="sr">เปิดแชท</span></th></tr></thead>
        <tbody>{chats.map(c => <tr key={c.conversationId}>
          <td className="small">{pageName(c.pageId)}</td>
          {withTags
            ? <><td className="small">{c.tags.filter(t => !isDateOrAdTag(t)).join(', ')}</td><td className="small">{replyOf(c.tags)}</td></>
            : <td className="small">{c.firstKind === 'button' ? 'กดปุ่ม' : 'พิมพ์เอง'}</td>}
          <td className="num" style={R}>{fmt(c.msgCount)}</td>
          <td className="small" style={{ whiteSpace: 'nowrap' }}>{last(c)}</td>
          <td>{c.pancakeUrl && <a className="btn-ghost" href={c.pancakeUrl} target="_blank" rel="noopener">เปิดใน Pancake</a>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>
}

export function NoStageCard({ convs }: { convs: ConvRow[] }) {
  const { other, none } = noStageChats(convs)
  if (!other.chats.length && !none.chats.length) return null
  const head = other.tags.slice(0, SHOW_TAGS), rest = other.tags.slice(SHOW_TAGS)
  return <div className="card" style={{ gap: 12 }}>
    <div className="stack" style={{ gap: 4 }}>
      <h3>แชทที่ยังไม่มีแท็ก 1.–10.</h3>
      <p className="desc">แชทที่ยังไม่ปิดและยังไม่ได้ติดแท็กขั้น จึงไม่รู้ว่าลูกค้าติดตรงไหน เปิดแชทใน Pancake แล้วติดแท็กขั้นให้ได้เลย</p>
    </div>
    <div className="grid g-380">
      <div className="stack" style={{ gap: 8 }}>
        <h3 style={{ fontSize: 14 }}>{OTHER_TAGS} · {fmt(other.chats.length)} แชท</h3>
        <p className="small">เงียบ {fmt(other.silent)} จาก {fmt(other.chats.length)} แชท ({pct(other.silent, other.chats.length)}) · เงียบ = มีแท็กอ่านไม่ตอบ หรือไม่เปิดอ่าน</p>
        {head.length > 0 && <TagTable rows={head} total={other.chats.length} />}
        {rest.length > 0 && <details>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>อีก {fmt(rest.length)} แท็ก</summary>
          <TagTable rows={rest} total={other.chats.length} />
        </details>}
        {other.chats.length > 0 && <ChatList chats={other.chats} withTags />}
        <p className="small">แชทหนึ่งมีได้หลายแท็ก จำนวนจึงรวมเกินได้ · ไม่นับแท็กวันที่และเลขแอด</p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h3 style={{ fontSize: 14 }}>{NO_TAGS} · {fmt(none.chats.length)} แชท</h3>
        {none.chats.length > 0 ? <>
          <CountTable title="คุยกันกี่ข้อความ" rows={none.rows.slice(0, 3)} total={none.chats.length} />
          <CountTable title="เริ่มแชทยังไง" rows={none.rows.slice(3, 5)} total={none.chats.length} />
          <CountTable title="ที่มา" rows={none.rows.slice(5)} total={none.chats.length} />
          <ChatList chats={none.chats} withTags={false} />
        </> : <p className="desc">ไม่มี</p>}
        <p className="small">ไม่มีแท็กอะไรเลย นอกจากแท็กวันที่หรือเลขแอด · ระบบรู้ว่าเงียบจากแท็กอ่านไม่ตอบ/ไม่เปิดอ่าน แชทกลุ่มนี้จึงบอกไม่ได้ว่าลูกค้าเงียบหรือยังคุยอยู่</p>
      </div>
    </div>
  </div>
}
