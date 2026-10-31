import type { CSSProperties } from 'react'

const pad2 = (i: number) => String(i).padStart(2, '0')

export function Ring({ rate, size, width, color, track, children }: {
  rate: number | null; size: number; width: number; color: string; track: string; children: React.ReactNode
}) {
  const deg = Math.min(360, (rate ?? 0) * 3.6)
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${width}px), #000 calc(100% - ${width - 1}px))`
  const arc: CSSProperties = { background: `conic-gradient(${color} ${deg}deg, ${track} 0)`, WebkitMask: mask, mask }
  return (
    <span className="ring" style={{ width: size, height: size, display: 'block' }}>
      <span className="ring-arc" style={arc} />
      <span className="ring-center">{children}</span>
    </span>
  )
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return <span className="track"><span style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} /></span>
}

export function BarList({ items, color, empty }: { items: [string, number][]; color: string; empty: string }) {
  const max = Math.max(1, ...items.map(x => x[1]))
  if (!items.length) return <p className="desc">{empty}</p>
  return (
    <>
      {items.map(([name, n]) => (
        <div className="brow" key={name}>
          <span>{name}</span>
          <Bar value={n} max={max} color={color} />
          <b>{n.toLocaleString('en-US')}</b>
        </div>
      ))}
    </>
  )
}

export function StackedBar({ parts, height, gap }: { parts: { value: number; color: string; title: string }[]; height: number; gap: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <span className="segs" style={{ height, gap }}>
      {parts.filter(p => p.value > 0).map(p => (
        <span key={p.title} title={p.title} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </span>
  )
}

export function HourBars({ hours, accent }: { hours: number[]; accent: string }) {
  const max = Math.max(1, ...hours)
  const peaks = hours.map((v, i) => [v, i]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1])
  return (
    <div className="scroll-x">
      <div className="bars" style={{ gridTemplateColumns: 'repeat(24, minmax(12px, 1fr))', gap: 3, minWidth: 360, height: 168 }}>
        {hours.map((v, i) => (
          <div key={i} title={`${pad2(i)}:00 · ${v} แชท`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, height: '100%' }}>
            <span className="num" style={{ fontSize: 10, color: '#55665D', height: 13 }}>{peaks.includes(i) ? v : ''}</span>
            <span style={{ display: 'block', width: '100%', borderRadius: '3px 3px 0 0', height: Math.max(2, (v / max) * 128), background: peaks.includes(i) ? accent : '#C3D1C9' }} />
            <span className="num" style={{ fontSize: 10, color: '#6A7A71', height: 13 }}>{i % 3 === 0 ? pad2(i) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function peakHours(hours: number[]): string {
  return hours.map((v, i) => [v, i]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 3)
    .map(x => x[1]).sort((a, b) => a - b).map(i => `${pad2(i)}:00`).join(', ')
}

export function TrendBars({ days, accent, label }: {
  days: { day: string; newChats: number; closed: number; current: boolean }[]; accent: string; label: (d: string) => string
}) {
  const max = Math.max(1, ...days.map(d => d.newChats))
  return (
    <div className="scroll-x">
      <div className="bars" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(26px, 1fr))`, gap: 10, minWidth: Math.max(300, days.length * 34), height: 196 }}>
        {days.map(d => (
          <div key={d.day} title={`${label(d.day)} · แชทใหม่ ${d.newChats} · ปิด ${d.closed}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
            <span style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 164, opacity: d.current ? 1 : 0.4 }}>
              <span style={{ flex: 1, borderRadius: '4px 4px 0 0', background: '#B9C8C0', height: (d.newChats / max) * 150 }} />
              <span style={{ flex: 1, borderRadius: '4px 4px 0 0', background: accent, height: (d.closed / max) * 150 }} />
            </span>
            <span className="num" style={{ fontSize: 11, textAlign: 'center', color: d.current ? '#12241B' : '#7A8981' }}>{Number(d.day.slice(8))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
