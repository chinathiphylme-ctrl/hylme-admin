import type { Lead } from '../metrics/leads'
import { dropStages, reasonTagStats, topicCoverage, topicStats, type ReasonSide, type TopicRow } from '../metrics/reasons'
import { BarList } from './charts'
import { fmt } from './viewModel'

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

export function Reasons({ leads }: { leads: Lead[] }) {
  const topics = topicStats(leads)
  const reasons = reasonTagStats(leads)
  const coverage = topicCoverage(leads)
  return <section className="card" aria-label="ทำไมลูกค้าซื้อ / ไม่ซื้อ" style={{ gap: 18 }}>
    <h2>ทำไมลูกค้าซื้อ / ไม่ซื้อ</h2>
    {!leads.length ? <p className="desc">ยังไม่มีแชทใหม่ในช่วงนี้</p> : <>
      <p className="desc">ค่าเฉลี่ย {topics.avg}% จาก {fmt(leads.length)} แชทใหม่ · ยังไม่พบหัวข้อ {fmt(topics.none)} แชท</p>
      {coverage.withTopics < coverage.total && <div className="callout">
        ตรวจพบหัวข้อ {fmt(coverage.withTopics)} จาก {fmt(coverage.total)} แชท · แชทที่เหลืออาจไม่มีคำที่เข้าหัวข้อ หรือเป็นไฟล์เก่าที่ยังไม่ได้วิเคราะห์ อัปไฟล์ข้อความเก่าซ้ำเพื่อให้ครบ
      </div>}
      <div className="grid g-380">
        <Topics title="พูดถึงแล้วมักซื้อ" rows={topics.buy} />
        <Topics title="พูดถึงแล้วมักไม่ซื้อ" rows={topics.notBuy} />
      </div>
      <p className="small">หัวข้อคัดจากคำในข้อความ เทียบอัตราปิดกับค่าเฉลี่ยในช่วงเดียวกัน แชทหนึ่งมีได้หลายหัวข้อ จึงรวมกันเกินจำนวนแชทได้ และยังสรุปสาเหตุการซื้อจากตัวเลขนี้ไม่ได้</p>
      <h3 style={{ fontSize: 15 }}>เหตุผลที่แอดมินติดแท็ก</h3>
      <div className="grid g-380">
        <Tags title="ซื้อเพราะ" side={reasons.buy} outcome="ซื้อ" />
        <Tags title="ไม่ซื้อเพราะ" side={reasons.lost} outcome="ยังไม่ซื้อ" />
      </div>
      <p className="small">นับแต่ละแชทครั้งเดียวต่อแท็ก แชทหนึ่งอาจมีหลายเหตุผล และแอดมินอาจยังติดแท็กไม่ครบ</p>
      <h3 style={{ fontSize: 15 }}>คนที่ไม่ซื้อ เงียบไปที่ขั้นไหน</h3>
      <BarList items={dropStages(leads)} color="#B4401A" empty="ยังไม่มีแชทที่ไม่ซื้อ" />
      <p className="small">ขั้นสุดท้ายตามแท็กที่เคยพบในไฟล์ แชทที่ยังไม่ปิดอาจยังคุยอยู่</p>
    </>}
  </section>
}
