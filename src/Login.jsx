import { useState } from 'react'
import { supabase, toEmail } from './supabase.js'
import { Brand } from './Settings.jsx'

const P = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7c1.7 0 3.2-.4 4.5-1',
}
const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

export default function Login({ s }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const email = toEmail(id)
    let { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error && pw !== pw.toUpperCase())
      ({ error } = await supabase.auth.signInWithPassword({ email, password: pw.toUpperCase() }))
    if (error) setErr('Kode atau password salah. Periksa lagi, atau minta guru mereset passwordmu.')
    setBusy(false)
  }

  return (
    <div className="login">
      <div className="orb o1" /><div className="orb o2" />
      <div className="brand">
        <Brand s={s} size={80} />
        <div><h1>{s.school_name}</h1><p>Tugas, materi, dan nilaimu di satu tempat.</p></div>
      </div>
      <form className="card glass" onSubmit={submit}>
        <h2>Masuk</h2>
        <div className="field">
          <span className="ico"><Icon d={P.user} /></span>
          <input id="id" placeholder=" " value={id} onChange={(e) => setId(e.target.value)}
            autoCapitalize="none" autoCorrect="off" autoComplete="username" required />
          <label htmlFor="id">Kode siswa atau email guru</label>
        </div>
        <div className="field">
          <span className="ico"><Icon d={P.lock} /></span>
          <input id="pw" placeholder=" " type={show ? 'text' : 'password'} value={pw}
            onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          <label htmlFor="pw">Password</label>
          <button type="button" className="eye" onClick={() => setShow(!show)}
            aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}>
            <Icon d={show ? P.eyeoff : P.eye} />
          </button>
        </div>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="btn big" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
        <p className="hint">Pertama kali masuk? Password awalmu sama dengan kodemu.</p>
      </form>
    </div>
  )
}
