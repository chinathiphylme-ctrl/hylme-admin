import { useState } from 'react'
import { PAGES, type PageId } from '../../config/pages'
import { sameName, saveLead } from '../../data/followup'
import { OBJECTIONS, PRODUCTS } from '../../followup/options'
import type { Staff } from '../../followup/report'
import { bangkokToday, STATUS_LABEL, type FuEvent, type FuLead } from '../../followup/schedule'
import { dayYear, errText, Modal } from './common'

export function LeadForm({ lead, events, me, staff, onClose, onSaved }: {
  lead: FuLead | null; events: FuEvent[]; me: Staff; staff: Staff[]; onClose: () => void; onSaved: (msg: string, id: string) => void
}) {
  const today = bangkokToday()
  const gm = me.role === 'gm'
  // the GM usually adds a customer for an admin, so start with the first admin rather than the GM
  const firstOwner = gm ? (staff.find(s => s.role === 'admin' && s.active)?.id ?? me.id) : me.id
  const roundsDone = events.some(e => e.kind === 'round' || e.kind === 'skip')
  const [f, setF] = useState({
    name: lead?.name ?? '', product: lead?.product ?? '', ownerId: lead?.ownerId ?? firstOwner, firstDay: lead?.firstDay ?? today,
    pageId: (lead?.pageId ?? '') as PageId | '', chatUrl: lead?.chatUrl ?? '', objection: lead?.objection || OBJECTIONS[0], notes: lead?.notes ?? '',
  })
  const [dupes, setDupes] = useState<{ owner_name: string; status: string; first_day: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }))
  // someone who has left can stay the owner of an old customer until it is moved
  const owners = staff.filter(s => s.active || s.id === lead?.ownerId)
  // the product a customer asked about may not be in the list (older records, new products)
  const products = f.product && !PRODUCTS.includes(f.product) ? [f.product, ...PRODUCTS] : PRODUCTS

  const checkName = async () => {
    if (!f.name.trim()) { setDupes([]); return }
    try { setDupes(await sameName(f.name, lead?.id ?? null)) } catch { setDupes([]) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = await saveLead({
        id: lead?.id ?? null, version: lead?.version ?? null, name: f.name, product: f.product, ownerId: f.ownerId,
        firstDay: f.firstDay, pageId: f.pageId || null, chatUrl: f.chatUrl, objection: f.objection, notes: f.notes,
      })
      onSaved(lead ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มลูกค้าแล้ว ระบบตั้งกำหนดติดตาม 7 รอบให้แล้ว', id)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={lead ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มลูกค้าใหม่'} eyebrow="ติดตาม 7 รอบ" onClose={onClose}>
      <form className="stack" style={{ gap: 16 }} onSubmit={submit}>
        <div className="form-grid">
          <label className="field">ชื่อหรือรหัสลูกค้า *
            <input required maxLength={120} value={f.name} onChange={e => set('name', e.target.value)} onBlur={checkName} placeholder="เช่น ลูกค้า 1042" />
          </label>
          <label className="field">สินค้าที่สนใจ *
            <select required value={f.product} onChange={e => set('product', e.target.value)}>
              <option value="">เลือกสินค้า</option>
              {products.map(p => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="field">แอดมินผู้รับผิดชอบ *
            <select value={f.ownerId} onChange={e => set('ownerId', e.target.value)}>
              {owners.map(s => <option key={s.id} value={s.id}>{s.active ? s.name : `${s.name} (ไม่ได้ใช้งานแล้ว)`}</option>)}
            </select>
          </label>
          <label className="field">วันที่คุยครั้งแรก (วันที่ 1) *
            <input type="date" required max={today} value={f.firstDay} disabled={roundsDone} onChange={e => set('firstDay', e.target.value)} />
            {roundsDone && <span className="small">แก้ไม่ได้ เพราะบันทึกรอบติดตามแล้ว</span>}
          </label>
          <label className="field">เพจ
            <select value={f.pageId} onChange={e => set('pageId', e.target.value as PageId | '')}>
              <option value="">ไม่ระบุ</option>
              {PAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field">ลิงก์แชต
            <input type="url" maxLength={350} value={f.chatUrl} onChange={e => set('chatUrl', e.target.value)} placeholder="https://pancake.vn/..." />
          </label>
          <label className="field wide">เหตุผลที่ยังไม่ซื้อ
            <select value={f.objection} onChange={e => set('objection', e.target.value)}>
              {(OBJECTIONS.includes(f.objection) ? OBJECTIONS : [f.objection, ...OBJECTIONS]).map(o => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label className="field wide">บันทึกเพิ่มเติม (ไม่ใส่เบอร์โทร ที่อยู่ หรือข้อมูลสุขภาพ)
            <textarea rows={3} maxLength={1000} value={f.notes} onChange={e => set('notes', e.target.value)} />
          </label>
        </div>
        {dupes.length > 0 && (
          <div className="callout" role="status">
            มีลูกค้าชื่อนี้อยู่แล้ว {dupes.length} ราย: {dupes.map(d => `${d.owner_name} · ${STATUS_LABEL[d.status as keyof typeof STATUS_LABEL] ?? d.status} · เริ่ม ${dayYear(d.first_day)}`).join(' / ')}
            <br />ถ้าเป็นคนเดียวกัน ไม่ต้องเพิ่มซ้ำ
          </div>
        )}
        {error && <p className="msg-err" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกลูกค้า'}</button>
        </div>
      </form>
    </Modal>
  )
}
