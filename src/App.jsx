import { useEffect, useState } from 'react'
import { supabase, toEmail } from './supabase.js'

function Login() {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(id), password: pw,
    })
    if (error) setErr('Kode atau password salah. Coba lagi, atau minta guru mereset passwordmu.')
    setBusy(false)
  }

  return (
    <div className="login">
      <h1>Tugas<br />Sekolah</h1>
      <p>Masuk untuk melihat tugas dan nilaimu.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="id">Kode</label>
        <input id="id" value={id} onChange={(e) => setId(e.target.value)}
          autoCapitalize="none" autoComplete="username" required />
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" value={pw}
          onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
      </form>
    </div>
  )
}

function ChangePassword({ onDone }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState({ t: '', ok: false })
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (pw.length < 6) return setMsg({ t: 'Password minimal 6 karakter.', ok: false })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setMsg({ t: 'Gagal mengganti password: ' + error.message, ok: false })
    else {
      await supabase.rpc('mark_password_changed')
      setPw(''); setMsg({ t: 'Password berhasil diganti.', ok: true }); onDone?.()
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="np">Password baru</label>
      <input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        autoComplete="new-password" />
      {msg.t && <div className={msg.ok ? 'ok' : 'err'}>{msg.t}</div>}
      <button className="btn" disabled={busy}>Ubah password</button>
    </form>
  )
}

const Soon = ({ text }) => <div className="empty">{text}</div>

function Student({ profile, reload }) {
  const [tab, setTab] = useState('home')
  const tabs = [['home', 'Beranda'], ['tasks', 'Tugas'], ['grades', 'Nilai'], ['account', 'Akun']]
  return (
    <div className="shell">
      <div className="top"><small>Halo,</small><strong>{profile.full_name}</strong></div>
      <div className="page">
        {tab === 'home' && (<>
          {!profile.password_changed && (
            <div className="banner">Password kamu masih kode awal. Ganti di tab Akun supaya akunmu aman.</div>
          )}
          <h2>Beranda</h2><Soon text="Daftar tugas akan muncul di sini (Langkah 3)." />
        </>)}
        {tab === 'tasks' && (<><h2>Tugas</h2><Soon text="Segera hadir (Langkah 3)." /></>)}
        {tab === 'grades' && (<><h2>Nilai</h2><Soon text="Segera hadir (Langkah 3)." /></>)}
        {tab === 'account' && (<>
          <h2>Akun</h2>
          <ChangePassword onDone={reload} />
          <button className="btn ghost" style={{ marginTop: 16 }}
            onClick={() => supabase.auth.signOut()}>Keluar</button>
        </>)}
      </div>
      <nav className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
    </div>
  )
}

function Teacher({ profile }) {
  return (
    <div className="shell">
      <div className="top"><small>Guru</small><strong>{profile.full_name}</strong></div>
      <div className="page">
        <h2>Dasbor</h2>
        <Soon text="Login guru berhasil. Fitur guru dibuat di Langkah 4 dan 5." />
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Keluar</button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadProfile(s = session) {
    if (!s) { setProfile(null); setState('out'); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    if (!data || !data.active) {
      await supabase.auth.signOut(); setProfile(null); setState('out'); return
    }
    setProfile(data); setState('in')
  }

  useEffect(() => { if (session !== undefined) loadProfile(session) }, [session])

  if (state === 'loading') return <div className="center">Memuat...</div>
  if (state === 'out') return <Login />
  return profile.role === 'teacher'
    ? <Teacher profile={profile} />
    : <Student profile={profile} reload={() => loadProfile()} />
}
