import type { PageId } from '../config/pages'
import { GRADES, gradeStats, inStart, type Grade, type Lead } from '../metrics/leads'
import type { DateRange } from '../metrics/range'
import { fmt } from './viewModel'

export const GRADE_STYLE: Record<Grade, React.CSSProperties> = {
  A: { background: '#FCE6DA', color: '#8A2E07' },
  B: { background: '#F7E7C6', color: '#5C3A06' },
  C: { background: '#EDF2EF', color: '#55665D' },
  D: { background: '#EDF2EF', color: '#55665D' },
}

export function GradePill({ grade }: { grade: Grade }) {
  return <span className="tag-pill" style={GRADE_STYLE[grade]} title={GRADES.find(g => g.grade === grade)!.label}>{grade}</span>
}

export function LeadGrades({ leads, range, page }: { leads: Lead[]; range: DateRange; page: PageId | 'all' }) {
  const sel = leads.filter(inStart(range)).filter(l => l.isNew && (page === 'all' || l.pageId === page))
  const stats = gradeStats(sel)
  return (
    <section className="card" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h2>เกรดลีด</h2>
        <p className="desc">แชทใหม่ {fmt(sel.length)} แชทที่เริ่มในช่วงนี้ จัดเกรดจากพฤติกรรมการคุย แล้วดูว่าแต่ละเกรดปิดได้กี่ %</p>
      </div>
      {sel.length === 0 ? (
        <p className="desc" style={{ fontSize: 14 }}>ยังไม่มีแชทใหม่ในช่วงนี้ (หรือยังไม่ได้อัปโหลดไฟล์ข้อความ)</p>
      ) : (
        <div className="filter-cards">
          {GRADES.map(({ grade, label, hint }) => {
            const s = stats.find(x => x.grade === grade)!
            return (
              <div key={grade} className="fcard" style={{ cursor: 'default' }}>
                <span style={{ fontSize: 13, fontWeight: 600, ...GRADE_STYLE[grade], alignSelf: 'flex-start', borderRadius: 999, padding: '1px 10px' }}>{label}</span>
                <span className="n">{fmt(s.chats)}</span>
                <span className="small">{Math.round((s.chats / sel.length) * 100)}% ของแชทใหม่ · ปิดได้ {s.rate == null ? '—' : `${s.rate}%`}</span>
                <span className="small">{hint}</span>
              </div>
            )
          })}
        </div>
      )}
      <p className="small">เกรดไม่ได้ดูว่าลูกค้าซื้อหรือให้เบอร์ แต่จำนวนข้อความรวมข้อความหลังตกลงซื้อด้วย เกรด A จึงมีคนที่กำลังซื้อปนอยู่ ใช้วัดคุณภาพลีดและจัดลำดับการตาม ไม่ใช่การทำนายล่วงหน้า</p>
    </section>
  )
}
