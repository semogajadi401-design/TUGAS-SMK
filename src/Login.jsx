import { useEffect, useState } from 'react'
import { supabase, toEmail } from './supabase.js'
import { Brand } from './Settings.jsx'
import { Art } from './Backdrop.jsx'

const P = {
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  expand: 'M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3',
  shrink: 'M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7c1.7 0 3.2-.4 4.5-1',
}
const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

// Segmen: [teks, warna] dengan 0 = putih, 1 = emas, 2 = hijau mint
const MSG = [
  [['Disiplin ', 2], ['melahirkan ', 0], ['prestasi.', 1]],
  [['Belajar ', 0], ['cerdas', 2], [', hasil ', 0], ['nyata.', 1]],
  [['Jujur ', 1], ['itu karya ', 0], ['terbaik.', 2]],
  [['Masa depan ', 2], ['dimulai ', 0], ['hari ini.', 1]],
  [['Tepat waktu', 1], [', ', 0], ['tuntas', 2], [', bermutu.', 0]],
]
const TONE = ['', ' gold', ' mint']

// Lambang percikan bergaya Claude, digambar sebagai SVG sederhana.
const Spark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="#D97757" strokeWidth="2.6" strokeLinecap="round">
    {Array.from({ length: 12 }, (_, k) => {
      const a = (k * Math.PI) / 6, r = k % 2 ? 6.2 : 10
      return <line key={k} x1={12 + 2.6 * Math.cos(a)} y1={12 + 2.6 * Math.sin(a)} x2={12 + r * Math.cos(a)} y2={12 + r * Math.sin(a)} />
    })}
  </svg>
)

export default function Login({ s }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [m, setM] = useState(0)
  const [fs, setFs] = useState(false)
  const canFs = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const toggleFs = () => (document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen()).catch(() => {})

  useEffect(() => {
    const t = setInterval(() => setM((x) => (x + 1) % MSG.length), 6000)
    return () => clearInterval(t)
  }, [m])

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
      <Art />
      {canFs && (
        <button type="button" className="lg-fs" onClick={toggleFs} aria-pressed={fs}
          aria-label={fs ? 'Keluar dari layar penuh' : 'Layar penuh'} title={fs ? 'Keluar dari layar penuh' : 'Layar penuh'}>
          <Icon d={fs ? P.shrink : P.expand} />
        </button>
      )}
      <div className="login-in">
        <div className="lg-left">
          <div className="lg-brand"><Brand s={s} size={44} /><strong>{s.school_name}</strong></div>
          <div className="lg-msg" role="status">
            {MSG.map((line, i) => (
              <p key={i} className={'lg-line' + (i === m ? ' on' : '')} aria-hidden={i !== m}>
                {line.map(([t, c], j) => (
                  <span key={j} className={TONE[c].trim()} style={{ transitionDelay: i === m ? j * 110 + 'ms' : '0ms' }}>{t}</span>
                ))}
              </p>
            ))}
          </div>
          <div className="lg-dots" role="tablist" aria-label="Pesan">
            {MSG.map((_, i) => <button key={i} type="button" className={i === m ? 'on' : ''} aria-label={'Pesan ' + (i + 1)} onClick={() => setM(i)} />)}
          </div>
          <p className="lg-sub">Tugas, materi, dan nilaimu di satu tempat.</p>
        </div>
      <div className="lg-right">
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
      <footer className="credit">
        <p>Developed By <b>@Tasrif</b></p>
        <p className="pw"><Spark /><span>Powered By <b>Anthropic</b></span></p>
      </footer>
      </div>
      </div>
    </div>
  )
}
