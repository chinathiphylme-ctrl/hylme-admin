import { useCallback, useEffect, useRef, useState } from 'react'
import { toBangkokIsoFromAny } from '../../data/mappers'
import { STATE_LABEL, type State } from '../../followup/schedule'
import { thaiDay } from '../viewModel'

export const money = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`
export const dayYear = (day: string) => `${thaiDay(day)} ${day.slice(0, 4)}`

// Postgres timestamps come back in UTC; show Bangkok wall time
export function stamp(iso: string): { day: string; time: string } {
  const b = toBangkokIsoFromAny(iso)
  return { day: b.slice(0, 10), time: b.slice(11, 16) }
}

export function StatePill({ state, late }: { state: State; late?: number }) {
  return <span className={`st st-${state}`}>{STATE_LABEL[state]}{state === 'overdue' && late ? ` ${late} วัน` : ''}</span>
}

export function Modal({ title, eyebrow, onClose, drawer, children }: {
  title: string; eyebrow?: string; onClose: () => void; drawer?: boolean; children: React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    box.current?.focus()
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={drawer ? 'modal drawer' : 'modal'}>
        <div className="modal-head">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            {eyebrow && <span className="sub">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="x" aria-label="ปิด" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function useToast(): [React.ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>()
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 3500)
  }, [])
  return [msg ? <div className="toast" role="status">{msg}</div> : null, show]
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
