import { useMemo, useState } from 'react'
import { PAGES, type PageId } from '../../config/pages'
import { importLegacy, saveStaff } from '../../data/followup'
import { parseLegacyCsv, type LegacyRow } from '../../followup/csv'
import { report, type ReportFilter, type Role, type Staff } from '../../followup/report'
import { bangkokToday } from '../../followup/schedule'
import { silentReport, type Listed } from '../../followup/silent'
import { addDays } from '../../metrics/range'
import { rangeLabel, thaiDay } from '../viewModel'
import { errText, money, useToast } from './common'
import type { Ready } from './useFollowup'

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom'
const PRESETS: [Preset, string][] = [['today', 'วันนี้'], ['7d', '7 วัน'], ['30d', '30 วัน'], ['month', 'เดือนนี้'], ['custom', 'กำหนดเอง']]
const ROUNDS = [1, 2, 3, 4, 5, 6, 7]
const RIGHT = { textAlign: 'right' } as const
const dash = (n: number) => (n ? String(n) : '–')

export function Report({ fu, silentDays, reload }: { fu: Ready; silentDays: Map<string, Listed[]>; reload: () => Promise<void> }) {
  const today = bangkokToday()
  const [preset, setPreset] = useState<Preset>('30d')
  const [custom, setCustom] = useState({ from: addDays(today, -6), to: today })
  const [ownerId, setOwnerId] = useState('all')
  const [pageId, setPageId] = useState<PageId | 'all'>('all')
  const [product, setProduct] = useState('all')
  const [toast, showToast] = useToast()

  const range = preset === 'today' ? { from: today, to: today }
    : preset === '7d' ? { from: addDays(today, -6), to: today }
      : preset === '30d' ? { from: addDays(today, -29), to: today }
        : preset === 'month' ? { from: `${today.slice(0, 8)}01`, to: today }
          : custom
  const filter: ReportFilter = { ...range, ownerId, pageId, product }
  const r = useMemo(
    () => report({ leads: fu.leads, events: fu.events, links: fu.links, orders: fu.orders, staff: fu.staff, today }, filter),
    [fu, today, filter.from, filter.to, ownerId, pageId, product], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const silent = silentReport(silentDays, fu.leads, fu.events, range, pageId, ownerId)
  const products = [...new Set(fu.leads.map(l => l.product))].sort((a, b) => a.localeCompare(b, 'th'))
  const maxFollow = Math.max(1, ...r.byOwner.map(o => o.followups))

  return (
    <section className="stack" style={{ gap: 16 }}>
      <div className="filters">
        <div className="chips" role="group" aria-label="ช่วงเวลา">
          {PRESETS.map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={preset === k} onClick={() => setPreset(k)}>{t}</button>)}
        </div>
        {preset === 'custom' && (
          <span className="custom-range">
            <input type="date" aria-label="ตั้งแต่" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
            –
            <input type="date" aria-label="ถึง" value={custom.to} min={custom.from} max={today} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
          </span>
        )}
        <div className="fu-bar">
          <select aria-label="แอดมิน" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
            <option value="all">ทุกแอดมิน</option>
            {fu.staff.filter(s => s.role === 'admin' || fu.leads.some(l => l.ownerId === s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select aria-label="เพจ" value={pageId} onChange={e => setPageId(e.target.value as PageId | 'all')}>
            <option value="all">ทุกเพจ</option>
            {PAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="สินค้า" value={product} onChange={e => setProduct(e.target.value)}>
            <option value="all">ทุกสินค้า</option>
            {products.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <p className="sub">ช่วง {rangeLabel(range.from, range.to)} · "ถึงกำหนดวันนี้" และ "งานค้าง" เป็นสถานะ ณ วันนี้ ไม่ขึ้นกับช่วงที่เลือก</p>

      <div className="grid g-200">
        <Tile label="ถึงกำหนดวันนี้" value={String(r.dueToday)} color="#5C3A06" />
        <Tile label="งานค้าง (เลยกำหนด)" value={String(r.overdue)} color="#C2410C" />
        <Tile label="ติดตามแล้ว" value={`${r.followups}`} note={`ครั้ง · วันนี้ ${r.followupsToday} ครั้ง · ข้าม ${r.skips}`} />
        <Tile label="ซื้อแล้ว" value={`${r.won}`} note="ราย ในช่วงที่เลือก" color="#1F7A4A" />
        <Tile label="ยอดขายหลังติดตาม" value={money(r.sales)} note={`${r.salesOrders} ออเดอร์ที่ยืนยันจากไฟล์ Pancake`} />
      </div>

      {silent.listed > 0 && (
        <section className="card" aria-label="แชทเงียบใหม่" style={{ gap: 6 }}>
          <h2>แชทเงียบใหม่</h2>
          <p style={{ fontSize: 15 }}>ขึ้นรายชื่อ <b>{silent.listed}</b> คน · ตามแล้ว <b>{silent.followed}</b> คน · ซื้อแล้ว <b>{silent.won}</b> คน</p>
          <p className="small">ขึ้นรายชื่อ = แชทที่ถึงขั้นขอราคา ขอโปร ลังเล หรือพร้อมสั่ง แล้วเงียบในไฟล์ข้อความวันใดวันหนึ่งของช่วงนี้ · ตามแล้ว = อยู่ในคิว 7 รอบและมีบันทึกผลอย่างน้อยหนึ่งรอบ (กดในเว็บหรือแท็กติดตามN) · ตัวกรองแอดมินใช้กับ “ตามแล้ว” และ “ซื้อแล้ว” · ตัวกรองสินค้าไม่ใช้กับบรรทัดนี้</p>
        </section>
      )}

      {(r.pending > 0 || r.cancelled > 0 || r.wonNoOrder > 0) && (
        <div className="callout">
          ตรวจสอบยอด: {[
            r.pending > 0 && `ออเดอร์รอตรวจ ${r.pending} รายการ (ยังไม่พบในไฟล์ออเดอร์ที่อัปโหลด)`,
            r.cancelled > 0 && `ออเดอร์ยกเลิก/คืน ${r.cancelled} รายการ (ไม่นับยอด)`,
            r.wonNoOrder > 0 && `ลูกค้าซื้อแล้วแต่ยังไม่ใส่เลขออเดอร์ ${r.wonNoOrder} ราย`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      <section className="card">
        <h2>ผลการทำงานรายแอดมิน</h2>
        <p className="desc">นับตามผู้ดูแลลูกค้า ครั้งที่คนอื่นบันทึกแทนนับให้ผู้ดูแล</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>แอดมิน</th><th style={{ textAlign: 'right' }}>ลูกค้า</th><th style={{ textAlign: 'right' }}>กำลังติดตาม</th><th style={{ textAlign: 'right' }}>ค้าง</th><th>ติดตามแล้ว (ครั้ง)</th><th style={{ textAlign: 'right' }}>ซื้อแล้ว</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
            <tbody>
              {r.byOwner.map(o => (
                <tr key={o.ownerId}>
                  <td className="fu-name">{o.name}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{o.leads}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{o.open}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{o.overdue}</td>
                  <td className="bar-cell">
                    <span className="brow" style={{ gridTemplateColumns: 'minmax(0,1fr) 40px' }}>
                      <span className="track"><span style={{ width: `${(o.followups / maxFollow) * 100}%`, background: '#2B5D49' }} /></span>
                      <b>{o.followups}</b>
                    </span>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{o.won}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{money(o.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>ติดตามรายวัน แยกรอบ</h2>
        <p className="desc">นับครั้งที่กดบันทึกผลในแต่ละวัน (เวลาไทย) ตามตัวกรองด้านบน · รวมรอบที่ระบบบันทึกจากแท็ก Pancake</p>
        {r.byDay.length === 0 ? <p className="desc">ยังไม่มีการติดตามในช่วงนี้</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>วัน</th>{ROUNDS.map(n => <th key={n} style={RIGHT}>รอบ {n}</th>)}<th style={RIGHT}>รวม</th></tr></thead>
              <tbody>
                {r.byDay.map(d => (
                  <tr key={d.day}>
                    <td style={{ whiteSpace: 'nowrap' }}>{thaiDay(d.day)}</td>
                    {d.rounds.map((v, i) => <td key={i} className="num" style={RIGHT}>{dash(v)}</td>)}
                    <td className="num" style={RIGHT}><b>{d.total}</b></td>
                  </tr>
                ))}
                <tr>
                  <td><b>รวมทั้งช่วง</b></td>
                  {ROUNDS.map((_, i) => <td key={i} className="num" style={RIGHT}><b>{dash(r.byDay.reduce((s, d) => s + d.rounds[i], 0))}</b></td>)}
                  <td className="num" style={RIGHT}><b>{r.byDay.reduce((s, d) => s + d.total, 0)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>แยกตามสินค้า</h2>
        {r.byProduct.length === 0 ? <p className="desc">ยังไม่มีลูกค้าตามตัวกรองนี้</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>ลูกค้า</th><th style={{ textAlign: 'right' }}>ติดตามแล้ว</th><th style={{ textAlign: 'right' }}>ซื้อแล้ว</th><th style={{ textAlign: 'right' }}>ยอดขาย</th></tr></thead>
              <tbody>
                {r.byProduct.map(p => (
                  <tr key={p.product}>
                    <td>{p.product}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{p.leads}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{p.followups}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{p.won}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{money(p.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Team fu={fu} onDone={async msg => { await reload(); showToast(msg) }} />
      <Import fu={fu} onDone={async msg => { await reload(); showToast(msg) }} />
      {toast}
    </section>
  )
}

function Tile({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value" style={color ? { color } : undefined}>{value}</span>
      {note && <span className="note">{note}</span>}
    </div>
  )
}

const ROLE_LABEL: Record<Role, string> = { admin: 'แอดมิน', gm: 'GM' }

// the people who can be picked after signing in; nobody is deleted, so their history keeps its names
function Team({ fu, onDone }: { fu: Ready; onDone: (msg: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const people = [...fu.staff].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'th'))

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    setError(null)
    try { await fn(); await onDone(msg) } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const toggle = (s: Staff) => {
    if (s.id === fu.me.id && s.active) { setError('ปิดชื่อของตัวเองไม่ได้ ให้คนอื่นในทีมเป็นคนปิด'); return }
    void run(() => saveStaff({ ...s, active: !s.active }), s.active ? `ปิดการใช้งาน ${s.name} แล้ว` : `เปิดใช้งาน ${s.name} แล้ว`)
  }
  const rename = (s: Staff) => {
    const next = window.prompt('ชื่อใหม่', s.name)?.trim()
    if (next && next !== s.name) void run(() => saveStaff({ ...s, name: next }), `เปลี่ยนชื่อเป็น ${next} แล้ว`)
  }

  return (
    <details className="card">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>รายชื่อทีม ({fu.staff.filter(s => s.active).length} คน)</summary>
      <p className="desc">ชื่อที่ให้เลือกหลังเข้าสู่ระบบ คนที่ออกแล้วให้กดปิด ลูกค้าและประวัติเดิมยังอยู่ ย้ายผู้ดูแลได้ที่หน้าแก้ไขลูกค้า</p>
      <ul className="team-list">
        {people.map(s => (
          <li key={s.id} className={s.active ? '' : 'off'}>
            <span><b>{s.name}</b>{s.name === ROLE_LABEL[s.role] ? '' : ` · ${ROLE_LABEL[s.role]}`}{s.active ? '' : ' · ปิดแล้ว'}{s.id === fu.me.id ? ' · คุณ' : ''}</span>
            <span className="row-actions">
              <button type="button" className="linkbtn" disabled={busy} onClick={() => rename(s)}>เปลี่ยนชื่อ</button>
              <button type="button" className="linkbtn" disabled={busy} onClick={() => toggle(s)}>{s.active ? 'ปิด' : 'เปิดใช้'}</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="fu-bar" onSubmit={e => { e.preventDefault(); void run(async () => { await saveStaff({ id: null, name, role, active: true }); setName('') }, `เพิ่ม ${name.trim()} แล้ว`) }}>
        <label className="field" style={{ flex: '1 1 200px' }}>เพิ่มชื่อ
          <input required maxLength={40} value={name} onChange={e => setName(e.target.value)} placeholder="เช่น พิม" />
        </label>
        <label className="field" style={{ flex: '0 1 140px' }}>บทบาท
          <select value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="admin">แอดมิน</option>
            <option value="gm">GM</option>
          </select>
        </label>
        <button type="submit" className="btn-ghost" style={{ alignSelf: 'flex-end', minHeight: 44 }} disabled={busy || !name.trim()}>เพิ่ม</button>
      </form>
      {error && <p className="msg-err" role="alert">{error}</p>}
    </details>
  )
}

function Import({ fu, onDone }: { fu: Ready; onDone: (msg: string) => Promise<void> }) {
  const [parsed, setParsed] = useState<{ rows: LegacyRow[]; skipped: number; file: string } | null>(null)
  const [owners, setOwners] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const admins = fu.staff.filter(s => s.active)
  const names = parsed ? [...new Set(parsed.rows.map(r => r.ownerName))] : []

  const pick = async (file: File | undefined) => {
    setError(null)
    setParsed(null)
    if (!file) return
    try {
      const res = parseLegacyCsv(await file.text())
      setParsed({ ...res, file: file.name })
      const guess: Record<string, string> = {}
      for (const n of new Set(res.rows.map(r => r.ownerName))) guess[n] = admins.find(s => s.name === n)?.id ?? ''
      setOwners(guess)
    } catch (e) { setError(errText(e)) }
  }

  const go = async () => {
    if (!parsed) return
    setBusy(true)
    setError(null)
    try {
      const n = await importLegacy(parsed.rows.map(r => ({ ...r, ownerId: owners[r.ownerName] })))
      setParsed(null)
      await onDone(`นำเข้า ${n} ราย (ข้ามรายที่ลิงก์แชตมีอยู่แล้ว)`)
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <details className="card">
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>นำเข้าข้อมูลจากเว็บแอปติดตามลูกค้าตัวเดิม (CSV)</summary>
      <p className="desc">ใช้ไฟล์ที่กด "ส่งออก CSV" จากไฟล์ HYLME_Followup_WebApp.html ประวัติรอบเดิมจะนำเข้ามาด้วย ลูกค้าที่ลิงก์แชตซ้ำกับในระบบจะถูกข้าม</p>
      <label className="field" style={{ maxWidth: 420 }}>เลือกไฟล์
        <input type="file" accept=".csv,text/csv" onChange={e => void pick(e.target.files?.[0])} />
      </label>
      {parsed && (
        <div className="stack" style={{ gap: 12 }}>
          <p className="desc">{parsed.file}: อ่านได้ {parsed.rows.length} ราย{parsed.skipped ? ` · ข้าม ${parsed.skipped} แถวที่ข้อมูลไม่ครบ` : ''} เลือกแอดมินให้ชื่อผู้ดูแลในไฟล์เดิม</p>
          <div className="form-grid">
            {names.map(n => (
              <label key={n} className="field">"{n || 'ไม่ระบุ'}" →
                <select value={owners[n] ?? ''} onChange={e => setOwners(o => ({ ...o, [n]: e.target.value }))}>
                  <option value="">เลือกแอดมิน</option>
                  {admins.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="btn" disabled={busy || names.some(n => !owners[n]) || !parsed.rows.length} onClick={() => void go()}>
              {busy ? 'กำลังนำเข้า…' : `นำเข้า ${parsed.rows.length} ราย`}
            </button>
          </div>
        </div>
      )}
      {error && <p className="msg-err" role="alert">{error}</p>}
    </details>
  )
}
