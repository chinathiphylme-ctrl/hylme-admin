import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { pageName, type PageId } from '../config/pages'
import { toBangkokIsoFromAny } from '../data/mappers'
import { fetchOrderChats, fetchOrderChatSync, fetchOrders } from '../data/read'
import { bangkokToday } from '../followup/schedule'
import type { Seen } from '../metrics/conversations'
import { ORDER_WINDOW_DAYS, orderCheck, type OrderChat } from '../metrics/orderCheck'
import { addDays } from '../metrics/range'
import { checkByDay, MISSING, MISSING_LABEL, type DayCheck, type Missing } from '../metrics/tagCheck'
import type { ConvRow, OrderRow } from '../parse/types'
import { fmt, thaiDay } from './viewModel'

const R = { textAlign: 'right' } as const
// these rules only apply to some chats, so they read "X จาก Y"
const PART: Missing[] = ['buyReason', 'plainClose', 'lostReason']

function Day({ d, open, children }: { d: DayCheck; open: boolean; children?: ReactNode }) {
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
    {children}
  </details>
}

type Loaded = { orders: OrderRow[]; pairs: OrderChat[]; syncedAt: string | null }

function Line({ label, n, children }: { label: string; n: number; children?: ReactNode }) {
  return <div className="stack" style={{ gap: 4 }}>
    <span style={{ fontSize: 13 }}>{label} <b className="num">{fmt(n)}</b></span>
    {n > 0 && children}
  </div>
}

function OrderList({ rows }: { rows: { key: string; pageId: string; orderId?: string; when?: string; url?: string }[] }) {
  return <details>
    <summary style={{ cursor: 'pointer', fontSize: 13 }}>ดูรายการ</summary>
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table>
        <thead><tr><th>เพจ</th><th>{rows[0]?.orderId !== undefined ? 'เลขออเดอร์' : 'ทักล่าสุด'}</th><th><span className="sr">เปิดแชท</span></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.key}>
          <td className="small">{pageName(r.pageId as PageId)}</td>
          <td className="small" style={{ whiteSpace: 'nowrap' }}>{r.orderId ?? r.when}</td>
          <td>{r.url && <a className="btn-ghost" href={r.url} target="_blank" rel="noopener">เปิดใน Pancake</a>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>
}

function Orders({ day, data, convs, seen }: { day: string; data: Loaded; convs: ConvRow[]; seen: Seen[] }) {
  const r = orderCheck(day, bangkokToday(), data.orders, data.pairs, convs, seen)
  return <div className="stack" style={{ gap: 8, marginTop: 12 }}>
    <h3 style={{ fontSize: 14 }}>ออเดอร์</h3>
    {!r.hasOrders ? <p className="desc">ยังไม่มีไฟล์ออเดอร์ของวันนี้</p> : <>
      <span style={{ fontSize: 13 }}>ออเดอร์จากแชทเพจ <b className="num">{fmt(r.orders)}</b> ใบ · จับคู่แชทได้ <b className="num">{fmt(r.matched)}</b></span>
      <Line label="แชทติดแท็กปิดแล้ว" n={r.closed} />
      <Line label="แชทยังไม่ติดแท็กปิด" n={r.notClosed.length}>
        <OrderList rows={r.notClosed.map(x => ({ key: x.orderId, pageId: x.conv.pageId, orderId: x.orderId, url: x.conv.pancakeUrl }))} />
      </Line>
      <Line label="หาแชทไม่เจอ (ไม่มีคู่จาก Pancake หรือแชทยังไม่อยู่ในไฟล์ข้อความ)" n={r.noChat.length}>
        <p className="small">เลขออเดอร์: {r.noChat.join(', ')}</p>
      </Line>
    </>}
    <Line label="ติดแท็กปิด แต่ไม่พบออเดอร์" n={r.closedNoOrder.length}>
      <OrderList rows={r.closedNoOrder.map(c => ({ key: c.conversationId, pageId: c.pageId, when: `${thaiDay(c.day)} ${c.lastAt.slice(11, 16)}`, url: c.pancakeUrl }))} />
    </Line>
    {r.line > 0 && <p className="small">ออเดอร์จาก LINE {fmt(r.line)} ใบ — ไม่มีแชทในไฟล์ข้อความ จึงตรวจแท็กไม่ได้</p>}
    {r.windowOpen && <p className="small">ออเดอร์ที่ยืนยันหลังจากนี้อาจยังไม่เข้า (ดูออเดอร์ย้อนหน้าหลัง {ORDER_WINDOW_DAYS} วัน)</p>}
  </div>
}

// the day's orders and their chat pairs, loaded once per set of shown days
function useOrders(days: string[]) {
  const [state, setState] = useState<{ data?: Loaded; error?: string }>({})
  const key = days.join(',')
  useEffect(() => {
    if (!days.length) return
    let live = true
    const from = days[days.length - 1], to = days[0]
    setState({})
    Promise.all([fetchOrders({ from, to }), fetchOrderChats(addDays(from, -ORDER_WINDOW_DAYS), addDays(to, ORDER_WINDOW_DAYS)), fetchOrderChatSync()])
      .then(([orders, pairs, syncedAt]) => { if (live) setState({ data: { orders, pairs, syncedAt } }) })
      .catch(e => { if (live) setState({ error: (e as Error).message }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

const syncLabel = (at: string | null) => {
  if (!at) return 'ยังไม่มีคู่ออเดอร์↔แชทจาก Pancake'
  const t = toBangkokIsoFromAny(at)
  return `คู่ออเดอร์↔แชทจาก Pancake อัปเดตล่าสุด ${thaiDay(t.slice(0, 10))} ${t.slice(11, 16)}`
}

// shown on the upload screen right after message files are saved; numbers only, no customer names or text
export function TagCheckCard({ convs, allConvs, seen }: { convs: ConvRow[]; allConvs: ConvRow[]; seen: Seen[] }) {
  const days = useMemo(() => checkByDay(convs), [convs])
  const orders = useOrders(days.map(d => d.day))
  if (!convs.length) return null
  // the chats just saved win over older copies of the same day until the page reloads them
  const fresh = new Set(convs.map(c => `${c.day}|${c.conversationId}`))
  const chats = [...allConvs.filter(c => !fresh.has(`${c.day}|${c.conversationId}`)), ...convs]
  return <div className="card" style={{ gap: 12 }}>
    <div className="stack" style={{ gap: 4 }}>
      <h3>ตรวจแท็กครบไหม</h3>
      <p className="desc">แชทที่ครบ: มีชื่อแอดมิน · ยังไม่ปิดมีแท็กขั้น 1.–10. · ปิดแล้วมีเหตุผลที่ซื้อและใช้ ปิดAds / ปิดOrganic · ลูกค้าเงียบมีเหตุผลที่ไม่ซื้อ</p>
    </div>
    {days.map((d, i) => <Day key={d.day} d={d} open={i === 0}>
      {orders.error ? <p className="msg-err">โหลดออเดอร์ไม่ได้: {orders.error}</p>
        : orders.data ? <Orders day={d.day} data={orders.data} convs={chats} seen={seen} />
          : <p className="desc">กำลังโหลดออเดอร์…</p>}
    </Day>)}
    <p className="small">แชทหนึ่งขาดได้หลายข้อ · แชทที่มีสองชื่อนับให้ทั้งสองคน · แท็กปิดอาจค้างจากการซื้อครั้งก่อน (ไฟล์ไม่บอกว่าติดแท็กเมื่อไหร่)
      · ออเดอร์ใช้แท็กล่าสุดของแชท · {orders.data ? syncLabel(orders.data.syncedAt) : ''}</p>
  </div>
}
