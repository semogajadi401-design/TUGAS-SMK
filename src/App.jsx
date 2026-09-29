import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Students from './Students.jsx'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Home from './Home.jsx'
import Tasks from './Tasks.jsx'
import Settings, { loadSettings, DEFAULTS } from './Settings.jsx'
import Shell, { I } from './Shell.jsx'

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
  const items = [
    { k: 'home', label: 'Beranda', icon: I.home },
    { k: 'tasks', label: 'Tugas', icon: I.tasks },
    { k: 'grades', label: 'Nilai', icon: I.star },
    { k: 'account', label: 'Akun', icon: I.user },
  ]
  return (
    <Shell s={s} profile={profile} role="Siswa" items={items} tab={tab} setTab={setTab}>
      {tab === 'home' && <Home profile={profile} goAccount={() => setTab('account')} />}
      {tab === 'tasks' && <Soon text="Daftar dan pengerjaan tugas segera hadir." />}
      {tab === 'grades' && <Soon text="Riwayat nilai segera hadir." />}
      {tab === 'account' && (<>
        <h2>Ubah password</h2>
        <ChangePassword onDone={reload} />
        <button className="btn ghost" style={{ marginTop: 16 }}
          onClick={() => window.confirm('Keluar dari akun ini?') && supabase.auth.signOut()}>Keluar dari akun</button>
      </>)}
    </Shell>
  )
}

function Teacher({ profile, s, onSaved }) {
  const [tab, setTab] = useState('dash')
  const items = [
    { k: 'dash', label: 'Dasbor', icon: I.grid },
    { k: 'tasks', label: 'Tugas', icon: I.tasks },
    { k: 'students', label: 'Siswa & Kelas', icon: I.users },
    { k: 'settings', label: 'Pengaturan', icon: I.sliders },
  ]
  return (
    <Shell s={s} profile={profile} role="Guru" items={items} tab={tab} setTab={setTab}>
      {tab === 'dash' && <Dashboard profile={profile} />}
      {tab === 'tasks' && <Tasks profile={profile} />}
      {tab === 'students' && <Students />}
      {tab === 'settings' && <Settings s={s} onSaved={onSaved} />}
    </Shell>
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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, x) => setSession(x))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadProfile(x = session) {
    if (!x) { setProfile(null); setState('out'); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', x.user.id).maybeSingle()
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
