import { useState } from 'react'
import type { Lead } from '../metrics/leads'
import {
  closedOnDay, dropStages, latestDay, noStageBreakdown, reasonTagStats, topicCoverage, topicStats, whoOf, type NoStage, type ReasonSide, type TopicRow, type Who,
} from '../metrics/reasons'
import { BarList } from './charts'
import { NO_TAGS, OTHER_TAGS } from '../metrics/conversations'
import { fmt, thaiDay } from './viewModel'

const WHO: [Who, string][] = [['all', 'ทั้งหมด'], ['new', 'แชทใหม่'], ['old', 'ลูกค้าเก่า']]

function Topics({ title, rows }: { title: string; rows: TopicRow[] }) {
  return <div className="stack" style={{ gap: 8 }}>
    <h3 style={{ fontSize: 14 }}>{title}</h3>
    {rows.length ? rows.map(r => <div key={r.topic} className="reason-row">
      <span>{r.topic}{r.thin && <> <span className="tag-pill">ข้อมูลยังน้อย</span></>}</span>
      <span className="small">{fmt(r.chats)} แชท · ปิด {fmt(r.closed)}</span>
      <b className="num">{r.rate}%</b>
    </div>) : <p className="desc">ยังไม่มีหัวข้อในกลุ่มนี้</p>}
  </div>
}

function Tags({ title, side, outcome }: { title: string; side: ReasonSide; outcome: string }) {
  return <div className="stack" style={{ gap: 8 }}>
    <h3 style={{ fontSize: 14 }}>{title}</h3>
    <p className="small">ติดแท็กเหตุผลแล้ว {fmt(side.tagged)} จาก {fmt(side.total)} แชทที่{outcome}</p>
    {side.rows.map(([tag, n]) => <div key={tag} className="reason-row" style={{ color: n ? undefined : '#7B8981' }}>
      <span>{tag}</span><b className="num">{fmt(n)}</b>
    </div>)}
  </div>
}

const SHOW = 12

function CountTable({ title, part, label, rows }: { title?: string; part: NoStage; label: string; rows: [string, number][] }) {
  const pct = (k: number) => (part.total ? `${Math.round((k / part.total) * 100)}%` : '—')
  return <div className="table-wrap">
    <table>
      {title && <caption style={{ textAlign: 'left', fontWeight: 600, padding: '0 0 6px' }}>{title}</caption>}
      <thead><tr><th>{label}</th><th style={{ textAlign: 'right' }}>แชท</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
      <tbody>{rows.map(([k, v]) => <tr key={k}>
        <td>{k}</td><td className="num" style={{ textAlign: 'right' }}>{fmt(v)}</td><td className="num" style={{ textAlign: 'right' }}>{pct(v)}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

function NoStageTables({ leads }: { leads: Lead[] }) {
  const { other, none } = noStageBreakdown(leads)
  if (!other.total && !none.total) return null
  const head = other.rows.slice(0, SHOW), rest = other.rows.slice(SHOW)
  return <div className="stack" style={{ gap: 10 }}>
    <h3 style={{ fontSize: 15 }}>แชทที่ไม่มีแท็ก 1.–6.</h3>
    <div className="grid g-380">
      <div className="card" style={{ gap: 8 }}>
        <h3 style={{ fontSize: 14 }}>{OTHER_TAGS} · {fmt(other.total)} แชท</h3>
        {head.length ? <CountTable title="ติดแท็กอะไรไว้แทน" part={other} label="แท็ก" rows={head} /> : <p className="desc">ไม่มี</p>}
        {rest.length > 0 && <details>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>อีก {fmt(rest.length)} แท็ก</summary>
          <CountTable part={other} label="แท็ก" rows={rest} />
        </details>}
        <p className="small">แชทหนึ่งมีได้หลายแท็ก จำนวนจึงรวมเกินได้ · แท็ก 8./9./10. เป็นที่มาลูกค้า ไม่ใช่ขั้น · ไม่นับแท็กวันที่และเลขแอด</p>
      </div>
      <div className="card" style={{ gap: 8 }}>
        <h3 style={{ fontSize: 14 }}>{NO_TAGS} · {fmt(none.total)} แชท</h3>
        {none.total ? <>
          <CountTable title="คุยกันกี่ข้อความ" part={none} label="ข้อความ" rows={none.rows.slice(0, 3)} />
          <CountTable title="เริ่มแชทยังไง" part={none} label="ข้อความแรก" rows={none.rows.slice(3, 5)} />
          <CountTable title="มาจากโฆษณา" part={none} label="ที่มา" rows={none.rows.slice(5)} />
        </> : <p className="desc">ไม่มี</p>}
        <p className="small">ไม่มีแท็กอะไรเลย นอกจากแท็กวันที่หรือเลขแอด</p>
      </div>
    </div>
  </div>
}

// `chats`: every chat of the chosen page (new and returning); `from`/`to`: start days in view; `day`: a picked day, if any
export function Reasons({ chats, from, to, day }: { chats: Lead[]; from: string | null; to: string; day: string | null }) {
  const [who, setWho] = useState<Who>('all')
  const inView = chats.filter(l => (!from || l.startDay >= from) && l.startDay <= to)
  // topics and drop stages compare against the new-chat close rate, so they stay new chats only
  const leads = inView.filter(l => l.isNew)
  const topics = topicStats(leads)
  const reasons = reasonTagStats(whoOf(inView, who))
  const coverage = topicCoverage(leads)
  const closeDay = day ?? latestDay(chats)
  const today = closeDay ? closedOnDay(whoOf(chats, who), closeDay) : null
  const whoLabel = WHO.find(([w]) => w === who)![1]
  return <section className="card" aria-label="ทำไมลูกค้าซื้อ / ไม่ซื้อ" style={{ gap: 18 }}>
    <h2>ทำไมลูกค้าซื้อ / ไม่ซื้อ</h2>
    {!inView.length ? <p className="desc">ยังไม่มีแชทในช่วงนี้</p> : <>
      <p className="desc">ค่าเฉลี่ย {topics.avg}% จาก {fmt(leads.length)} แชทใหม่ · ยังไม่พบหัวข้อ {fmt(topics.none)} แชท</p>
      {coverage.withTopics < coverage.total && <div className="callout">
        ตรวจพบหัวข้อ {fmt(coverage.withTopics)} จาก {fmt(coverage.total)} แชท · แชทที่เหลืออาจไม่มีคำที่เข้าหัวข้อ หรือเป็นไฟล์เก่าที่ยังไม่ได้วิเคราะห์ อัปไฟล์ข้อความเก่าซ้ำเพื่อให้ครบ
      </div>}
      <div className="grid g-380">
        <Topics title="พูดถึงแล้วมักซื้อ" rows={topics.buy} />
        <Topics title="พูดถึงแล้วมักไม่ซื้อ" rows={topics.notBuy} />
      </div>
      <p className="small">หัวข้อคัดจากคำในข้อความ เทียบอัตราปิดกับค่าเฉลี่ยในช่วงเดียวกัน แชทหนึ่งมีได้หลายหัวข้อ จึงรวมกันเกินจำนวนแชทได้ และยังสรุปสาเหตุการซื้อจากตัวเลขนี้ไม่ได้</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 15 }}>เหตุผลที่แอดมินติดแท็ก</h3>
        <div className="chips" role="group" aria-label="กลุ่มลูกค้า">
          {WHO.map(([w, label]) => <button key={w} type="button" className="chip" aria-pressed={who === w} onClick={() => setWho(w)}>{label}</button>)}
        </div>
      </div>
      {today && <div className="callout">
        ปิดการขายในไฟล์วันที่ {thaiDay(closeDay!)} ({whoLabel}) {fmt(today.closed)} แชท · ติดแท็กเหตุผลแล้ว {fmt(today.tagged)} · ยังไม่ติด <b>{fmt(today.closed - today.tagged)}</b> แชท
      </div>}
      <div className="grid g-380">
        <Tags title="ซื้อเพราะ" side={reasons.buy} outcome="ซื้อ" />
        <Tags title="ไม่ซื้อเพราะ" side={reasons.lost} outcome="ยังไม่ซื้อ" />
      </div>
      <p className="small">นับแต่ละแชทครั้งเดียวต่อแท็ก แชทหนึ่งอาจมีหลายเหตุผล และแอดมินอาจยังติดแท็กไม่ครบ · ลูกค้าเก่าคือแชทที่มีแท็ก 8.ลูกค้าเก่า หรือไม่มีแท็กวันที่ของวันแรกที่พบ แท็กปิดของลูกค้าเก่าบางแชทอาจค้างจากการซื้อครั้งก่อน · ปิดการขายในไฟล์วันนั้น นับแชทที่แท็กปิดเพิ่งปรากฏในไฟล์ข้อความของวันนั้นเป็นครั้งแรก</p>
      <h3 style={{ fontSize: 15 }}>คนที่ไม่ซื้อ เงียบไปที่ขั้นไหน</h3>
      <BarList items={dropStages(leads)} color="#B4401A" empty="ยังไม่มีแชทที่ไม่ซื้อ" />
      <p className="small">ขั้นสุดท้ายตามแท็กที่เคยพบในไฟล์ แชทที่ยังไม่ปิดอาจยังคุยอยู่ · แชทที่ไม่มีแท็ก 1.–6. แยกไว้ในตารางด้านล่าง</p>
      <NoStageTables leads={leads} />
    </>}
  </section>
}
