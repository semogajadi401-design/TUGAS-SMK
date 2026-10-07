import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { supabase, toEmail, signIn, isAuthDown } from './supabase.js'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Home from './Home.jsx'
import Shell, { I } from './Shell.jsx'
import { useNotifs, NotifPopup } from './Notifs.jsx'
import { loadSettings, DEFAULTS } from './brand.jsx'
import { useStudentPresence, useOnlineStudents } from './presence.jsx'
import Welcome, { hasSeenWelcome, markWelcomeSeen } from './Welcome.jsx'
import PushCard from './PushCard.jsx'
import { useOnline } from './lib/net.js'
import { toast } from './lib/toast.js'
import {
  listPending, saveLastProfile, loadLastProfile, wipeCaches,
  commitLogin, forgetOfflineLogin, saveOfflineLogin, dropStagedLogin, KEEP_OFFLINE_ON_LOGOUT,
} from './lib/offline.js'
import { syncPush, detachPush } from './lib/push.js'

// Id pengguna dari sesi yang tersimpan di perangkat. Kosong bila sudah keluar dari akun.
function storedUserId() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (/^sb-.+-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k))?.user?.id || null
    }
  } catch { /* abaikan */ }
  return null
}
const TABS_FROM_LINK = ['tasks', 'materials', 'quiz', 'grades']

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
const Quiz = lazyRetry(() => import('./Quiz.jsx'))
const StudentQuiz = lazyRetry(() => import('./StudentQuiz.jsx'))
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

function ChangePassword({ onDone, code, profile }) {
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
      if (code && profile) saveOfflineLogin(toEmail(code), pw, profile) // supaya masuk offline memakai password baru
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

// Keluar akun yang tetap berhasil saat offline atau server lambat (sama seperti menu logo di Shell).
async function logout() {
  try { await supabase.auth.signOut() } catch { /* lanjut ke cara lokal */ }
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* abaikan */ }
  window.location.reload()
}

const Soon = ({ text }) => <div className="empty">{text}</div>

function Student({ profile, reload, s }) {
  const online = useOnline()
  // Dibuka dari pemberitahuan (?go=tasks&id=...) atau, bila offline, langsung ke Tugas.
  const link = new URLSearchParams(window.location.search)
  const [tab, setTab] = useState(() => {
    const g = link.get('go')
    return TABS_FROM_LINK.includes(g) ? g : (online ? 'home' : 'tasks')
  })
  const [openId, setOpenId] = useState(() => (link.get('go') === 'tasks' ? link.get('id') : null))
  const go = (k) => { if (k === 'tasks') setOpenId(null); setTab(k) }
  const needsNet = !online && !['tasks', 'account'].includes(tab)

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
    // Pemberitahuan diketuk saat aplikasi sudah terbuka.
    const onMsg = (e) => {
      const d = e.data
      if (d?.type !== 'go' || !TABS_FROM_LINK.includes(d.go)) return
      if (d.go === 'tasks' && d.id) { setOpenId(d.id); setTab('tasks') } else go(d.go)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])

  // Pantau koneksi: beri tahu saat offline, dan ingatkan jawaban offline yang belum terkirim saat online lagi.
  const wasOnline = useRef(online)
  useEffect(() => {
    let off = false
    ;(async () => {
      if (!online) {
        toast({ kind: 'warn', text: 'Kamu sedang offline. Tugas yang sudah pernah dibuka tetap bisa dikerjakan dan disimpan di perangkat.' })
      } else {
        const list = await listPending(profile.id)
        if (off) return
        if (list.length) {
          toast({
            kind: 'warn', ms: 15000,
            text: list.length === 1
              ? `Jawaban "${list[0].title || 'tugas'}" yang kamu kerjakan saat offline belum terkirim.`
              : `${list.length} jawaban yang kamu kerjakan saat offline belum terkirim.`,
            action: { label: 'Kirim', onClick: () => { if (list.length === 1) { setOpenId(list[0].taskId); setTab('tasks') } else go('tasks') } },
          })
        } else if (!wasOnline.current) toast({ kind: 'ok', text: 'Internet kembali.', ms: 2500 })
      }
      wasOnline.current = online
    })()
    return () => { off = true }
  }, [online])

  // Pemberitahuan: perbarui pendaftaran perangkat ini (bila siswa sudah mengaktifkannya).
  useEffect(() => { if (online) syncPush().catch(() => {}) }, [online, profile.id])
  const nt = useNotifs()
  const [kelas, setKelas] = useState('')
  useEffect(() => {
    if (!profile.class_id) return
    supabase.from('classes').select('name').eq('id', profile.class_id).maybeSingle()
      .then((r) => setKelas(r.data?.name || ''))
  }, [profile.class_id])
  const me = { ...profile, kelas }
  useStudentPresence(profile, kelas)
  // Pesan sambutan: tampil sekali saja, saat siswa pertama kali masuk.
  const [welcome, setWelcome] = useState(false)
  useEffect(() => {
    let off = false
    hasSeenWelcome(profile.id).then((seen) => { if (!off && !seen) setWelcome(true) })
    return () => { off = true }
  }, [profile.id])
  const closeWelcome = () => { markWelcomeSeen(profile.id); setWelcome(false) }
  useEffect(() => { if (online && ['tasks', 'materials', 'grades', 'quiz'].includes(tab)) nt.markSeen(tab) }, [tab, online])
  const items = [
    { k: 'home', label: 'Beranda', icon: I.home },
    { k: 'tasks', label: 'Tugas', icon: I.tasks, badge: nt.counts.tasks },
    { k: 'materials', label: 'Materi', icon: I.book, badge: nt.counts.materials },
    { k: 'quiz', label: 'Quiz', icon: I.quiz, badge: nt.counts.quiz },
    { k: 'calendar', label: 'Kalender', icon: I.calendar },
    { k: 'grades', label: 'Nilai', icon: I.star, badge: nt.counts.grades },
    { k: 'account', label: 'Akun', icon: I.user },
  ]
  return (
    <Shell s={s} profile={me} role="Siswa" items={items} tab={tab} setTab={go}>
      {welcome && <Welcome name={profile.full_name.split(' ')[0]} onClose={closeWelcome} />}
      {!online && <div className="offbar" role="status">Mode offline. Tugas yang sudah pernah dibuka tetap bisa dikerjakan.</div>}
      {online && tab !== 'account' && <PushCard compact />}
      <Boundary key={tab}><Suspense fallback={Wait}>
      {needsNet && (
        <div className="empty">
          <p>Halaman ini butuh internet.</p>
          <button className="btn" onClick={() => go('tasks')}>Buka tugas</button>
        </div>
      )}
      {nt.popup && <NotifPopup data={nt.popup} onClose={nt.closePopup} onGo={(k) => { nt.closePopup(); go(k) }} />}
      {!needsNet && tab === 'home' && <Home profile={me} goAccount={() => setTab('account')} goTasks={() => go('tasks')} onOpen={(id) => { setOpenId(id); setTab('tasks') }} />}
      {tab === 'tasks' && <StudentTasks profile={profile} openId={openId} setOpenId={setOpenId} />}
      {!needsNet && tab === 'materials' && <StudentMaterials />}
      {!needsNet && tab === 'quiz' && <StudentQuiz />}
      {!needsNet && tab === 'calendar' && <Calendar onOpen={(id) => { setOpenId(id); setTab('tasks') }} />}
      {!needsNet && tab === 'grades' && <Grades />}
      {tab === 'account' && (<>
        <h2>Profil saya</h2>
        <dl className="prof">
          <div><dt>Nama</dt><dd>{me.full_name}</dd></div>
          <div><dt>Kelas</dt><dd>{kelas || 'Belum ada kelas'}</dd></div>
          <div><dt>Username (kode masuk)</dt><dd>{me.code || '-'}</dd></div>
        </dl>
        <PushCard />
        <h2>Ubah password</h2>
        <ChangePassword onDone={reload} code={profile.code} profile={profile} />
        <button className="btn ghost" style={{ marginTop: 16 }}
          onClick={() => window.confirm('Keluar dari akun ini?') && logout()}>Keluar dari akun</button>
      </>)}
      </Suspense></Boundary>
    </Shell>
  )
}

function Teacher({ profile, s, onSaved }) {
  const [tab, setTab] = useState('dash')
  const online = useOnlineStudents()
  const items = [
    { k: 'dash', label: 'Dasbor', icon: I.grid },
    { k: 'tasks', label: 'Tugas', icon: I.tasks },
    { k: 'materials', label: 'Materi', icon: I.book },
    { k: 'quiz', label: 'Quiz', icon: I.quiz },
    { k: 'grading', label: 'Penilaian', icon: I.check },
    { k: 'recap', label: 'Rekap Nilai', icon: I.table },
    { k: 'students', label: 'Siswa & Kelas', icon: I.users },
    { k: 'settings', label: 'Pengaturan', icon: I.sliders },
  ]
  return (
    <Shell s={s} profile={profile} role="Guru" items={items} tab={tab} setTab={setTab}>
      <Boundary key={tab}><Suspense fallback={Wait}>
      {tab === 'dash' && <Dashboard profile={profile} go={setTab} online={online} />}
      {tab === 'tasks' && <Tasks profile={profile} />}
      {tab === 'materials' && <Materials profile={profile} />}
      {tab === 'quiz' && <Quiz />}
      {tab === 'grading' && <Grading />}
      {tab === 'recap' && <Recap />}
      {tab === 'students' && <Students online={online} />}
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
  const [offlineMode, setOfflineMode] = useState(false)
  const online = useOnline()
  // Password siswa yang masuk secara offline. Hanya di memori (hilang saat halaman ditutup) dan dipakai
  // untuk masuk otomatis ke server begitu internet kembali, supaya jawaban offline bisa terkirim.
  const offlineCred = useRef(null)

  // Siswa masuk lewat password yang dicocokkan di perangkat (Login.jsx -> offlineLogin).
  function enterOffline(p, email, pw, uid) {
    offlineCred.current = { email, pw, uid }
    setProfile(p); setState('in'); setOfflineMode(true)
  }

  // Sesi masih tersimpan tapi tidak bisa diperbarui karena offline: buka aplikasi dengan profil terakhir
  // (hanya siswa). Setelah keluar dari akun, sesi terhapus sehingga jalur ini tidak bisa dipakai.
  async function tryOffline() {
    const uid = storedUserId()
    if (!uid) return false
    const p = await loadLastProfile()
    if (!p || p.id !== uid || !p.active || p.role !== 'student') return false
    setProfile(p); setState('in'); setOfflineMode(true)
    return true
  }

  useEffect(() => { loadSettings().then(setS).catch(() => {}) }, [])
  useEffect(() => {
    document.documentElement.style.setProperty('--board', s.color)
    document.title = s.school_name
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', s.color)
  }, [s])

  useEffect(() => {
    let off = false
    withTimeout(supabase.auth.getSession())
      .then(async ({ data, error }) => {
        if (off) return
        if (!data.session && (error || !navigator.onLine) && await tryOffline()) return
        setSession(data.session ?? null)
      })
      .catch(async () => { if (!off && !(await tryOffline())) setState('error') })
    const { data: sub } = supabase.auth.onAuthStateChange((e, x) => {
      if (e === 'SIGNED_OUT') {
        detachPush(); dropStagedLogin(); offlineCred.current = null
        if (!KEEP_OFFLINE_ON_LOGOUT) wipeCaches() // jawaban yang belum terkirim tetap disimpan
      }
      setSession((prev) => (prev && x && prev.user.id === x.user.id ? prev : x))
    })
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
        forgetOfflineLogin(x.user.id)
        await supabase.auth.signOut(); setProfile(null); setState('out'); return
      }
      try { sessionStorage.removeItem('chunk-retry') } catch { /* abaikan */ }
      saveLastProfile(data)
      commitLogin(data) // simpan/perbarui data masuk offline (khusus siswa)
      setProfile(data); setState('in'); setOfflineMode(false)
    } catch {
      if (!(await tryOffline())) setState('error')
    }
  }

  // PERBAIKAN: `session === undefined` ikut jadi dependency. Tanpa ini, saat belum login
  // (session berubah dari undefined ke null) nilai `session?.user?.id` tetap undefined,
  // efek tidak jalan lagi, dan layar macet di "Memuat...".
  useEffect(() => { if (session !== undefined) loadProfile(session) },
    [session === undefined, session?.user?.id])

  // Internet kembali saat aplikasi dibuka dalam mode offline: pulihkan sesi dan muat ulang profil.
  // Bila masuk lewat password offline (belum ada sesi), masuk ke server otomatis dengan password tadi.
  useEffect(() => {
    if (!offlineMode || !online) return
    let off = false
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (off) return
        if (data.session) { setSession(data.session); loadProfile(data.session); return }
        const c = offlineCred.current
        if (!c) return
        const { error } = await signIn(c.email, c.pw)
        if (off) return
        if (!error) { offlineCred.current = null; return } // onAuthStateChange memuat ulang profil
        if (isAuthDown(error)) return // masih gangguan jaringan: tetap offline, coba lagi nanti
        // Password di server sudah berbeda (mis. direset guru): data masuk offline tidak berlaku lagi.
        offlineCred.current = null
        forgetOfflineLogin(c.uid)
        setOfflineMode(false); setProfile(null); setState('out')
        toast({ kind: 'warn', ms: 8000, text: 'Passwordmu sudah berubah. Masuk lagi dengan password yang baru.' })
      } catch { /* abaikan, dicoba lagi saat status online berubah */ }
    })()
    return () => { off = true }
  }, [offlineMode, online])

  if (state === 'loading') return <div className="center">Memuat...</div>
  if (state === 'error') return (
    <div className="center" style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: 24 }}>
      <div>Tidak bisa terhubung ke server. Periksa internet, lalu coba lagi.</div>
      <button className="btn" onClick={() => location.reload()}>Coba lagi</button>
    </div>
  )
  if (state === 'out') return <Login s={s} onOffline={enterOffline} />
  return profile.role === 'teacher'
    ? <Teacher profile={profile} s={s} onSaved={setS} />
    : <Student profile={profile} s={s} reload={() => loadProfile()} />
}
