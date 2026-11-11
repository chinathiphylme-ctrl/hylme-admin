import { thaiDay } from './viewModel'

export function DaySelect({ days, value, onChange }: { days: string[]; value: string; onChange: (day: string) => void }) {
  return <label className="day-select">
    เลือกวัน
    <select aria-label="เลือกวัน" value={value} onChange={e => e.target.value && onChange(e.target.value)}>
      <option value="" disabled>เลือกวัน…</option>
      {[...new Set(days)].sort().reverse().map(day => <option key={day} value={day}>
        {thaiDay(day)} {day.slice(0, 4)}
      </option>)}
    </select>
  </label>
}
