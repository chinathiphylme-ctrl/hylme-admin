import { pageName, type PageId } from '../config/pages'
import { adScores, MIN_CHATS, VERDICTS, type AdScore, type Verdict } from '../metrics/ads'
import { inStart, type Lead } from '../metrics/leads'
import type { DateRange } from '../metrics/range'
import { ACCENT, CRIT, fmt, thaiDay } from './viewModel'

const VERDICT_STYLE: Record<Verdict, React.CSSProperties> = {
  'ดี': { background: ACCENT, color: '#fff' },
  'ไม่ดี': { background: CRIT, color: '#fff' },
  'กลางๆ': { background: '#EDF2EF', color: '#24352C' },
  'ข้อมูลยังน้อย': { background: '#F6F8F7', color: '#55665D' },
}
const VERDICT_HINT: Record<Verdict, string> = {
  'ดี': 'ควรเก็บ/เพิ่มงบ',
  'ไม่ดี': 'ควรพิจารณาตัด',
  'กลางๆ': 'ยังไม่ต่างจากค่าเฉลี่ย',
  'ข้อมูลยังน้อย': `แชทไม่ถึง ${MIN_CHATS}`,
}

function reason(a: AdScore, avg: number): string {
  const base = `${fmt(a.chats)} แชท ปิดได้ ${fmt(a.closed)} · ค่าเฉลี่ย ${avg}%`
  if (a.verdict === 'ดี') return `${base} · สูงกว่าค่าเฉลี่ยแบบที่ไม่น่าใช่ความบังเอิญ`
  if (a.verdict === 'ไม่ดี') return `${base} · ต่ำกว่าค่าเฉลี่ยแบบที่ไม่น่าใช่ความบังเอิญ`
  if (a.verdict === 'ข้อมูลยังน้อย') return `${base} · ต้องมีอย่างน้อย ${MIN_CHATS} แชทถึงจะตัดสิน`
  return base
}

function AdRows({ ads, avg }: { ads: AdScore[]; avg: number }) {
  return (
    <div className="table-wrap">
      <table style={{ minWidth: 820 }}>
        <thead>
          <tr>
            <th>#</th><th>โฆษณา</th><th style={{ textAlign: 'right' }}>แชทใหม่</th><th style={{ textAlign: 'right' }}>ลีด A+B</th>
            <th style={{ textAlign: 'right' }}>ปิด</th><th style={{ textAlign: 'right' }}>อัตราปิด</th><th>คำตัดสิน</th><th>เพจ</th><th>เห็นช่วง</th>
          </tr>
        </thead>
        <tbody>
          {ads.map(a => (
            <tr key={a.tag}>
              <td className="num">{a.rank ?? '—'}</td>
              <td style={{ overflowWrap: 'anywhere' }}>
                {a.name ? <><b>{a.name}</b> <span className="small">· {a.tag}</span></> : `แอด ${a.tag}`}
                {a.shortId && <> <span className="err-pill">เลขอาจไม่ครบ</span></>}
              </td>
              <td className="num" style={{ textAlign: 'right' }}>{fmt(a.chats)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{fmt(a.good)} <span className="small">({Math.round((a.good / a.chats) * 100)}%)</span></td>
              <td className="num" style={{ textAlign: 'right' }}>{fmt(a.closed)}</td>
              <td className="num" style={{ textAlign: 'right' }}>{a.rate}%</td>
              <td>
                <span className="tag-pill" style={VERDICT_STYLE[a.verdict]}>{a.verdict}</span>
                <div className="small" style={{ marginTop: 4, maxWidth: 260 }}>{reason(a, avg)}</div>
              </td>
              <td className="small">{a.pages.map(pageName).join(', ')}</td>
              <td className="small" style={{ whiteSpace: 'nowrap' }}>{thaiDay(a.firstDay)}–{thaiDay(a.lastDay)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Ads({ leads, range, page, adNames, goTags }: {
  leads: Lead[]; range: DateRange; page: PageId | 'all'; adNames: Record<string, string>; goTags: () => void
}) {
  const { avg, adChats, ads } = adScores(leads.filter(inStart(range)), adNames, page)
  const judged = ads.filter(a => a.verdict !== 'ข้อมูลยังน้อย')
  const thin = ads.filter(a => a.verdict === 'ข้อมูลยังน้อย')

  return (
    <section className="stack" style={{ gap: 16 }}>
      <p style={{ fontSize: 15, color: '#24352C', maxWidth: '72ch' }}>
        โฆษณาแต่ละตัวพาแชทใหม่มากี่แชท ปิดได้กี่แชท และเทียบกับค่าเฉลี่ยของโฆษณาทั้งหมด เพื่อดูว่าตัวไหนควรเก็บ ตัวไหนควรตัด
      </p>

      {avg == null ? (
        <section className="card" style={{ border: '1px dashed #C9D3CD' }}>
          <p className="desc" style={{ fontSize: 14 }}>ยังไม่มีแชทใหม่ที่ติดแท็กโฆษณาในช่วงนี้</p>
        </section>
      ) : (
        <>
          <div className="filter-cards">
            {VERDICTS.map(v => (
              <div key={v} className="fcard" style={{ cursor: 'default' }}>
                <span className="tag-pill" style={{ ...VERDICT_STYLE[v], alignSelf: 'flex-start' }}>{v}</span>
                <span className="n">{fmt(ads.filter(a => a.verdict === v).length)}</span>
                <span className="small">{VERDICT_HINT[v]}</span>
              </div>
            ))}
          </div>
          <p className="desc">ค่าเฉลี่ยโฆษณา {avg}% จาก {fmt(adChats)} แชทใหม่ที่มีแท็กโฆษณา</p>
          <p className="small">อันดับจากดีสุดไปแย่สุด ใช้ขอบล่าง Wilson 90% เพื่อหักความไม่แน่นอน ถ้าคะแนนเท่ากันให้แชทมากกว่าอยู่ก่อน · จัดอันดับเมื่อมีอย่างน้อย {MIN_CHATS} แชท</p>

          {judged.length > 0 ? <AdRows ads={judged} avg={avg} /> : (
            <p className="desc" style={{ fontSize: 14 }}>ยังไม่มีโฆษณาตัวไหนที่มีแชทถึง {MIN_CHATS} แชท ลองเลือกช่วงเวลาที่ยาวขึ้น</p>
          )}
          {thin.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 14, color: '#24352C' }}>อีก {fmt(thin.length)} ตัวที่ข้อมูลยังน้อย</summary>
              <div style={{ marginTop: 10 }}><AdRows ads={thin} avg={avg} /></div>
            </details>
          )}
        </>
      )}

      <div className="callout" style={{ fontSize: 13 }}>
        <div>ใช้ได้กับแชทตั้งแต่ 30 ต.ค. ที่เริ่มติดแท็กเลขโฆษณา</div>
        <div>แต่ละวันติดแท็กโฆษณาไม่ครบทุกแชท ให้ใช้เทียบโฆษณาด้วยกันเอง % ไม่ใช่ตัวเลขจริงของทั้งแคมเปญ</div>
        <div>ยังไม่มีค่าโฆษณาต่อตัว จึงยังคิดต้นทุนต่อแชทหรือต่อออเดอร์ไม่ได้</div>
      </div>
      <div><button type="button" className="btn-ghost" onClick={goTags}>ตั้งชื่อโฆษณา</button></div>
    </section>
  )
}
