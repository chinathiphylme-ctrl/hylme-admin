import { pageName, type PageId } from '../config/pages'
import { adScores, MIN_CHATS, type AdScore } from '../metrics/ads'
import { inStart, type Lead } from '../metrics/leads'
import type { DateRange } from '../metrics/range'
import { fmt, thaiDay } from './viewModel'

// numbers only, no verdicts: marketing decides what to keep or cut (user, 11/11)
const vsAvg = (rate: number, avg: number) => {
  const d = Math.round((rate - avg) * 10) / 10
  return d === 0 ? 'เท่าค่าเฉลี่ย' : `${d > 0 ? '+' : '−'}${Math.abs(d)} จุด`
}

function AdRows({ ads, avg }: { ads: AdScore[]; avg: number }) {
  return (
    <div className="table-wrap">
      <table style={{ minWidth: 820 }}>
        <thead>
          <tr>
            <th>#</th><th>โฆษณา</th><th style={{ textAlign: 'right' }}>แชทใหม่</th><th style={{ textAlign: 'right' }}>ลีด A+B</th>
            <th style={{ textAlign: 'right' }}>ปิด</th><th style={{ textAlign: 'right' }}>อัตราปิด</th><th style={{ textAlign: 'right' }}>เทียบค่าเฉลี่ย</th><th>เพจ</th><th>เห็นช่วง</th>
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
              <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{vsAvg(a.rate, avg)}</td>
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
  const ranked = ads.filter(a => a.rank != null)
  const thin = ads.filter(a => a.rank == null)

  return (
    <section className="stack" style={{ gap: 16 }}>
      <p style={{ fontSize: 15, color: '#24352C', maxWidth: '72ch' }}>
        โฆษณาแต่ละตัวพาแชทใหม่มากี่แชท เป็นลีด A/B กี่แชท ปิดได้กี่แชท เทียบกับค่าเฉลี่ยของโฆษณาทั้งหมด ใช้ประกอบการตัดสินใจเรื่องงบโฆษณา
      </p>

      {avg == null ? (
        <section className="card" style={{ border: '1px dashed #C9D3CD' }}>
          <p className="desc" style={{ fontSize: 14 }}>ยังไม่มีแชทใหม่ที่ติดแท็กโฆษณาในช่วงนี้</p>
        </section>
      ) : (
        <>
          <p className="desc">ค่าเฉลี่ยโฆษณา {avg}% จาก {fmt(adChats)} แชทใหม่ที่มีแท็กโฆษณา</p>
          <p className="small">เรียงตามอัตราปิดที่หักความไม่แน่นอนจากจำนวนแชทแล้ว (ขอบล่าง Wilson 90%) โฆษณาที่แชทน้อยแต่บังเอิญปิดได้สูงจะไม่ขึ้นไปอยู่บนสุด · เรียงเมื่อมีอย่างน้อย {MIN_CHATS} แชท</p>

          {ranked.length > 0 ? <AdRows ads={ranked} avg={avg} /> : (
            <p className="desc" style={{ fontSize: 14 }}>ยังไม่มีโฆษณาตัวไหนที่มีแชทถึง {MIN_CHATS} แชท ลองเลือกช่วงเวลาที่ยาวขึ้น</p>
          )}
          {thin.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 14, color: '#24352C' }}>อีก {fmt(thin.length)} ตัวที่แชทยังไม่ถึง {MIN_CHATS} (ยังไม่เรียงลำดับ)</summary>
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
