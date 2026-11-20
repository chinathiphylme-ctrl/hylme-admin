import { useCallback, useState } from 'react'
import { pageName } from '../../config/pages'
import { startFromChat } from '../../data/followup'
import { addDays } from '../../metrics/range'
import { dueDay, GOALS, OFFSETS, ROUNDS, type RoundResult } from '../../followup/schedule'
import type { FollowItem, Stage } from '../../metrics/conversations'
import { GradePill } from '../LeadGrades'
import { thaiDay } from '../viewModel'
import { dayYear, errText, Modal } from './common'

// a silent chat plus the first day it showed up in a message file (day 1 of its follow-up)
export type SilentItem = FollowItem & { startDay: string }

const STAGES: (Stage | 'all')[] = ['all', 'พร้อมสั่ง', 'ลังเล', 'ขอโปร', 'ขอราคา']
const RESULTS: [RoundResult, string][] = [['sent', 'ส่งข้อมูลแล้ว'], ['waiting', 'รอลูกค้าตอบ'], ['won', 'ซื้อแล้ว'], ['optout', 'ขอหยุดติดต่อ']]

// as fu_start_chat: day 1 is never older than today − 59; rounds already past are skipped
export function firstRound(startDay: string, today: string): { firstDay: string; round: number } {
  const firstDay = startDay < addDays(today, -59) ? addDays(today, -59) : startDay
  return { firstDay, round: ROUNDS.find(r => dueDay(firstDay, r) >= today) ?? 7 }
}

export function SilentChats({ items, today, onSaved }: { items: SilentItem[]; today: string; onSaved: (msg: string) => Promise<void> }) {
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const [open, setOpen] = useState<SilentItem | null>(null)
  const close = useCallback(() => setOpen(null), [])
  if (!items.length) return null
  const rows = items.filter(i => stage === 'all' || i.stage === stage)
  return (
    <section className="card" aria-label="แชทเงียบใหม่ ยังไม่ได้ตาม" style={{ gap: 12 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2>แชทเงียบใหม่ ยังไม่ได้ตาม ({items.length})</h2>
        <p className="desc">ลูกค้าที่ถึงขั้นขอราคา ขอโปร ลังเล หรือพร้อมสั่ง แล้วเงียบไปในไฟล์ข้อความล่าสุดของแต่ละเพจ ตามใน Pancake แล้วกด “บันทึกผล” ลูกค้าจะเข้าคิว 7 รอบ</p>
      </div>
      <div className="chips" role="group" aria-label="กรองตามขั้น">
        {STAGES.map(s => (
          <button key={s} type="button" className="chip" aria-pressed={stage === s} onClick={() => setStage(s)}>
            {s === 'all' ? 'ทั้งหมด' : s} {s === 'all' ? items.length : items.filter(i => i.stage === s).length}
          </button>
        ))}
      </div>
      <div className="table-wrap fu-table">
        <table>
          <thead><tr><th>เพจ</th><th>เกรด · ขั้น</th><th>สถานะ</th><th>สินค้า</th><th>ลูกค้า</th><th>ทักล่าสุด</th><th><span className="sr">เปิดแชท / บันทึก</span></th></tr></thead>
          <tbody>
            {rows.map(i => (
              <tr key={i.conversationId}>
                <td>{pageName(i.pageId)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><GradePill grade={i.grade} /> {i.stage}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{i.status}</td>
                <td>{i.product}</td>
                <td>{i.kind === 'ใหม่' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{thaiDay(i.day)} {i.last}</td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {i.pancakeUrl && <a className="btn-ghost" href={i.pancakeUrl} target="_blank" rel="noopener">เปิดใน Pancake</a>}{' '}
                  <button type="button" className="btn" onClick={() => setOpen(i)}>บันทึกผล</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fu-cards">
        {rows.map(i => (
          <div key={i.conversationId} className="fu-card">
            <span className="fu-name"><GradePill grade={i.grade} /> {i.stage} · {i.status}</span>
            <span className="meta">{pageName(i.pageId)} · {i.product} · {i.kind === 'ใหม่' ? 'ลูกค้าใหม่' : 'ลูกค้าเก่า'} · {thaiDay(i.day)} {i.last}</span>
            <span className="right">
              {i.pancakeUrl && <a className="btn-ghost" href={i.pancakeUrl} target="_blank" rel="noopener">เปิดแชท</a>}
              <button type="button" className="btn" onClick={() => setOpen(i)}>บันทึกผล</button>
            </span>
          </div>
        ))}
      </div>
      {open && <StartModal item={open} today={today} onClose={close} onSaved={onSaved} />}
    </section>
  )
}

function StartModal({ item, today, onClose, onSaved }: { item: SilentItem; today: string; onClose: () => void; onSaved: (msg: string) => Promise<void> }) {
  const [result, setResult] = useState<RoundResult | null>(null)
  const [note, setNote] = useState('')
  const [order, setOrder] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { firstDay, round } = firstRound(item.startDay, today)
  const save = async () => {
    if (!result) return
    setBusy(true)
    setError(null)
    try {
      await startFromChat(item.conversationId, result, note, order)
      onClose()
      await onSaved(`เข้าคิวแล้ว · รอบ ${round}: ${RESULTS.find(r => r[0] === result)![1]}`)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={`${pageName(item.pageId)} · ${item.product}`} eyebrow="บันทึกผลการตาม · แชทเงียบ" onClose={onClose}>
      <p className="small">
        เริ่มคุย {dayYear(firstDay)} · บันทึกเป็นรอบ {round} / วันที่ {OFFSETS[round - 1]} · {GOALS[round - 1]}
        {round > 1 && ' (รอบก่อนหน้าเลยกำหนดแล้ว ระบบข้ามให้ว่า “เข้าระบบทีหลัง”)'}
      </p>
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
        <textarea rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ส่งราคาโปร 2 ขวดแล้ว ลูกค้าขอคิดก่อน" />
      </label>
      {error && <p className="msg-err" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button>
        <button type="button" className="btn" disabled={busy || !result} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกผล'}</button>
      </div>
    </Modal>
  )
}
