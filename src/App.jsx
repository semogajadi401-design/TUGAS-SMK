import { useEffect, useState } from 'react'
import { supabase, toEmail } from './supabase.js'
import Students from './Students.jsx'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Home from './Home.jsx'
import Tasks from './Tasks.jsx'
import Settings, { Brand, loadSettings, DEFAULTS } from './Settings.jsx'

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

function Student({ profile, reload, s }) {
  const [tab, setTab] = useState('home')
  const tabs = [['home', 'Beranda'], ['tasks', 'Tugas'], ['grades', 'Nilai'], ['account', 'Akun']]
  return (
    <div className="shell">
      <div className="top"><Brand s={s} size={42} /><div><small>Halo, {s.school_name}</small><strong>{profile.full_name}</strong></div></div>
      <div className="page">
        {tab === 'home' && <Home profile={profile} goAccount={() => setTab('account')} />}
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

function Teacher({ profile, s, onSaved }) {
  const [tab, setTab] = useState('dash')
  return (
    <div className="shell">
      <div className="top"><Brand s={s} size={42} /><div><small>{s.school_name}</small><strong>{profile.full_name}</strong></div></div>
      <div className="page">
        {tab === 'dash' && <Dashboard profile={profile} />}
        {tab === 'tasks' && <Tasks profile={profile} />}
        {tab === 'students' && <Students />}
        {tab === 'settings' && (<>
          <Settings s={s} onSaved={onSaved} />
          <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => supabase.auth.signOut()}>Keluar</button>
        </>)}
      </div>
      <nav className="tabs">
        {[['dash', 'Dasbor'], ['tasks', 'Tugas'], ['students', 'Siswa & Kelas'], ['settings', 'Pengaturan']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [state, setState] = useState('loading')
  const [s, setS] = useState(DEFAULTS)

  useEffect(() => { loadSettings().then(setS) }, [])
  useEffect(() => {
    document.documentElement.style.setProperty('--board', s.color)
    document.title = s.school_name
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', s.color)
  }, [s])

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
  if (state === 'out') return <Login s={s} />
  return profile.role === 'teacher'
    ? <Teacher profile={profile} s={s} onSaved={setS} />
    : <Student profile={profile} s={s} reload={() => loadProfile()} />
}
