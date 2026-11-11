import { PAGES, pageName, type PageId } from '../config/pages'
import { convStats, segmentRates, type Seen } from '../metrics/conversations'
import { pageCompare, stuckRanking, summarize, trend } from '../metrics/daily'
import { newChatCloses, type Lead } from '../metrics/leads'
import { adminCloses } from '../metrics/admins'
import { orderStats } from '../metrics/orders'
import { addDays, daysIn, previousRange, type DateRange } from '../metrics/range'
import type { ConvRow, OrderRow, TagRow } from '../parse/types'
import { LeadGrades } from './LeadGrades'
import { Bar, BarList, HourBars, peakHours, Ring, StackedBar, TrendBars } from './charts'
import { ACCENT, buildInsights, CRIT, deltaText, fixList, fmt, rangeLabel, rateColor, thaiDay } from './viewModel'

const SEG_COLORS = ['#2F7D4F', '#E3A33B', '#B4401A', '#A3AFA8']
const SEG_LABELS = ['ยังคุยอยู่/ตอบแล้ว', 'อ่านไม่ตอบ', 'ไม่เปิดอ่าน', 'ทักซ้ำไม่ซื้อ']
const MIX_COLORS = [ACCENT, '#7FA894', '#C9D5CE']

// a chat that appears on several days in the range is counted once, with its latest tags
function latestPerConv(convs: ConvRow[]): ConvRow[] {
  const m = new Map<string, ConvRow>()
  for (const c of convs) {
    const prev = m.get(c.conversationId)
    if (!prev || prev.day < c.day) m.set(c.conversationId, c)
  }
  return [...m.values()]
}

function pagesLabel(convs: ConvRow[]): string {
  const ids = new Set(convs.map(c => c.pageId))
  if (ids.size === PAGES.length) return 'ทุกเพจ'
  return PAGES.filter(p => ids.has(p.id)).map(p => p.name).join(', ')
}

export function Overview({ rows, convs, orders, leads, seen, range, page, setPage, overrides, adNames, followCount, goFollow }: {
  rows: TagRow[]; convs: ConvRow[]; orders: OrderRow[]; leads: Lead[]; seen: Seen[]; range: DateRange; page: PageId | 'all'; setPage: (p: PageId | 'all') => void
  overrides: Record<string, string>; adNames: Record<string, string>; followCount: number; goFollow: () => void
}) {
  const s = summarize(rows, overrides, range, page)
  const prev = previousRange(range)
  const p = summarize(rows, overrides, prev, page)
  const hasPrev = rows.some(r => r.day >= prev.from && r.day <= prev.to && (page === 'all' || r.pageId === page))
  const stuck = stuckRanking(s)
  const top = stuck[0]
  const label = rangeLabel(range.from, range.to)
  const name = pageName(page)
  const pages = pageCompare(rows, overrides, range)

  const pageConvs = convs.filter(c => page === 'all' || c.pageId === page)
  const cv = latestPerConv(pageConvs)
  const cs = convStats(cv)
  const row = (st: string) => cs.matrix.find(m => m.stage === st) ?? { read: 0, unread: 0 }
  const insights = buildInsights({
    readySilent: row('พร้อมสั่ง').read + row('พร้อมสั่ง').unread,
    priceRead: row('ขอราคา').read,
    priceUnread: row('ขอราคา').unread,
    convNew: cs.mix[0][1],
    closedNew: cs.closedNew,
    convLabel: pagesLabel(cv),
    // new-chat closes only, so returning customers no longer explain a gap between pages (old: 0)
    pages: page === 'all' ? pages.map(x => ({ name: pageName(x.pageId), ...newChatCloses(leads, range, x.pageId), old: 0 })) : [],
  })
  const seg = segmentRates(pageConvs, seen, range)
  const os = orderStats(orders, page)
  const closes = adminCloses(leads, range, page)
  const adminRows = [...os.admins, ...closes.filter(c => !os.admins.some(a => a.admin === c.admin))
    .map(c => ({ admin: c.admin, revenue: 0, orders: 0, avg: 0, share: 0 }))]
  const aMax = Math.max(1, ...os.admins.map(a => a.revenue))

  const summary = s.newChats
    ? `แชทใหม่ ${fmt(s.newChats)} แชท ปิดการขายได้ ${fmt(s.closed)} แชท` + (top ? ` ลูกค้าค้างมากที่สุดที่ “${top.group}” ${fmt(top.count)} แชท ควรตามให้ทันภายในวัน` : '')
    : `${name} ไม่มีแชทที่ติดแท็กเลยใน${label} ควรเช็กว่าเพจนี้มีลูกค้าทักเข้ามาไหม หรือแอดมินยังไม่ได้ติดแท็ก`

  const cl = s.closedSplit
  const closedNote = `Ads ${fmt(cl.ads)} · Organic ${fmt(cl.organic)}` + (cl.unspecified ? ` · ไม่ระบุ ${fmt(cl.unspecified)}` : '')
    + (s.closedRemoved ? ` · หักแท็กปิดที่ถูกถอด/เปลี่ยน ${fmt(s.closedRemoved)}` : '')
  // the rate counts new chats only; everything else that closed is shown beside it, never divided
  const nc = newChatCloses(leads, range, page)
  const otherClosed = Math.max(0, s.closed - nc.closed)

  const kpis = [
    { label: 'แชทใหม่', value: s.newChats, before: p.newChats, note: 'แท็กวันที่ของแต่ละวัน', dot: '#7FA894' },
    { label: 'ปิดการขาย', value: s.closed, before: p.closed, note: `${closedNote} · จากแชทใหม่ ${fmt(nc.closed)} · ลูกค้าเก่า/แชทอื่น ${fmt(otherClosed)}`, dot: ACCENT },
    { label: 'พร้อมสั่ง', value: s.ready, before: p.ready, note: 'แท็ก 5.พร้อมสั่ง', dot: '#D99A2B' },
    { label: 'รอตามต่อ', value: s.pending, before: p.pending, note: 'ไม่เปิดอ่าน + อ่านไม่ตอบ', dot: CRIT },
  ]

  const jMax = Math.max(1, ...s.journey.map(j => j.count))
  const journeyRow = (j: (typeof s.journey)[number], i: number) => {
    const isTop = j.group === top?.group
    const closed = j.group === 'ปิดการขาย'
    const color = isTop ? CRIT : closed ? ACCENT : i >= 6 ? '#D8B4A0' : '#9DB5A8'
    const badge = isTop ? { background: CRIT, color: '#fff' } : closed ? { background: ACCENT, color: '#fff' } : { background: '#EDF2EF', color: '#55665D' }
    return (
      <div className="jrow" key={j.group}>
        <div className="jline">
          <span className="badge" style={badge}>{i + 1}</span>
          <span className="jname">{j.group}</span>
          <Bar value={j.count} max={jMax} color={color} />
          <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(j.count)}</span>
          <span className="num" style={{ textAlign: 'right', fontSize: 12, color: '#55665D' }}>{j.share == null ? '—' : `${j.share}%`}</span>
        </div>
        <span className="jtags">{j.tags || 'ไม่มีแท็กในกลุ่มนี้'}</span>
      </div>
    )
  }
  const fixes = fixList(s)

  const trendRange = daysIn(range).length >= 7 ? range : { from: addDays(range.to, -13), to: range.to }
  const trendDays = trend(rows, trendRange, page).map(d => ({ ...d, current: d.day >= range.from && d.day <= range.to }))
  const mMax = Math.max(1, ...cs.matrix.map(m => m.talking + m.read + m.unread + m.repeat))

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-text">
          <span className="k">สรุป{label} · {name}</span>
          <p>{summary}</p>
        </div>
        <div className="hero-side">
          <Ring rate={nc.rate} size={148} width={14} color="#7FD3A8" track="#2A4A3D">
            <span className="num" style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.1 }}>{nc.rate == null ? '—' : `${nc.rate}%`}</span>
            <span style={{ fontSize: 12, color: '#B5C8BD' }}>อัตราปิดแชทใหม่</span>
          </Ring>
          <div className="note">
            <span>แชทใหม่ปิดได้ <b>{fmt(nc.closed)}</b> จาก <b>{fmt(nc.newChats)}</b> แชท</span>
            <small>ปิดทั้งหมด {fmt(s.closed)} ({closedNote}) · ลูกค้าเก่าซื้อซ้ำหรือแชทอื่น {fmt(otherClosed)}</small>
            <small>อัตราปิดนับจากไฟล์ข้อความ เฉพาะแชทใหม่ที่เริ่มในช่วงนี้และปิดได้ ลูกค้าเก่าที่กลับมาซื้อแยกไว้ ไม่เอามาหาร</small>
          </div>
        </div>
      </section>

      <section aria-label="ตัวเลขหลัก" className="grid g-200">
        {kpis.map(k => (
          <div className="kpi" key={k.label}>
            <span className="label"><span className="dot" style={{ background: k.dot }} />{k.label}</span>
            <span className="value">{fmt(k.value)}</span>
            <span className="note">{k.note}</span>
            <span className="delta">{hasPrev ? deltaText(k.value, k.before, true) : `เทียบช่วงก่อน · ยังไม่มีข้อมูล ${rangeLabel(prev.from, prev.to)}`}</span>
          </div>
        ))}
      </section>

      <LeadGrades leads={leads} range={range} page={page} />

      <section className="card" style={{ gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px 16px' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2>ยอดขายรายแอดมิน</h2>
            <p className="desc">จากไฟล์ออเดอร์ของ Pancake นับตามคนที่ยืนยันออเดอร์ ไม่รวมออเดอร์ที่ยกเลิกและบัญชี chinathiphylme{page === 'all' ? '' : ' เฉพาะออเดอร์จากเพจนี้'}</p>
          </div>
          {os.count > 0 && (
            <span style={{ fontSize: 14, color: '#435349' }}>
              รวม <b className="num" style={{ color: '#12241B' }}>{fmt(os.count)}</b> ออเดอร์ · <b className="num" style={{ color: '#12241B' }}>฿{fmt(os.revenue)}</b> · เฉลี่ย ฿{fmt(os.avg)}/ออเดอร์
            </span>
          )}
        </div>
        {os.count > 0 || closes.some(c => c.chats > 0) ? (
          <div className="grid g-380">
            <div className="stack" style={{ gap: 12 }}>
              {adminRows.map(a => (
                <div key={a.admin} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{a.admin}</span>
                  <span className="num" style={{ textAlign: 'right' }}><b>฿{fmt(a.revenue)}</b> <span className="small">({a.share}%)</span></span>
                  <span style={{ gridColumn: '1 / -1' }}><Bar value={a.revenue} max={aMax} color={ACCENT} /></span>
                  <span className="small" style={{ gridColumn: '1 / -1' }}>{fmt(a.orders)} ออเดอร์ · เฉลี่ย ฿{fmt(a.avg)}/ออเดอร์</span>
                  {closes.filter(c => c.admin === a.admin).map(c => <span key={c.admin} className="small" style={{ gridColumn: '1 / -1' }}>
                    แชทที่ดูแล {fmt(c.chats)} · ปิดได้ {fmt(c.closed)} · อัตราปิด {c.rate == null ? '—' : `${c.rate}%`}
                  </span>)}
                </div>
              ))}
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <h3 style={{ fontSize: 14 }}>สินค้าที่ขายได้ (ชิ้น)</h3>
              <BarList items={os.products} color="#3F6F8F" empty="—" />
              {page === 'all' && os.sources.length > 1 && (
                <>
                  <h3 style={{ fontSize: 14, marginTop: 6 }}>ออเดอร์มาจาก</h3>
                  <BarList items={os.sources} color="#7FA894" empty="—" />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="dashed">
            <b>ยังไม่มีไฟล์ออเดอร์ของ{label}</b>
            <span>export ออเดอร์รายวันจาก Pancake (ไฟล์ orders_วันเดือน.xlsx) แล้วอัปโหลดที่เมนูอัปโหลดไฟล์ จะเห็นยอดขายและจำนวนออเดอร์ของแต่ละแอดมิน</span>
          </div>
        )}
        <p className="small">อัตราปิดนับจากแท็กชื่อแอดมิน ตั้งแต่ 4 พ.ย. 2026 ที่เริ่มติดแท็กชื่อตอนตอบแชท · นับแชทที่เริ่มในช่วงที่เลือก แชทที่มีสองชื่อนับให้ทั้งสองคน</p>
      </section>

      {insights.length > 0 && (
        <section className="stack" style={{ gap: 12 }}>
          <h2 className="section-title">สิ่งที่ควรรู้</h2>
          <div className="grid g-270">
            {insights.map(i => (
              <div className="insight" key={i.kind}>
                <span className={`tag tone-${i.tone}`}>{i.kind}</span>
                <span className="text">{i.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid g-460">
        <section className="card">
          <div className="stack" style={{ gap: 4 }}>
            <h2>ลูกค้าติดตรงไหน</h2>
            <p className="desc">จำนวนแชทที่ติดแท็กแต่ละจุด และคิดเป็นกี่ % ของแชทใหม่ ใต้แถวคือแท็กที่นับรวม</p>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#55665D' }}>ระหว่างทางสู่การซื้อ</span>
            {s.journey.slice(0, 6).map((j, i) => journeyRow(j, i))}
            <span className="jsplit">หลุดออกจากการคุย</span>
            {s.journey.slice(6).map((j, i) => journeyRow(j, i + 6))}
          </div>
          <div className="legend">
            <span><span className="dot" style={{ background: CRIT }} />ติดมากที่สุด</span>
            <span><span className="dot" style={{ background: ACCENT }} />ปิดการขาย</span>
            <span><span className="dot" style={{ background: '#9DB5A8' }} />ระหว่างทาง</span>
            <span><span className="dot" style={{ background: '#D8B4A0' }} />หลุดออก</span>
          </div>
        </section>

        <section className="card">
          <div className="stack" style={{ gap: 4 }}>
            <h2>ควรแก้ตรงไหนก่อน</h2>
            <p className="desc">เรียงจากจุดที่ลูกค้าค้างมากที่สุด พร้อมสิ่งที่แอดมินทำได้วันนี้</p>
          </div>
          {fixes.length ? (
            <ol className="fix">
              {fixes.map((f, i) => (
                <li key={f.group} className={i === 0 ? 'first' : ''}>
                  <span className="rank">{i + 1}</span>
                  <span className="stack" style={{ gap: 3, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{f.name}</span>
                    <span className="advice">{f.advice}</span>
                  </span>
                  <span className="cnt"><b>{fmt(f.count)}</b>แชท</span>
                </li>
              ))}
            </ol>
          ) : <p className="desc" style={{ fontSize: 14 }}>เพจนี้ไม่มีแชทที่ติดแท็กในช่วงนี้</p>}
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={goFollow}>
            ดูแชทที่ต้องตาม {followCount} แชท
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
          </button>
        </section>
      </div>

      <section className="stack" style={{ gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px 16px' }}>
          <h2 className="section-title">เทียบเพจ</h2>
          <span className="desc">กดการ์ดเพื่อดูเฉพาะเพจนั้น กดซ้ำเพื่อกลับไปดูทุกเพจ</span>
        </div>
        <div className="grid g-240">
          {pages.map(x => {
            const on = x.pageId === page
            const st = stuckRanking(x)[0]
            const empty = !x.newChats
            const pc = newChatCloses(leads, range, x.pageId)
            const color = rateColor(pc.rate)
            return (
              <button key={x.pageId} type="button" aria-pressed={on} className={`pagecard${empty && !on ? ' empty' : ''}`} onClick={() => setPage(on ? 'all' : x.pageId)}>
                <span className="top">
                  <span className="platform">{PAGES.find(q => q.id === x.pageId)!.platform}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: on ? ACCENT : '#8A5A0B' }}>{on ? 'กำลังดู' : empty ? 'ไม่มีข้อมูล' : ''}</span>
                </span>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{pageName(x.pageId)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
                  <Ring rate={pc.rate} size={72} width={8} color={color} track="#E8EEEA">
                    <span className="num" style={{ fontWeight: 600, fontSize: 15, color }}>{pc.rate == null ? '—' : `${pc.rate}%`}</span>
                  </Ring>
                  <span className="stats">
                    <span>แชทใหม่ปิด</span><b>{fmt(pc.closed)}/{fmt(pc.newChats)}</b>
                    <span>ปิดทั้งหมด</span><b>{fmt(x.closed)}</b>
                    <span>รอตามต่อ</span><b>{fmt(x.pending)}</b>
                  </span>
                </span>
                <span className="foot">{st ? `ติดมากสุด: ${st.group} ${fmt(st.count)} แชท` : 'ไม่มีแท็กในช่วงนี้ เช็กว่าแอดมินติดแท็กไหม'}</span>
              </button>
            )
          })}
        </div>
      </section>

      {cv.length > 0 ? (
        <section className="stack" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
              <h2 className="section-title">เจาะลึกจากข้อความรายแชท</h2>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#3E5146', background: '#E3EDE7', borderRadius: 999, padding: '2px 10px' }}>{pagesLabel(cv)} · {fmt(cs.total)} แชท</span>
            </div>
            <p className="desc" style={{ maxWidth: '90ch' }}>แชทที่ลูกค้าทักเข้ามาใน{label} ใช้แท็ก ณ ตอน export ตัวเลขจึงไม่เท่ากับสถิติแท็กด้านบน เพจอื่นจะขึ้นเมื่ออัปโหลดไฟล์ข้อความของเพจนั้น</p>
          </div>

          <div className="card">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px 20px', alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 4 }}>
                <h3>แชทค้างแต่ละขั้น ลูกค้าตอบหรือยัง</h3>
                <p className="desc">ไม่รวมแชทที่ปิดแล้ว {fmt(cs.closedNow)} แชท</p>
              </div>
              <div className="legend">{SEG_LABELS.map((l, i) => <span key={l}><span className="dot" style={{ background: SEG_COLORS[i] }} />{l}</span>)}</div>
            </div>
            <div className="stack" style={{ gap: 14 }}>
              {cs.matrix.map(m => {
                const total = m.talking + m.read + m.unread + m.repeat
                const silent = m.read + m.unread
                const vals = [m.talking, m.read, m.unread, m.repeat]
                return (
                  <div className="mrow" key={m.stage}>
                    <span style={{ fontWeight: 500 }}>{m.stage === 'อื่นๆ' ? 'ไม่มีแท็กขั้น' : m.stage}</span>
                    <span className="stack" style={{ gap: 4, minWidth: 0 }}>
                      <span style={{ width: `${Math.max(4, (total / mMax) * 100)}%` }}>
                        <StackedBar height={18} gap={2} parts={vals.map((v, i) => ({ value: v, color: SEG_COLORS[i], title: `${SEG_LABELS[i]} ${v}` }))} />
                      </span>
                      <span className="small">{silent ? `เงียบ ${silent} จาก ${total} แชท (${Math.round((silent / total) * 100)}%)` : 'ไม่มีแชทที่เงียบ'}</span>
                    </span>
                    <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(total)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="grid g-380">
            <div className="card" style={{ gap: 14 }}>
              <h3>ใครทักเข้ามา</h3>
              <StackedBar height={22} gap={3} parts={cs.mix.map(([l, n], i) => ({ value: n, color: MIX_COLORS[i], title: `${l} ${n}` }))} />
              <div className="stack" style={{ gap: 8 }}>
                {cs.mix.map(([l, n], i) => (
                  <span key={l} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto', gap: 10, alignItems: 'center', fontSize: 14 }}>
                    <span className="dot" style={{ width: 12, height: 12, background: MIX_COLORS[i] }} />
                    <span>{l}</span>
                    <b className="num">{fmt(n)}</b>
                  </span>
                ))}
              </div>
              {cs.mix[0][1] > 0 && (
                <div className="callout">แชทใหม่ {fmt(cs.mix[0][1])} แชท มีแท็กปิด <b>{fmt(cs.closedNew)}</b> แชท ณ ตอน export แชทที่มีแท็กปิดอีก {fmt(cs.closedNow - cs.closedNew)} แชทเป็นลูกค้าเก่าหรือแชทที่ไม่มีแท็กวันที่</div>
              )}
            </div>
            <div className="card" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 4 }}>
                <h3>แชทตามชั่วโมงที่ลูกค้าทักล่าสุด</h3>
                <p className="desc">ช่วงพีคคือ {peakHours(cs.hours) || '—'} ควรมีแอดมินตอบทันช่วงนี้</p>
              </div>
              <HourBars hours={cs.hours} accent={ACCENT} />
            </div>
          </div>

          {seg.ready ? (
            <div className="grid g-300">
              {(['สินค้า', 'กลุ่มลูกค้า', 'ข้อความแรก'] as const).map(dim => {
                const items = seg.rows.filter(r => r.dim === dim).sort((a, b) => b.chats - a.chats)
                return (
                  <div className="card" key={dim} style={{ gap: 12 }}>
                    <h3>อัตราปิดแยกตาม{dim}</h3>
                    {items.length ? items.map(r => (
                      <div key={r.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 12px', fontSize: 14 }}>
                        <span>{r.name}</span>
                        <b className="num" style={{ color: rateColor(r.rate) }}>{r.rate}%</b>
                        <span className="small" style={{ gridColumn: '1 / -1' }}>ปิด {fmt(r.closed)} จาก {fmt(r.chats)} แชทที่เริ่มในช่วงนี้</span>
                      </div>
                    )) : <p className="desc">ยังไม่มีแชทที่เริ่มในช่วงนี้</p>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="dashed">
              <b>ทำไมยังไม่แสดงอัตราปิดแยกตามสินค้าหรือข้อความแรก</b>
              <span>{seg.reason}{cs.closedStale > 0 ? ` ตอนนี้มี ${fmt(cs.closedStale)} แชทที่มีทั้ง “ปิด” และ “ทักซ้ำไม่ซื้อ”` : ''}</span>
            </div>
          )}
        </section>
      ) : (
        <section className="card" style={{ border: '1px dashed #C9D3CD', fontSize: 14, color: '#435349', padding: '18px 20px' }}>
          ยังไม่มีไฟล์ข้อความของ{page === 'all' ? 'ช่วงนี้' : 'เพจนี้ในช่วงนี้'} เมื่ออัปโหลดแล้วจะเห็นว่าลูกค้าแต่ละขั้นตอบหรือยัง ใครทักเข้ามา และช่วงเวลาที่ลูกค้าทัก
        </section>
      )}

      <div className="grid g-300">
        <section className="card full" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 4 }}>
            <h2>แนวโน้มรายวัน · {name}</h2>
            <div className="legend">
              <span><span className="dot" style={{ background: '#B9C8C0' }} />แชทใหม่</span>
              <span><span className="dot" style={{ background: ACCENT }} />ปิดการขาย</span>
              <span>แท่งเข้มคือช่วงที่เลือก</span>
            </div>
          </div>
          <TrendBars days={trendDays} accent={ACCENT} label={thaiDay} />
        </section>
        <section className="card" style={{ gap: 14 }}>
          <h2 style={{ fontSize: 16 }}>สินค้าที่ลูกค้าถาม</h2>
          <BarList items={s.products} color={ACCENT} empty="ไม่มีแท็กสินค้าในช่วงนี้" />
        </section>
        <section className="card" style={{ gap: 14 }}>
          <h2 style={{ fontSize: 16 }}>ลูกค้ามาจากไหน</h2>
          <BarList items={s.sources} color="#3F6F8F" empty="—" />
        </section>
        <section className="card" style={{ gap: 14 }}>
          <h2 style={{ fontSize: 16 }}>แชทจากโฆษณา</h2>
          {s.ads.length ? s.ads.map(([tag, n]) => (
            <div key={tag} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 12px', alignItems: 'baseline', fontSize: 14 }}>
              <span style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{adNames[tag] ? `${adNames[tag]} · ${tag}` : `แอด ${tag}`}</span>
              <span style={{ whiteSpace: 'nowrap', color: '#55665D', fontSize: 13 }}><b className="num" style={{ fontSize: 15, color: '#12241B' }}>{fmt(n)}</b> แชท</span>
            </div>
          )) : <p className="desc">ยังไม่มีแชทที่ติดแท็กโฆษณาในช่วงนี้</p>}
          <p className="small" style={{ lineHeight: 1.6 }}>แท็กที่เป็นเลขโฆษณาเข้ากลุ่มนี้อัตโนมัติ ตั้งชื่อเรียกได้ที่เมนูจัดกลุ่มแท็ก</p>
        </section>
      </div>
    </div>
  )
}
