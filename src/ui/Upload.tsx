import { useMemo, useRef, useState } from 'react'
import { pageName } from '../config/pages'
import type { Upload as UploadRow } from '../data/read'
import { checkCode, saveMessages, saveOrders, saveTagStats } from '../data/write'
import { addDays } from '../metrics/range'
import { detectKind } from '../parse/detect'
import { parseMessages } from '../parse/messages'
import { parseOrders } from '../parse/orders'
import { parseTagStats } from '../parse/tagStats'
import type { MessagesResult, OrdersResult, TagStatsResult } from '../parse/types'
import { loadCode, storeCode } from './code'
import { uploadTime } from './Sidebar'
import { existingKeys, KIND_LABEL, planUpload } from './uploadPlan'
import { ACCENT, rangeLabel, thaiMonth } from './viewModel'

const MAX_BYTES = 20 * 1024 * 1024
type Parsed = TagStatsResult | MessagesResult | OrdersResult
type SaveState = { fileName: string; ok: boolean; text: string }

async function parseFile(file: File): Promise<Parsed> {
  const fail = (error: string): Parsed => ({ ok: false, fileName: file.name, error })
  if (file.size > MAX_BYTES) return fail('ไฟล์ใหญ่เกิน 20 MB')
  if (!/\.xlsx$/i.test(file.name)) return fail('รับเฉพาะไฟล์ .xlsx')
  try {
    // SheetJS is large, so it loads only when someone uploads
    const { readWorkbook } = await import('../parse/workbook')
    const sheets = readWorkbook(await file.arrayBuffer())
    const kind = detectKind(sheets)
    if (kind === 'messages') return parseMessages(sheets, file.name)
    if (kind === 'orders') return parseOrders(sheets, file.name)
    if (kind === 'unknown') return fail('ไม่รู้จักไฟล์นี้ ต้องเป็นไฟล์สถิติแท็กแยกเพจ ไฟล์ข้อความ หรือไฟล์ออเดอร์จาก Pancake')
    return parseTagStats(sheets, file.name)
  } catch {
    return fail('เปิดไฟล์ไม่ได้ ไฟล์อาจเสีย')
  }
}

const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function Calendar({ uploads }: { uploads: UploadRow[] }) {
  const latest = uploads.map(u => u.dayTo).filter(Boolean).sort().at(-1) as string | undefined
  const start = latest ?? new Date().toISOString().slice(0, 10)
  const [ym, setYm] = useState<[number, number]>([Number(start.slice(0, 4)), Number(start.slice(5, 7))])
  const keys = useMemo(() => existingKeys(uploads), [uploads])
  const [y, m] = ym
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) cells.push(d)
  const count = (kind: string, day: string) => [...keys].filter(k => k.startsWith(`${kind}|${day}|`)).length
  const shift = (n: number) => setYm(([yy, mm]) => { const t = mm + n; return [yy + Math.floor((t - 1) / 12), ((t - 1 + 12) % 12) + 1] })

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h2>{thaiMonth(y, m)}</h2>
          <p className="desc">วันไหนมีไฟล์ครบแล้ว วันไหนยังขาด</p>
        </div>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-ghost" aria-label="เดือนก่อน" onClick={() => shift(-1)}>‹</button>
          <button type="button" className="btn-ghost" aria-label="เดือนถัดไป" onClick={() => shift(1)}>›</button>
        </span>
      </div>
      <div className="cal">
        {WEEKDAYS.map(w => <span key={w} className="wd">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />
          const t = count('tagStats', d)
          const msg = count('messages', d)
          const ord = count('orders', d)
          const full = t === 4 && msg === 4
          const some = t + msg > 0
          return (
            <span key={d} className="d" title={some || ord ? `สถิติแท็ก ${t}/4 เพจ · ไฟล์ข้อความ ${msg}/4 เพจ · ออเดอร์ ${ord ? 'มีแล้ว' : 'ยังไม่มี'}` : 'ยังไม่มีไฟล์'}
              style={full ? { background: '#E3EDE7', fontWeight: 600 } : some ? { background: '#FBF3E3', fontWeight: 600, color: '#4F3505' } : undefined}>
              <span className="num">{Number(d.slice(8))}</span>
              <i style={{ background: full ? ACCENT : some ? '#D99A2B' : '#C9D3CD' }} />
            </span>
          )
        })}
      </div>
      <div className="legend">
        <span><i className="sdot" style={{ background: ACCENT, marginRight: 0 }} />มีไฟล์ครบ</span>
        <span><i className="sdot" style={{ background: '#D99A2B', marginRight: 0 }} />ขาดบางไฟล์</span>
        <span><i className="sdot" style={{ background: '#C9D3CD', marginRight: 0 }} />ยังไม่มีไฟล์</span>
      </div>
    </>
  )
}

export function Upload({ uploads, overrides, onSaved, goTags }: {
  uploads: UploadRow[]; overrides: Record<string, string>; onSaved: () => void; goTags: () => void
}) {
  const [parsed, setParsed] = useState<Parsed[]>([])
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [code, setCode] = useState(loadCode)
  const [results, setResults] = useState<SaveState[]>([])
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const plan = useMemo(() => planUpload(parsed, existingKeys(uploads), overrides), [parsed, uploads, overrides])
  const ready = parsed.filter(p => p.ok)

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setResults([])
    setError('')
    const next = await Promise.all([...files].map(parseFile))
    setParsed(prev => [...prev.filter(p => !next.some(n => n.fileName === p.fileName)), ...next])
    setBusy(false)
  }

  const save = async () => {
    setError('')
    setResults([])
    setBusy(true)
    try {
      if (!(await checkCode(code))) {
        setError('รหัสอัปโหลดไม่ถูกต้อง ลองใหม่อีกครั้ง')
        return
      }
      storeCode(code)
      const out: SaveState[] = []
      for (const p of ready) {
        try {
          const n = 'rows' in p ? await saveTagStats(code, p.fileName, p.rows)
            : 'orders' in p ? await saveOrders(code, p.fileName, p.orders)
            : await saveMessages(code, p.fileName, p.convs)
          out.push({ fileName: p.fileName, ok: true, text: `บันทึกแล้ว ${n.toLocaleString('en-US')} แถว` })
        } catch (e) {
          out.push({ fileName: p.fileName, ok: false, text: `บันทึกไม่สำเร็จ: ${(e as Error).message}` })
        }
      }
      setResults(out)
      setParsed(prev => prev.filter(p => !out.some(o => o.ok && o.fileName === p.fileName)))
      onSaved()
    } catch (e) {
      setError(`เชื่อมต่อฐานข้อมูลไม่ได้: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid g-420">
      <section className="card">
        <h2>อัปโหลดไฟล์ประจำวัน</h2>
        <div className={`drop${over ? ' over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}>
          <span className="drop-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4" /><path d="M7.5 8.5 12 4l4.5 4.5" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></svg>
          </span>
          <span style={{ fontWeight: 600, marginTop: 4 }}>ลากไฟล์ .xlsx มาวางที่นี่</span>
          <span className="desc">ใส่ได้หลายไฟล์พร้อมกัน: สถิติแท็กแยกเพจ ไฟล์ข้อความของทุกเพจ และไฟล์ออเดอร์ (ไม่เกิน 20 MB ต่อไฟล์)</span>
          <input ref={input} type="file" accept=".xlsx" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          <button type="button" className="btn-ghost" style={{ marginTop: 6, minHeight: 44, padding: '6px 18px' }} onClick={() => input.current?.click()} disabled={busy}>เลือกไฟล์</button>
        </div>

        {plan.files.length > 0 && (
          <>
            <h3 style={{ fontSize: 14 }}>ไฟล์ที่อ่านแล้ว</h3>
            <div className="stack" style={{ gap: 10 }}>
              {plan.files.map(f => (
                <div className="filebox" key={f.fileName}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
                    <span className="name">{f.fileName}</span>
                    {f.error ? <span className="err-pill">ใช้ไม่ได้</span> : <span className="ok-pill">พร้อมบันทึก</span>}
                  </div>
                  <span style={{ fontSize: 13, color: f.error ? '#8A2E07' : '#435349' }}>{f.error ?? f.summary}</span>
                  {f.kind === 'tagStats' && <span className="small">ข้ามชีตรายชั่วโมง (today) ใช้เฉพาะยอดรวมของวัน</span>}
                  {f.kind === 'messages' && <span className="small">ตัดชื่อลูกค้า เบอร์โทร และเนื้อหาข้อความออกก่อนบันทึก</span>}
                  {f.kind === 'orders' && <span className="small">ไม่บันทึกชื่อ เบอร์โทร และที่อยู่ลูกค้า เก็บเฉพาะเลขออเดอร์ แอดมิน เพจ สินค้า และยอดเงิน</span>}
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setParsed([])} disabled={busy}>ล้างรายการ</button>
          </>
        )}

        {plan.overwrites.length > 0 && (
          <div className="callout">จะทับข้อมูลเดิม: {plan.overwrites.join(' · ')}</div>
        )}
        {plan.newUnassigned.length > 0 && (
          <div className="callout" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <span>มีแท็กที่ยังไม่จัดกลุ่ม: {plan.newUnassigned.map(t => `“${t}”`).join(', ')}</span>
            <button type="button" className="btn-ghost" style={{ borderColor: '#DDB878', color: '#4F3505' }} onClick={goTags}>จัดกลุ่ม</button>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label className="field">รหัสอัปโหลด
            <input type="password" placeholder="ใส่รหัสของทีม" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" />
          </label>
          <button type="button" className="btn" disabled={busy || !ready.length || !code} onClick={save}>
            {busy ? 'กำลังทำงาน…' : `บันทึก ${ready.length} ไฟล์`}
          </button>
        </div>
        {error && <p className="msg-err">{error}</p>}
        {results.map(r => <p key={r.fileName} className={r.ok ? 'msg-ok' : 'msg-err'}>{r.fileName}: {r.text}</p>)}
      </section>

      <section className="card" style={{ gap: 14 }}>
        <Calendar uploads={uploads} />
        <h3 style={{ fontSize: 14, marginTop: 4 }}>ประวัติการอัปโหลด</h3>
        <div className="stack" style={{ gap: 8, fontSize: 13, color: '#435349' }}>
          {uploads.length ? uploads.slice(0, 20).map((u, i) => (
            <span key={i}>
              {uploadTime(u.uploadedAt)} · {KIND_LABEL[u.kind]}{u.kind === 'orders' ? '' : ` · ${u.pageIds.length === 4 ? '4 เพจ' : u.pageIds.map(p => pageName(p)).join(', ')}`}
              {u.dayFrom ? ` · ${rangeLabel(u.dayFrom, u.dayTo ?? u.dayFrom)}` : ''} · {u.rows.toLocaleString('en-US')} แถว
            </span>
          )) : <span>ยังไม่มีการอัปโหลด</span>}
        </div>
      </section>
    </div>
  )
}
