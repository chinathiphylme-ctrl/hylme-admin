import { useState } from 'react'
import { signIn } from '../../data/followup'
import type { Followup } from './useFollowup'

// what the follow-up tabs show until a staff member is signed in
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
  if (fu.status === 'noStaff') {
    return (
      <section className="card login">
        <h2>บัญชีนี้ยังไม่มีสิทธิ์ใช้ระบบติดตาม</h2>
        <p className="desc">ให้เจ้าของระบบเพิ่มชื่อและบทบาทของบัญชีนี้ก่อน แล้วเข้าสู่ระบบใหม่</p>
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
        <p className="desc">ข้อมูลลูกค้าเห็นได้เฉพาะทีมขาย แอดมินเห็นลูกค้าของตัวเอง GM เห็นทั้งหมด</p>
      </div>
      <label className="field">อีเมล
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
