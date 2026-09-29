import { Component, lazy, Suspense, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Home from './Home.jsx'
import Shell, { I } from './Shell.jsx'
import { useNotifs, NotifPopup } from './Notifs.jsx'
import { loadSettings, DEFAULTS } from './brand.jsx'

// Jika file tab gagal diunduh (biasanya karena baru ada versi baru), muat ulang halaman satu kali.
const lazyRetry = (load) => lazy(() => load().catch((e) => {
  try {
    if (!sessionStorage.getItem('chunk-retry')) {
      sessionStorage.setItem('chunk-retry', '1'); location.reload()
      return new Promise(() => {})
    }
  } catch { /* abaikan */ }
  throw e
}))

// Tab dimuat hanya saat dibuka, jadi layar pertama jauh lebih ringan.
const Students = lazyRetry(() => import('./Students.jsx'))
const Tasks = lazyRetry(() => import('./Tasks.jsx'))
const Grading = lazyRetry(() => import('./Grading.jsx'))
const StudentTasks = lazyRetry(() => import('./StudentTasks.jsx'))
const Grades = lazyRetry(() => import('./StudentTasks.jsx').then((m) => ({ default: m.Grades })))
const Settings = lazyRetry(() => import('./Settings.jsx'))
const Calendar = lazyRetry(() => import('./Calendar.jsx'))
const Recap = lazyRetry(() => import('./Recap.jsx'))
const Materials = lazyRetry(() => import('./Materials.jsx'))
const StudentMaterials = lazyRetry(() => import('./StudentMaterials.jsx'))
const Wait = <div className="empty">Memuat...</div>

// Batas waktu supaya layar tidak menggantung selamanya saat server tidak merespons.
const withTimeout = (p, ms = 15000) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

// Jika satu halaman error, tampilkan pesan (bukan layar kosong).
class Boundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="empty">
        <p>Halaman gagal dimuat.</p>
        <button className="btn" onClick={() => location.reload()}>Muat ulang</button>
      </div>
    )
  }
}

function ChangePassword({ onDone, code }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState({ t: '', ok: false })
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (pw.length < 6) return setMsg({ t: 'Password minimal 6 karakter.', ok: false })
    if (code && pw.trim().toUpperCase() === code.toUpperCase()) return setMsg({ t: 'Password baru tidak boleh sama dengan kode awal.', ok: false })
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
  const [openId, setOpenId] = useState(null)
  const go = (k) => { if (k === 'tasks') setOpenId(null); setTab(k) }
  const nt = useNotifs()
  const [kelas, setKelas] = useState('')
  useEffect(() => {
    if (!profile.class_id) return
    supabase.from('classes').select('name').eq('id', profile.class_id).maybeSingle()
      .then((r) => setKelas(r.data?.name || ''))
  }, [profile.class_id])
  const me = { ...profile, kelas }
  useEffect(() => { if (['tasks', 'materials', 'grades'].includes(tab)) nt.markSeen(tab) }, [tab])
  const items = [
    { k: 'home', label: 'Beranda', icon: I.home },
    { k: 'tasks', label: 'Tugas', icon: I.tasks, badge: nt.counts.tasks },
    { k: 'materials', label: 'Materi', icon: I.book, badge: nt.counts.materials },
    { k: 'calendar', label: 'Kalender', icon: I.calendar },
    { k: 'grades', label: 'Nilai', icon: I.star, badge: nt.counts.grades },
    { k: 'account', label: 'Akun', icon: I.user },
  ]
  return (
    <Shell s={s} profile={me} role="Siswa" items={items} tab={tab} setTab={go}>
      <Boundary key={tab}><Suspense fallback={Wait}>
      {nt.popup && <NotifPopup data={nt.popup} onClose={nt.closePopup} onGo={(k) => { nt.closePopup(); go(k) }} />}
      {tab === 'home' && <Home profile={me} goAccount={() => setTab('account')} goTasks={() => go('tasks')} onOpen={(id) => { setOpenId(id); setTab('tasks') }} />}
      {tab === 'tasks' && <StudentTasks profile={profile} openId={openId} setOpenId={setOpenId} />}
      {tab === 'materials' && <StudentMaterials />}
      {tab === 'calendar' && <Calendar onOpen={(id) => { setOpenId(id); setTab('tasks') }} />}
      {tab === 'grades' && <Grades />}
      {tab === 'account' && (<>
        <h2>Profil saya</h2>
        <dl className="prof">
          <div><dt>Nama</dt><dd>{me.full_name}</dd></div>
          <div><dt>Kelas</dt><dd>{kelas || 'Belum ada kelas'}</dd></div>
          <div><dt>Username (kode masuk)</dt><dd>{me.code || '-'}</dd></div>
        </dl>
        <h2>Ubah password</h2>
        <ChangePassword onDone={reload} code={profile.code} />
        <button className="btn ghost" style={{ marginTop: 16 }}
          onClick={() => window.confirm('Keluar dari akun ini?') && supabase.auth.signOut()}>Keluar dari akun</button>
      </>)}
      </Suspense></Boundary>
    </Shell>
  )
}

function Teacher({ profile, s, onSaved }) {
  const [tab, setTab] = useState('dash')
  const items = [
    { k: 'dash', label: 'Dasbor', icon: I.grid },
    { k: 'tasks', label: 'Tugas', icon: I.tasks },
    { k: 'materials', label: 'Materi', icon: I.book },
    { k: 'grading', label: 'Penilaian', icon: I.check },
    { k: 'recap', label: 'Rekap Nilai', icon: I.table },
    { k: 'students', label: 'Siswa & Kelas', icon: I.users },
    { k: 'settings', label: 'Pengaturan', icon: I.sliders },
  ]
  return (
    <Shell s={s} profile={profile} role="Guru" items={items} tab={tab} setTab={setTab}>
      <Boundary key={tab}><Suspense fallback={Wait}>
      {tab === 'dash' && <Dashboard profile={profile} go={setTab} />}
      {tab === 'tasks' && <Tasks profile={profile} />}
      {tab === 'materials' && <Materials profile={profile} />}
      {tab === 'grading' && <Grading />}
      {tab === 'recap' && <Recap />}
      {tab === 'students' && <Students />}
      {tab === 'settings' && <Settings s={s} onSaved={onSaved} />}
      </Suspense></Boundary>
    </Shell>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [state, setState] = useState('loading')
  const [s, setS] = useState(DEFAULTS)

  useEffect(() => { loadSettings().then(setS).catch(() => {}) }, [])
  useEffect(() => {
    document.documentElement.style.setProperty('--board', s.color)
    document.title = s.school_name
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', s.color)
  }, [s])

  useEffect(() => {
    let off = false
    withTimeout(supabase.auth.getSession())
      .then(({ data }) => { if (!off) setSession(data.session ?? null) })
      .catch(() => { if (!off) setState('error') })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, x) =>
      setSession((prev) => (prev && x && prev.user.id === x.user.id ? prev : x)))
    return () => { off = true; sub.subscription.unsubscribe() }
  }, [])

  async function loadProfile(x = session) {
    if (!x) { setProfile(null); setState('out'); return }
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', x.user.id).maybeSingle())
      // Gangguan jaringan/server BUKAN alasan untuk mengeluarkan pengguna.
      if (error) throw error
      if (!data || !data.active) {
        await supabase.auth.signOut(); setProfile(null); setState('out'); return
      }
      try { sessionStorage.removeItem('chunk-retry') } catch { /* abaikan */ }
      setProfile(data); setState('in')
    } catch {
      setState('error')
    }
  }

  // PERBAIKAN: `session === undefined` ikut jadi dependency. Tanpa ini, saat belum login
  // (session berubah dari undefined ke null) nilai `session?.user?.id` tetap undefined,
  // efek tidak jalan lagi, dan layar macet di "Memuat...".
  useEffect(() => { if (session !== undefined) loadProfile(session) },
    [session === undefined, session?.user?.id])

  if (state === 'loading') return <div className="center">Memuat...</div>
  if (state === 'error') return (
    <div className="center" style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: 24 }}>
      <div>Tidak bisa terhubung ke server. Periksa internet, lalu coba lagi.</div>
      <button className="btn" onClick={() => location.reload()}>Coba lagi</button>
    </div>
  )
  if (state === 'out') return <Login s={s} />
  return profile.role === 'teacher'
    ? <Teacher profile={profile} s={s} onSaved={setS} />
    : <Student profile={profile} s={s} reload={() => loadProfile()} />
}
