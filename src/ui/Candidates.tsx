import { useState } from 'react'
import { pageName } from '../config/pages'
import { addQuote } from '../data/write'
import { QUOTE_CATEGORIES, type QuoteCategory } from '../metrics/quotes'
import type { Candidate } from '../parse/types'
import { thaiDay } from './viewModel'

function CandidateRow({ item, code }: { item: Candidate; code: string }) {
  const [category, setCategory] = useState<QuoteCategory>(item.topic)
  const [status, setStatus] = useState<'ready' | 'busy' | 'saved'>('ready')
  const [error, setError] = useState('')
  const save = async () => {
    if (status !== 'ready') return
    if (!code) { setError('ใส่รหัสอัปโหลดก่อน'); return }
    setError('')
    setStatus('busy')
    try {
      await addQuote(code, { day: item.day, pageId: item.pageId, category, quote: item.text, note: '' })
      setStatus('saved')
    } catch (e) { setError((e as Error).message); setStatus('ready') }
  }
  return <article className="quote">
    <blockquote>“{item.text}”</blockquote>
    <div className="candidate-controls">
      <label className="field">หมวด
        <select value={category} disabled={status !== 'ready'} onChange={e => setCategory(e.target.value as QuoteCategory)}>
          {QUOTE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </label>
      <span className="small">{pageName(item.pageId)} · {thaiDay(item.day)}</span>
      <button type="button" className="btn" disabled={status !== 'ready'} onClick={save}>
        {status === 'saved' ? 'เก็บแล้ว' : status === 'busy' ? 'กำลังเก็บ…' : 'เก็บ'}
      </button>
    </div>
    {error && <p className="msg-err" role="status">{error}</p>}
  </article>
}

export function Candidates({ items, code }: { items: Candidate[]; code: string }) {
  return <section className="card" style={{ gridColumn: '1 / -1' }}>
    <h2>ประโยคที่น่าสนใจจากไฟล์ที่เพิ่งอัป (ยังไม่ถูกเก็บ)</h2>
    <p className="callout">ปิดหน้านี้แล้วประโยคที่ไม่ได้กดเก็บจะหายไป ระบบไม่เก็บข้อความลูกค้าอัตโนมัติ ตรวจและเลือกเก็บเฉพาะประโยคที่ไม่มีชื่อ ที่อยู่ หรือข้อมูลระบุตัวลูกค้า</p>
    {items.length ? items.map(item => <CandidateRow key={`${item.pageId}|${item.conversationId}`} item={item} code={code} />)
      : <p className="desc">ไม่มีประโยคที่เข้าหัวข้อในไฟล์นี้</p>}
  </section>
}
