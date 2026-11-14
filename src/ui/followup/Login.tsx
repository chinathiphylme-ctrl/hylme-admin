import { useState } from 'react'
import { signIn } from '../../data/followup'
import type { Followup } from './useFollowup'

// what the follow-up tabs show until the team account is signed in and a name is picked
export function Gate({ fu }: { fu: Followup }) {
  if (fu.status === 'loading') return <div className="grid g-200">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" />)}</div>
  if (fu.status === 'error') {
    return (
      <section className="card">
        <h2>โหลดข้อมูลติดตามไม่ได้</h2>
        <p className="desc">{fu.message}</p>
        <div><button type="button" className="btn-ghost" onClick={() => void fu.reload()}>ลองใหม่</button></div>
      </section>
    )
  }
  if (fu.status === 'noTeam') {
    return (
      <section className="card login">
        <h2>บัญชีนี้ยังไม่มีสิทธิ์ใช้ระบบติดตาม</h2>
        <p className="desc">เข้าสู่ระบบด้วยบัญชีทีม หรือให้เจ้าของระบบเพิ่มบัญชีนี้ก่อน</p>
        <div><button type="button" className="btn-ghost" onClick={() => void fu.signOut()}>ออกจากระบบ</button></div>
      </section>
    )
  }
  if (fu.status === 'pickName') {
    const people = fu.staff.filter(s => s.active)
    return (
      <section className="card login">
        <div className="stack" style={{ gap: 4 }}>
          <h2>คุณคือใคร</h2>
          <p className="desc">เครื่องนี้จะจำชื่อไว้ ทุกอย่างที่บันทึกจะขึ้นชื่อนี้ในประวัติ</p>
        </div>
        <div className="pick-names">
          {people.map(s => (
            <button key={s.id} type="button" className="btn-ghost" onClick={() => fu.pick(s.id)}>
              {s.name}{s.name !== 'GM' && <span className="small">{s.role === 'gm' ? 'GM' : 'แอดมิน'}</span>}
            </button>
          ))}
        </div>
        <p className="small">ไม่มีชื่อคุณ? ให้คนในทีมเพิ่มที่แท็บรายงาน → รายชื่อทีม</p>
        <div><button type="button" className="btn-ghost" onClick={() => void fu.signOut()}>ออกจากระบบ</button></div>
      </section>
    )
  }
  return <Login />
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try { await signIn(email, password) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return (
    <form className="card login" onSubmit={submit}>
      <div className="stack" style={{ gap: 4 }}>
        <h2>เข้าสู่ระบบติดตามลูกค้า</h2>
        <p className="desc">ใช้อีเมลและรหัสผ่านของทีม ข้อมูลลูกค้าเห็นได้เฉพาะคนที่มีรหัส</p>
      </div>
      <label className="field">อีเมลทีม
        <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      <label className="field">รหัสผ่าน
        <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {error && <p className="msg-err" role="alert">{error}</p>}
      <div><button type="submit" className="btn" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button></div>
    </form>
  )
}
