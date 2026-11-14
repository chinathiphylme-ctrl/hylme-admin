import { useMemo, useState } from 'react'
import { pageName } from '../../config/pages'
import { exportCsv } from '../../followup/csv'
import {
  bangkokToday, dueDay, GOALS, groupEvents, isOpen, nextRound, OFFSETS, queue, ROUNDS, stateOf, stateRank, type FuLead,
} from '../../followup/schedule'
import { addDays } from '../../metrics/range'
import { thaiDay } from '../viewModel'
import { dayYear, StatePill, useToast } from './common'
import { LeadDrawer } from './LeadDrawer'
import { LeadForm } from './LeadForm'
import type { Ready } from './useFollowup'

type Sub = 'today' | 'list' | 'plan'
type TaskFilter = 'open' | 'overdue' | 'due' | 'week' | 'all'
const TASK_FILTERS: [TaskFilter, string][] = [['open', 'วันนี้ + ค้าง'], ['overdue', 'เลยกำหนด'], ['due', 'วันนี้'], ['week', 'ภายใน 7 วัน'], ['all', 'ทั้งหมดที่ยังติดตาม']]
const STATUS_FILTERS: [string, string][] = [
  ['all', 'ทุกสถานะ'], ['open', 'กำลังติดตาม'], ['overdue', 'เลยกำหนด'], ['due', 'ถึงกำหนดวันนี้'], ['won', 'ซื้อแล้ว'],
  ['optout', 'หยุดติดต่อ'], ['paused', 'พักติดตาม'], ['completed', 'ครบ 7 รอบ'],
]

export function Care({ fu, reload, signOut, switchUser }: {
  fu: Ready; reload: () => Promise<void>; signOut: () => Promise<void>; switchUser: () => void
}) {
  const today = bangkokToday()
  const gm = fu.me.role === 'gm'
  const [sub, setSub] = useState<Sub>('today')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('open')
  const [statusFilter, setStatusFilter] = useState('all')
  // everyone sees every customer; an admin starts on their own, the GM on the whole team
  const [owner, setOwner] = useState(gm ? 'all' : fu.me.id)
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ lead: FuLead | null } | null>(null)
  const [toast, showToast] = useToast()

  const byLead = useMemo(() => groupEvents(fu.events), [fu.events])
  const nameOf = (id: string) => fu.staff.find(s => s.id === id)?.name ?? '—'
  const mine = (l: FuLead) => owner === 'all' || l.ownerId === owner
  const matches = (l: FuLead) => {
    const s = q.trim().toLowerCase()
    return mine(l) && (!s || [l.name, l.product, nameOf(l.ownerId), l.pageId ? pageName(l.pageId) : '', l.objection].some(x => x.toLowerCase().includes(s)))
  }
  const rows = useMemo(() => queue(fu.leads, fu.events, today).filter(r => owner === 'all' || r.lead.ownerId === owner), [fu.leads, fu.events, today, owner])
  const counts = {
    due: rows.filter(r => r.state === 'due').length,
    overdue: rows.filter(r => r.state === 'overdue').length,
    open: rows.length,
    won: fu.leads.filter(l => mine(l) && l.status === 'won').length,
  }
  const week = addDays(today, 7)
  const tasks = rows.filter(r => matches(r.lead) && (
    taskFilter === 'all' ? true : taskFilter === 'open' ? r.state !== 'waiting' : taskFilter === 'week' ? r.due <= week : r.state === taskFilter))

  const listed = fu.leads
    .map(l => ({ l, evs: byLead.get(l.id) ?? [], st: stateOf(l, byLead.get(l.id) ?? [], today) }))
    .filter(x => matches(x.l) && (statusFilter === 'all' || (statusFilter === 'open' ? isOpen(x.st) : x.st === statusFilter)))
    .sort((a, b) => stateRank(a.st) - stateRank(b.st) || a.l.name.localeCompare(b.l.name, 'th'))

  const open = fu.leads.find(l => l.id === openId) ?? null
  const saved = async (msg: string) => { await reload(); showToast(msg) }

  const download = () => {
    const names = new Map(fu.staff.map(s => [s.id, s.name]))
    const blob = new Blob([exportCsv(listed.map(x => x.l), fu.events, names, today)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hylme-followup-${today}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1500)
  }

  const ownerSelect = (
    <select aria-label="ผู้ดูแล" value={owner} onChange={e => setOwner(e.target.value)}>
      <option value="all">ทุกคนในทีม</option>
      {fu.staff.filter(s => (s.role === 'admin' && s.active) || s.id === fu.me.id || fu.leads.some(l => l.ownerId === s.id)).map(s => (
        <option key={s.id} value={s.id}>{s.id === fu.me.id ? `${s.name} (ฉัน)` : s.name}</option>
      ))}
    </select>
  )
  const search = (
    <div className="grow"><input type="search" aria-label="ค้นหา" placeholder="ค้นหาชื่อ / รหัส / สินค้า / เพจ" value={q} onChange={e => setQ(e.target.value)} /></div>
  )

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="fu-bar" style={{ justifyContent: 'space-between' }}>
        <div className="fu-tabs" role="tablist" aria-label="มุมมอง">
          {([['today', 'งานติดตามวันนี้'], ['list', 'รายชื่อลูกค้า'], ['plan', 'แผน 7 รอบ']] as [Sub, string][]).map(([k, t]) => (
            <button key={k} type="button" role="tab" className="chip" aria-selected={sub === k} aria-pressed={sub === k} onClick={() => setSub(k)}>{t}</button>
          ))}
        </div>
        <div className="fu-user">
          <span><b>{fu.me.name}</b> · {gm ? 'GM' : 'แอดมิน'}</span>
          <button type="button" className="btn-ghost" onClick={switchUser} title="ใช้เมื่อคนอื่นจะใช้เครื่องนี้">เปลี่ยนคน</button>
          <button type="button" className="btn-ghost" onClick={() => void signOut()}>ออกจากระบบ</button>
          <button type="button" className="btn" onClick={() => setForm({ lead: null })}>＋ เพิ่มลูกค้า</button>
        </div>
      </div>

      <div className="grid g-200">
        <Kpi label="ต้องติดตามวันนี้" value={counts.due} color="#5C3A06" />
        <Kpi label="เลยกำหนด" value={counts.overdue} color="#C2410C" />
        <Kpi label="กำลังติดตาม" value={counts.open} />
        <Kpi label="ซื้อแล้ว" value={counts.won} color="#1F7A4A" />
      </div>

      {sub === 'today' && (
        <>
          <div className="fu-bar">
            <div className="chips" role="group" aria-label="ช่วงงาน">
              {TASK_FILTERS.map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={taskFilter === k} onClick={() => setTaskFilter(k)}>{t}</button>)}
            </div>
            {search}
            {ownerSelect}
          </div>
          {tasks.length === 0 ? <Empty title="ไม่มีงานตามเงื่อนไขนี้" hint="เมื่อถึงวันติดตาม งานจะขึ้นที่นี่ เรียงงานเลยกำหนดก่อน" /> : (
            <>
              <div className="table-wrap fu-table">
                <table>
                  <thead><tr><th>ลูกค้า</th><th>สินค้า</th><th>ผู้ดูแล</th><th>รอบ</th><th>กำหนด</th><th>สถานะ</th><th><span className="sr">บันทึก</span></th></tr></thead>
                  <tbody>
                    {tasks.map(r => (
                      <tr key={r.lead.id} className="click" onClick={() => setOpenId(r.lead.id)}>
                        <td className="fu-name">{r.lead.name}</td>
                        <td>{r.lead.product}</td>
                        <td>{nameOf(r.lead.ownerId)}</td>
                        <td>รอบ {r.round}</td>
                        <td className="num">{thaiDay(r.due)}</td>
                        <td><StatePill state={r.state} late={r.daysLate} /></td>
                        <td><button type="button" className="btn-ghost" onClick={e => { e.stopPropagation(); setOpenId(r.lead.id) }}>บันทึกผล</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="fu-cards">
                {tasks.map(r => (
                  <button key={r.lead.id} type="button" className="fu-card" onClick={() => setOpenId(r.lead.id)}>
                    <span className="fu-name">{r.lead.name}</span>
                    <span className="meta">{r.lead.product} · {nameOf(r.lead.ownerId)} · กำหนด {thaiDay(r.due)}</span>
                    <span className="right"><span className="st st-waiting">รอบ {r.round}</span><StatePill state={r.state} late={r.daysLate} /></span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {sub === 'list' && (
        <>
          <div className="fu-bar">
            {search}
            <select aria-label="สถานะ" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              {STATUS_FILTERS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {ownerSelect}
            <button type="button" className="btn-ghost" style={{ minHeight: 44 }} onClick={download} disabled={!listed.length}>↓ ส่งออก CSV</button>
          </div>
          <p className="small">{listed.length} / {fu.leads.length} ราย</p>
          {listed.length === 0 ? <Empty title="ไม่พบรายชื่อลูกค้า" hint="เปลี่ยนตัวกรอง หรือกดเพิ่มลูกค้า" /> : (
            <>
              <div className="table-wrap fu-table">
                <table>
                  <thead><tr><th>ลูกค้า / เพจ</th><th>สินค้าที่สนใจ</th><th>ผู้ดูแล</th><th>เริ่มคุย</th><th>ติดตามถัดไป</th><th>รอบ</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {listed.map(({ l, evs, st }) => {
                      const r = l.status === 'active' ? nextRound(evs) : null
                      const done = ROUNDS.filter(n => evs.some(e => (e.kind === 'round' || e.kind === 'skip') && e.roundNo === n)).length
                      return (
                        <tr key={l.id} className="click" onClick={() => setOpenId(l.id)}>
                          <td><div className="fu-name">{l.name}</div><span className="small">{l.pageId ? pageName(l.pageId) : '—'}</span></td>
                          <td>{l.product}</td>
                          <td>{nameOf(l.ownerId)}</td>
                          <td className="num">{thaiDay(l.firstDay)}</td>
                          <td className="num">{r ? thaiDay(dueDay(l.firstDay, r)) : '—'}</td>
                          <td className="num">{done}/7</td>
                          <td><StatePill state={st} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="fu-cards">
                {listed.map(({ l, evs, st }) => {
                  const r = l.status === 'active' ? nextRound(evs) : null
                  return (
                    <button key={l.id} type="button" className="fu-card" onClick={() => setOpenId(l.id)}>
                      <span className="fu-name">{l.name}</span>
                      <span className="meta">{l.product} · {nameOf(l.ownerId)}{r ? ` · ถัดไป ${thaiDay(dueDay(l.firstDay, r))}` : ''}</span>
                      <span className="right"><StatePill state={st} /></span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {sub === 'plan' && <Plan today={today} />}

      {open && !form && (
        <LeadDrawer lead={open} events={byLead.get(open.id) ?? []} links={fu.links.filter(k => k.leadId === open.id)} orders={fu.orders}
          staff={fu.staff} onClose={() => setOpenId(null)} onEdit={() => setForm({ lead: open })} onSaved={saved} />
      )}
      {form && (
        <LeadForm lead={form.lead} events={form.lead ? byLead.get(form.lead.id) ?? [] : []} me={fu.me} staff={fu.staff}
          onClose={() => setForm(null)}
          onSaved={async (msg, id) => { setForm(null); setOpenId(id); await saved(msg) }} />
      )}
      {toast}
    </section>
  )
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value" style={color ? { color } : undefined}>{value}</span>
    </div>
  )
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return <div className="table-wrap empty-box"><b>{title}</b>{hint}</div>
}

function Plan({ today }: { today: string }) {
  return (
    <section className="card">
      <div className="stack" style={{ gap: 4 }}>
        <h2>ตารางติดตาม 7 รอบใน 60 วัน</h2>
        <p className="desc">นับวันที่คุยครั้งแรกเป็นวันที่ 1 ตัวอย่างวันที่ด้านล่างคิดจากลูกค้าที่เริ่มคุยวันนี้ ({dayYear(today)})</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>รอบ</th><th>วันที่นับจากเริ่ม</th><th>วันตัวอย่าง</th><th>จุดประสงค์</th></tr></thead>
          <tbody>
            {ROUNDS.map(r => (
              <tr key={r}><td className="num">{r}</td><td>วันที่ {OFFSETS[r - 1]}</td><td className="num">{dayYear(dueDay(today, r))}</td><td>{GOALS[r - 1]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid g-300">
        <div className="callout"><b>กติกาหลัก</b> วันกำหนดไม่เลื่อนตามวันที่ติดตามจริง ถ้าตามช้า รอบถัดไปยังนับจากวันแรกเหมือนเดิม ลูกค้าตอบก่อนกำหนดก็บันทึกล่วงหน้าได้</div>
        <div className="callout"><b>ข้อควรระวัง</b> ซื้อแล้ว หรือลูกค้าไม่ประสงค์รับข้อความ ให้บันทึกทันที ระบบจะหยุดงานรอบต่อไปเอง ไม่ส่งข้อความขายซ้ำโดยไม่มีข้อมูลใหม่</div>
      </div>
    </section>
  )
}

