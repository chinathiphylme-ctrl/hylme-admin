import { useState } from 'react'
import { saveTagGroup } from '../data/write'
import { ALL_GROUPS, groupOf } from '../grouping/rules'
import { loadCode, storeCode } from './code'
import { fmt } from './viewModel'

export function Tags({ tags, overrides, adNames, onSaved }: {
  tags: { tag: string; color: string; total: number }[]
  overrides: Record<string, string>; adNames: Record<string, string>; onSaved: () => void
}) {
  const [code, setCode] = useState(loadCode)
  const [names, setNames] = useState(adNames)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = tags
    .map(t => ({ ...t, group: groupOf(t.tag, overrides) }))
    .filter(t => t.group !== 'วันที่')
    .sort((a, b) => Number(b.group === 'ยังไม่จัดกลุ่ม') - Number(a.group === 'ยังไม่จัดกลุ่ม') || b.total - a.total)
  const unassigned = rows.filter(r => r.group === 'ยังไม่จัดกลุ่ม').length

  const save = async (tag: string, grp: string, adName: string) => {
    if (!code) { setMsg({ ok: false, text: 'ใส่รหัสอัปโหลดก่อนเปลี่ยนกลุ่ม' }); return }
    setBusy(true)
    try {
      await saveTagGroup(code, tag, grp, adName)
      storeCode(code)
      setMsg({ ok: true, text: `บันทึก “${tag}” แล้ว` })
      onSaved()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack" style={{ gap: 16 }}>
      {unassigned > 0 && (
        <div className="callout" style={{ fontSize: 14 }}>มี {unassigned} แท็กที่ยังไม่จัดกลุ่ม แท็กเหล่านี้จะยังไม่ถูกนับในหน้า “ลูกค้าติดตรงไหน” จนกว่าจะเลือกกลุ่ม</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label className="field" style={{ maxWidth: 320 }}>รหัสอัปโหลด (ใช้บันทึกการเปลี่ยนกลุ่ม)
          <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="ใส่รหัสของทีม" autoComplete="off" />
        </label>
        {msg && <p className={msg.ok ? 'msg-ok' : 'msg-err'}>{msg.text}</p>}
      </div>
      {rows.length === 0 ? (
        <section className="card"><p className="desc">ยังไม่มีแท็ก อัปโหลดไฟล์สถิติแท็กก่อน</p></section>
      ) : (
        <div className="table-wrap">
          <table style={{ minWidth: 560 }}>
            <thead>
              <tr><th>แท็ก</th><th>กลุ่ม</th><th style={{ textAlign: 'right' }}>แชทรวมทุกวัน</th></tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.tag} style={t.group === 'ยังไม่จัดกลุ่ม' ? { background: '#FDF7EC' } : undefined}>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color || '#C9D3CD' }} />{t.tag}
                    </span>
                    {t.group === 'โฆษณา' && (
                      <input type="text" aria-label={`ชื่อเรียกของแอด ${t.tag}`} placeholder="ตั้งชื่อเรียก เช่น แอดมะกอก ต.ค."
                        value={names[t.tag] ?? ''} disabled={busy}
                        onChange={e => setNames({ ...names, [t.tag]: e.target.value })}
                        onBlur={() => (names[t.tag] ?? '') !== (adNames[t.tag] ?? '') && save(t.tag, overrides[t.tag] ?? '', names[t.tag] ?? '')}
                        style={{ display: 'block', marginTop: 6, minHeight: 36, width: '100%', maxWidth: 260, padding: '4px 10px', border: '1px solid #C9D5CE', borderRadius: 8, font: 'inherit', fontSize: 13 }} />
                    )}
                  </td>
                  <td style={{ padding: '6px 14px' }}>
                    <select aria-label={`กลุ่มของแท็ก ${t.tag}`} value={t.group} disabled={busy}
                      onChange={e => save(t.tag, e.target.value, names[t.tag] ?? '')}
                      style={{ minHeight: 36, padding: '4px 8px', border: '1px solid #C9D5CE', borderRadius: 8, font: 'inherit', fontSize: 14, background: '#fff', color: '#12241B' }}>
                      {ALL_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmt(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small">แท็กวันที่ (เช่น 29/10) จัดเป็นกลุ่ม “วันที่” ให้อัตโนมัติ จึงไม่แสดงในรายการนี้ · แท็กที่เป็นตัวเลขยาว (เลขโฆษณา) เข้ากลุ่ม “โฆษณา” อัตโนมัติ ตั้งชื่อเรียกในเว็บได้โดยไม่ต้องเปลี่ยนชื่อใน Pancake · การบันทึกต้องใส่รหัสเหมือนตอนอัปโหลด</p>
    </section>
  )
}
