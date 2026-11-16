import { useState } from 'react'
import { pageName } from '../../config/pages'
import { deleteLead, linkOrder, recordRound, setStatus, skipRound, unlinkOrder } from '../../data/followup'
import { orderLive, type OrderLink, type Staff } from '../../followup/report'
import {
  bangkokToday, dueDay, eventBy, GOALS, nextRound, OFFSETS, RESULT_LABEL, ROUNDS, STATUS_LABEL, stateOf,
  type FuEvent, type FuLead, type LeadStatus, type RoundResult,
} from '../../followup/schedule'
import type { OrderRow } from '../../parse/types'
import { thaiDay } from '../viewModel'
import { dayYear, errText, Modal, money, StatePill, stamp } from './common'

type Props = {
  lead: FuLead; events: FuEvent[]; links: OrderLink[]; orders: OrderRow[]; staff: Staff[]
  onClose: () => void; onEdit: () => void; onSaved: (msg: string) => Promise<void>
}

const RESULTS: [RoundResult, string][] = [['sent', 'ส่งข้อมูลแล้ว'], ['waiting', 'รอลูกค้าตอบ'], ['won', 'ซื้อแล้ว'], ['optout', 'ขอหยุดติดต่อ']]

export function LeadDrawer({ lead, events, links, orders, staff, onClose, onEdit, onSaved }: Props) {
  const today = bangkokToday()
  const st = stateOf(lead, events, today)
  const round = lead.status === 'active' ? nextRound(events) : null
  const nameOf = (id: string | null) => staff.find(s => s.id === id)?.name ?? '—'
  const safeUrl = /^https?:\/\//i.test(lead.chatUrl) ? lead.chatUrl : ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    setError(null)
    try { await fn(); await onSaved(msg) } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Modal drawer title={`${lead.name} / ${lead.product}`} eyebrow="รายละเอียดลูกค้า" onClose={onClose}>
      <div className="fu-user">
        <StatePill state={st} />
        <span>{nameOf(lead.ownerId)} · เริ่มคุย {dayYear(lead.firstDay)}</span>
      </div>
      <div className="facts">
        <div>เพจ<b>{lead.pageId ? pageName(lead.pageId) : 'ไม่ระบุ'}</b></div>
        <div>เหตุผลที่ยังไม่ซื้อ<b>{lead.objection || 'ยังไม่ระบุ'}</b></div>
        <div>รอบถัดไป<b>{round ? `รอบ ${round} · ${dayYear(dueDay(lead.firstDay, round))}` : '—'}</b></div>
        {lead.notes && <div style={{ gridColumn: '1 / -1' }}>บันทึก<b style={{ fontWeight: 400, whiteSpace: 'pre-wrap' }}>{lead.notes}</b></div>}
      </div>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        {safeUrl && <a className="btn-ghost" href={safeUrl} target="_blank" rel="noopener noreferrer">เปิดแชต ↗</a>}
        <button type="button" className="btn-ghost" onClick={onEdit}>แก้ไขข้อมูล</button>
      </div>

      <RoundStrip lead={lead} events={events} next={round} today={today} />

      {error && <p className="msg-err" role="alert">{error}</p>}

      {round && <RecordPanel key={`${lead.id}-${lead.version}`} lead={lead} round={round} busy={busy} run={run} />}

      <StatusPanel key={`s-${lead.id}-${lead.version}`} lead={lead} busy={busy} run={run} />

      {(lead.status === 'won' || links.length > 0) && (
        <OrdersPanel key={`o-${lead.id}-${links.length}`} lead={lead} links={links} orders={orders} busy={busy} run={run} />
      )}

      <section className="stack" style={{ gap: 6 }}>
        <h3 className="section-title" style={{ fontSize: 15 }}>ประวัติและบันทึก</h3>
        <ul className="history">
          {[...events].reverse().map(e => {
            const t = stamp(e.at)
            return (
              <li key={e.id}>
                <time dateTime={e.at}>{thaiDay(t.day)} {t.time}</time>
                <div>
                  <div>{describe(e)}</div>
                  {e.note && e.kind !== 'edit' && e.kind !== 'reassign' && e.kind !== 'order' && e.kind !== 'auto' && <div style={{ whiteSpace: 'pre-wrap' }}>{e.note}</div>}
                  <div className="who">โดย {eventBy(e.by, staff)}</div>
                </div>
              </li>
            )
          })}
          <li><time>{thaiDay(lead.firstDay)}</time><div>วันที่ 1 · เริ่มพูดคุย สนใจ {lead.product}</div></li>
        </ul>
      </section>

      <div className="actions">
        <span className="small left">ลบแล้วประวัติทั้งหมดของลูกค้ารายนี้จะหายด้วย ใช้เมื่อเพิ่มผิดหรือซ้ำเท่านั้น</span>
        <button type="button" className={armed ? 'btn-danger armed' : 'btn-danger'} disabled={busy}
          onClick={() => (armed ? void run(async () => { await deleteLead(lead.id); onClose() }, 'ลบลูกค้าแล้ว') : setArmed(true))}>
          {armed ? 'กดอีกครั้งเพื่อยืนยันการลบ' : 'ลบลูกค้า'}
        </button>
      </div>
    </Modal>
  )
}

function describe(e: FuEvent): string {
  switch (e.kind) {
    case 'create': return 'เพิ่มลูกค้าเข้าระบบ'
    case 'import': return 'นำเข้าจากเว็บแอปเดิม'
    case 'auto': return 'เข้าคิวอัตโนมัติจากแท็กติดตาม'
    case 'round': return `รอบ ${e.roundNo} · ${RESULT_LABEL[e.result ?? ''] ?? e.result}${e.orderId ? ` · ออเดอร์ ${e.orderId}` : ''}`
    case 'skip': return `ข้ามรอบ ${e.roundNo}`
    case 'status': return `เปลี่ยนสถานะเป็น ${STATUS_LABEL[e.result as LeadStatus] ?? e.result}${e.orderId ? ` · ออเดอร์ ${e.orderId}` : ''}`
    case 'reassign': return `ย้ายผู้ดูแล ${e.note}`
    case 'order': return `${e.note} ${e.orderId ?? ''}`
    case 'edit': return e.note
  }
}

function RoundStrip({ lead, events, next, today }: { lead: FuLead; events: FuEvent[]; next: number | null; today: string }) {
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h3 className="section-title" style={{ fontSize: 15 }}>เส้นทางติดตาม 7 รอบ</h3>
      <div className="rounds">
        {ROUNDS.map(r => {
          const e = events.find(x => (x.kind === 'round' || x.kind === 'skip') && x.roundNo === r)
          const due = dueDay(lead.firstDay, r)
          const cls = e ? (e.kind === 'skip' ? 'skip' : 'done') : r === next ? (due < today ? 'late' : 'next') : ''
          return (
            <div key={r} className={`rnd ${cls}`} title={GOALS[r - 1]}>
              <b>รอบ {r}</b>
              <span>วัน {OFFSETS[r - 1]}</span>
              <span style={{ display: 'block' }}>{thaiDay(due)}</span>
              {e && <span style={{ display: 'block', fontWeight: 600 }}>{e.kind === 'skip' ? 'ข้าม' : '✓'}</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

type Run = (fn: () => Promise<unknown>, msg: string) => Promise<void>

function RecordPanel({ lead, round, busy, run }: { lead: FuLead; round: number; busy: boolean; run: Run }) {
  const [result, setResult] = useState<RoundResult | null>(null)
  const [note, setNote] = useState('')
  const [order, setOrder] = useState('')
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const due = dueDay(lead.firstDay, round)
  const label = (r: RoundResult) => RESULTS.find(x => x[0] === r)![1]
  return (
    <section className="panel-soft" aria-label="บันทึกผลการติดตาม">
      <div className="stack" style={{ gap: 2 }}>
        <h3>บันทึกผลการติดตาม รอบ {round}</h3>
        <span className="small">รอบ {round} / วันที่ {OFFSETS[round - 1]} · กำหนด {dayYear(due)} · {GOALS[round - 1]}</span>
      </div>
      <div className="results" role="group" aria-label="ผลการติดตาม">
        {RESULTS.map(([k, text]) => (
          <button key={k} type="button" className={k === 'optout' ? 'res warn' : 'res'} aria-pressed={result === k} onClick={() => setResult(k)}>{text}</button>
        ))}
      </div>
      {result === 'won' && (
        <label className="field">เลขออเดอร์ Pancake (ถ้ามี — ใส่ทีหลังได้)
          <input value={order} maxLength={40} onChange={e => setOrder(e.target.value)} placeholder="เช่น 12345" />
        </label>
      )}
      {result === 'optout' && <p className="small">หยุดติดตามทันที และจะไม่มีงานรอบต่อไปของลูกค้ารายนี้</p>}
      <label className="field">บันทึกเพิ่มเติม
        <textarea rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ส่งข้อมูลแหล่งผลิตและราคาที่ลูกค้าขอ" />
      </label>
      <div className="actions">
        <button type="button" className="linkbtn left" onClick={() => setSkipping(s => !s)}>ข้ามรอบนี้</button>
        <button type="button" className="btn" disabled={busy || !result}
          onClick={() => void run(() => recordRound(lead, round, result!, note, order), `บันทึกรอบ ${round}: ${label(result!)}`)}>
          บันทึกผลติดตาม
        </button>
      </div>
      {skipping && (
        <div className="stack" style={{ gap: 8 }}>
          <label className="field">เหตุผลที่ข้ามรอบ {round} *
            <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} placeholder="เช่น ลูกค้าแจ้งว่าจะติดต่อกลับเอง" />
          </label>
          <div className="actions">
            <button type="button" className="btn-ghost" disabled={busy || reason.trim().length < 3}
              onClick={() => void run(() => skipRound(lead, round, reason), `ข้ามรอบ ${round} แล้ว`)}>ยืนยันข้ามรอบ</button>
          </div>
        </div>
      )}
    </section>
  )
}

function StatusPanel({ lead, busy, run }: { lead: FuLead; busy: boolean; run: Run }) {
  const options: [LeadStatus, string][] = lead.status === 'active'
    ? [['won', 'ซื้อแล้ว (นอกรอบ)'], ['optout', 'ขอหยุดติดต่อ'], ['paused', 'พักติดตามชั่วคราว']]
    : lead.status === 'paused' ? [['active', 'กลับมาติดตาม'], ['won', 'ซื้อแล้ว'], ['optout', 'ขอหยุดติดต่อ']]
      : [['active', 'เปิดติดตามอีกครั้ง (แก้ไขสถานะ)']]
  const [to, setTo] = useState<LeadStatus | ''>('')
  const [note, setNote] = useState('')
  const [order, setOrder] = useState('')
  const reopen = to === 'active' && (lead.status === 'won' || lead.status === 'optout')
  return (
    <details className="panel-soft">
      <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>เปลี่ยนสถานะลูกค้า</summary>
      <div className="form-grid">
        <label className="field">สถานะใหม่
          <select value={to} onChange={e => setTo(e.target.value as LeadStatus | '')}>
            <option value="">เลือก</option>
            {options.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        {to === 'won' && (
          <label className="field">เลขออเดอร์ Pancake (ถ้ามี)
            <input value={order} maxLength={40} onChange={e => setOrder(e.target.value)} />
          </label>
        )}
        <label className="field wide">{reopen ? 'เหตุผลที่เปิดติดตามอีกครั้ง *' : 'หมายเหตุ'}
          <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="btn-ghost" disabled={busy || !to || (reopen && note.trim().length < 3)}
          onClick={() => void run(() => setStatus(lead, to as LeadStatus, note, order), `เปลี่ยนสถานะเป็น ${STATUS_LABEL[to as LeadStatus]} แล้ว`)}>
          บันทึกสถานะ
        </button>
      </div>
    </details>
  )
}

function OrdersPanel({ lead, links, orders, busy, run }: { lead: FuLead; links: OrderLink[]; orders: OrderRow[]; busy: boolean; run: Run }) {
  const [order, setOrder] = useState('')
  const byId = new Map(orders.map(o => [o.orderId, o]))
  return (
    <section className="panel-soft" aria-label="ออเดอร์">
      <h3>ออเดอร์ที่ผูกไว้</h3>
      {links.length === 0 && <p className="small">ยังไม่มีเลขออเดอร์ ใส่เลขจาก Pancake เพื่อให้ยอดขายเข้ารายงาน GM</p>}
      {links.map(k => {
        const o = byId.get(k.orderId)
        return (
          <div key={k.orderId} className="order-row">
            <span><b className="num">{k.orderId}</b>{' '}
              {!o ? <span className="st st-due">รอตรวจ · ยังไม่พบในไฟล์ออเดอร์</span>
                : !orderLive(o) ? <span className="st st-optout">{o.status}</span>
                  : <span className="st st-won">ยืนยันแล้ว</span>}
            </span>
            <span className="small">{o ? `${thaiDay(o.day)} · ${money(o.amount)} · ${o.items.map(i => `${i.name} ×${i.qty}`).join(', ')}` : ''}</span>
            <button type="button" className="linkbtn" disabled={busy}
              onClick={() => void run(() => unlinkOrder(k.orderId), `ยกเลิกการผูกออเดอร์ ${k.orderId}`)}>เอาออก</button>
          </div>
        )
      })}
      {lead.status === 'won' && (
        <div className="fu-bar">
          <label className="field" style={{ flex: '1 1 200px' }}>เพิ่มเลขออเดอร์
            <input value={order} maxLength={40} onChange={e => setOrder(e.target.value)} />
          </label>
          <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-end', minHeight: 44 }} disabled={busy || !order.trim()}
            onClick={() => void run(() => linkOrder(lead.id, order), `ผูกออเดอร์ ${order.trim()} แล้ว`)}>ผูกออเดอร์</button>
        </div>
      )}
    </section>
  )
}
