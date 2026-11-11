import { useEffect, useState } from 'react'
import { PAGES, pageName, type PageId } from '../config/pages'
import { toBangkokIsoFromAny } from '../data/mappers'
import { fetchQuotes } from '../data/read'
import { addQuote, deleteQuote } from '../data/write'
import { addDays } from '../metrics/range'
import { QUOTE_CATEGORIES, QUOTE_MAX, categoryCounts, filterQuotes, maskPhones, type Quote, type QuoteCategory } from '../metrics/quotes'
import { loadCode, storeCode } from './code'
import { fmt, thaiDay } from './viewModel'
import type { Lead } from '../metrics/leads'
import { Reasons } from './Reasons'
import { DaySelect } from './DaySelect'

const today = () => toBangkokIsoFromAny(new Date().toISOString()).slice(0, 10)
const PERIODS: [label: string, days: number | null][] = [['7 วัน', 7], ['30 วัน', 30], ['ทั้งหมด', null]]

export function Quotes({ leads, days }: { leads: Lead[]; days: string[] }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const [code, setCode] = useState(loadCode)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [day, setDay] = useState(today)
  const [pageId, setPageId] = useState<PageId>(PAGES[0].id)
  const [category, setCategory] = useState<QuoteCategory>(QUOTE_CATEGORIES[0])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [fCat, setFCat] = useState<QuoteCategory | 'all'>('all')
  const [fPage, setFPage] = useState<PageId | 'all'>('all')
  const [period, setPeriod] = useState<number | null>(30)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetchQuotes().then(q => live && setQuotes(q)).catch(e => live && setError(String(e.message ?? e)))
    return () => { live = false }
  }, [version])

  const masked = maskPhones(text.trim())

  // both actions need the team code, refresh the list and keep the code for this tab
  const run = async (action: () => Promise<unknown>, done: string, after?: () => void) => {
    if (!code) { setMsg({ ok: false, text: 'ใส่รหัสอัปโหลดก่อน' }); return }
    setBusy(true)
    try {
      await action()
      storeCode(code)
      after?.()
      setMsg({ ok: true, text: done })
      setVersion(v => v + 1)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const save = () => run(
    () => addQuote(code, { day, pageId, category, quote: masked, note: maskPhones(note.trim()) }),
    'บันทึกแล้ว', () => { setText(''); setNote('') })
  const remove = (q: Quote) => run(() => deleteQuote(code, q.id), 'ลบแล้ว')

  const from = selectedDay ?? (period ? addDays(today(), -(period - 1)) : null)
  const inScope = filterQuotes(quotes ?? [], { category: 'all', page: fPage, from }).filter(q => !selectedDay || q.day === selectedDay)
  const shown = filterQuotes(inScope, { category: fCat, page: 'all', from: null })
  const counts = categoryCounts(inScope)

  return (
    <section className="stack" style={{ gap: 16 }}>
      <p style={{ fontSize: 15, color: '#24352C', maxWidth: '72ch' }}>
        เก็บประโยคที่ลูกค้าพูดแล้วการตลาดควรรู้ เช่น เหตุผลที่ไม่ซื้อ ข้อสงสัย หรือคำชม เลือกหมวดให้ตรง จะได้เห็นว่าลูกค้าพูดถึงเรื่องไหนบ่อย
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="chips" role="group" aria-label="ช่วงเวลา">
          {PERIODS.map(([label, d]) => (
            <button key={label} type="button" className="chip" aria-pressed={!selectedDay && period === d} onClick={() => { setPeriod(d); setSelectedDay(null) }}>{label}</button>
          ))}
          <DaySelect days={[...days, ...quotes?.map(q => q.day) ?? []]} value={selectedDay ?? ''} onChange={setSelectedDay} />
        </div>
        <label className="field" style={{ flex: '0 1 220px' }}>
          <select aria-label="เพจ" value={fPage} onChange={e => setFPage(e.target.value as PageId | 'all')}>
            <option value="all">ทุกเพจ</option>
            {PAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <Reasons leads={leads.filter(l => l.isNew && (fPage === 'all' || l.pageId === fPage) && (!from || l.startDay >= from) && l.startDay <= (selectedDay ?? today()))} />

      <section className="card" aria-label="เพิ่มประโยค">
        <h2>เพิ่มประโยคที่ลูกค้าพูด</h2>
        <label className="field">ประโยคที่ลูกค้าพูด
          <textarea rows={3} maxLength={QUOTE_MAX} value={text} onChange={e => setText(e.target.value)}
            placeholder="เช่น “กินยาเบาหวานอยู่ กินคู่กันได้ไหมคะ”" />
        </label>
        <span className="small">
          ห้ามใส่ชื่อ ที่อยู่ หรือข้อมูลที่ระบุตัวลูกค้าได้ ระบบจะเปลี่ยนเบอร์โทรเป็น [เบอร์] ให้อัตโนมัติ · {fmt(text.length)}/{QUOTE_MAX}
        </span>
        {masked && masked !== text.trim() && <p className="small">จะบันทึกเป็น: {masked}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <label className="field" style={{ flex: '1 1 180px' }}>หมวด
            <select value={category} onChange={e => setCategory(e.target.value as QuoteCategory)}>
              {QUOTE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 180px' }}>เพจ
            <select value={pageId} onChange={e => setPageId(e.target.value as PageId)}>
              {PAGES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ flex: '1 1 150px' }}>วันที่ลูกค้าพูด
            <input type="date" value={day} max={today()} onChange={e => setDay(e.target.value || today())} />
          </label>
        </div>
        <label className="field">ทำไมสำคัญ (ไม่ใส่ก็ได้)
          <input type="text" maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ถามแบบนี้บ่อย ควรทำโพสต์ตอบ" />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label className="field" style={{ maxWidth: 280 }}>รหัสอัปโหลด
            <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="ใส่รหัสของทีม" autoComplete="off" />
          </label>
          <button type="button" className="btn" disabled={busy || !masked} onClick={save}>บันทึกประโยค</button>
          {msg && <p className={msg.ok ? 'msg-ok' : 'msg-err'} role="status">{msg.text}</p>}
        </div>
      </section>

      <div className="filter-cards" role="group" aria-label="กรองตามหมวด">
        <button type="button" className="fcard" aria-pressed={fCat === 'all'} onClick={() => setFCat('all')}>
          <span style={{ fontSize: 13, color: '#55665D' }}>ทุกหมวด</span>
          <span className="n">{fmt(inScope.length)}</span>
        </button>
        {counts.map(([c, n]) => (
          <button key={c} type="button" className="fcard" aria-pressed={fCat === c} onClick={() => setFCat(c)}>
            <span style={{ fontSize: 13, color: '#55665D' }}>{c}</span>
            <span className="n" style={{ color: n ? '#12241B' : '#9AA7A0' }}>{fmt(n)}</span>
          </button>
        ))}
      </div>

      {error ? (
        <section className="card"><p className="msg-err">โหลดประโยคไม่ได้: {error}</p></section>
      ) : !quotes ? (
        <div className="skeleton" />
      ) : shown.length === 0 ? (
        <section className="card" style={{ border: '1px dashed #C9D3CD' }}>
          <p className="desc" style={{ fontSize: 14 }}>{quotes.length ? 'ไม่มีประโยคในตัวกรองนี้' : 'ยังไม่มีประโยค เริ่มเพิ่มได้จากฟอร์มด้านบน'}</p>
        </section>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {shown.map(q => (
            <article key={q.id} className="quote">
              <blockquote>“{q.quote}”</blockquote>
              {q.note && <p style={{ fontSize: 13, color: '#435349' }}>{q.note}</p>}
              <div className="meta">
                <span className="tag-pill">{q.category}</span>
                <span>{pageName(q.pageId)}</span>
                <span>{thaiDay(q.day)}</span>
                <button type="button" className="btn-ghost" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => remove(q)}>ลบ</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
