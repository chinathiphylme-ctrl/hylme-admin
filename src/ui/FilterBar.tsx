import { PAGES, type PageId } from '../config/pages'
import type { DateRange, RangeKey } from '../metrics/range'
import { thaiDay } from './viewModel'

export function FilterBar({ rangeKey, setRangeKey, custom, setCustom, latest, multiDay, page, setPage }: {
  rangeKey: RangeKey; setRangeKey: (k: RangeKey) => void
  custom: DateRange; setCustom: (r: DateRange) => void
  latest: string; multiDay: boolean
  page: PageId | 'all'; setPage: (p: PageId | 'all') => void
}) {
  const ranges: [RangeKey, string][] = [['day', thaiDay(latest)], ['7d', '7 วัน'], ['30d', '30 วัน'], ['month', 'เดือนนี้'], ['custom', 'กำหนดเอง']]
  return (
    <div className="filters">
      <div className="chips" role="group" aria-label="ช่วงเวลา">
        <span className="sub" style={{ marginRight: 4 }}>ช่วงเวลา</span>
        {ranges.map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={rangeKey === k}
            disabled={k !== 'day' && !multiDay} title={k !== 'day' && !multiDay ? 'ใช้ได้เมื่อมีข้อมูลหลายวัน' : undefined}
            onClick={() => setRangeKey(k)}>{label}</button>
        ))}
        {rangeKey === 'custom' && (
          <span className="custom-range">
            <input type="date" aria-label="ตั้งแต่" value={custom.from} max={latest}
              onChange={e => e.target.value && setCustom({ from: e.target.value, to: e.target.value > custom.to ? e.target.value : custom.to })} />
            ถึง
            <input type="date" aria-label="ถึง" value={custom.to} max={latest}
              onChange={e => e.target.value && setCustom({ from: e.target.value < custom.from ? e.target.value : custom.from, to: e.target.value })} />
          </span>
        )}
      </div>
      <div className="chips" role="group" aria-label="เพจ">
        <span className="sub" style={{ marginRight: 4 }}>เพจ</span>
        <button type="button" className="chip" aria-pressed={page === 'all'} onClick={() => setPage('all')}>ทุกเพจ</button>
        {PAGES.map(p => (
          <button key={p.id} type="button" className="chip" aria-pressed={page === p.id} onClick={() => setPage(p.id)}>{p.name}</button>
        ))}
      </div>
    </div>
  )
}
