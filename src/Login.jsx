import { useEffect, useState } from 'react'
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

const MSG = [
  'Setiap tugas kecil yang selesai adalah langkah menuju karya besar.',
  'Disiplin hari ini, kebanggaan di hari esok.',
  'Belajar bukan soal cepat, tetapi soal konsisten.',
  'Ilmu tumbuh dari kebiasaan yang dijaga setiap hari.',
  'Kerjakan dengan jujur. Hasilnya akan berbicara sendiri.',
]

function Art() {
  const lines = Array.from({ length: 12 }, (_, i) => {
    const y = 170 + i * 50
    return `M-120 ${y} C 260 ${y - 230}, 620 ${y + 250}, 980 ${y - 30} S 1400 ${y - 170}, 1600 ${y + 60}`
  })
  return (<>
    <div className="fx" aria-hidden="true">
      <i className="blob b1" /><i className="blob b2" /><i className="blob b3" />
      {Array.from({ length: 16 }, (_, i) => (
        <i key={i} className={'spark' + (i % 4 === 0 ? ' gold' : '')}
          style={{ '--x': ((i * 37 + 11) % 100) + '%', '--s': 2 + (i % 3) + 'px', '--d': 16 + ((i * 7) % 14) + 's',
            '--t': -((i * 5) % 20) + 's', '--dx': (i % 2 ? 40 : -40) + 'px' }} />
      ))}
    </div>
    <svg className="art" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lg-fade" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="lg-mask"><rect width="1440" height="900" fill="url(#lg-fade)" /></mask>
        <pattern id="lg-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#fff" /></pattern>
        <linearGradient id="lg-gold" x1="0" x2="1"><stop offset="0" stopColor="var(--chalk)" stopOpacity="0" /><stop offset=".5" stopColor="var(--chalk)" /><stop offset="1" stopColor="var(--chalk)" stopOpacity="0" /></linearGradient>
      </defs>
      <g className="sway" mask="url(#lg-mask)" fill="none" stroke="#fff">
        {lines.map((d, i) => <path key={i} d={d} strokeOpacity={0.05 + i * 0.013} strokeWidth="1" />)}
      </g>
      <path d={lines[6]} fill="none" stroke="url(#lg-gold)" strokeWidth="1.6" strokeOpacity=".75" />
      {[2, 6, 9].map((n, i) => (
        <path key={n} className="streak" d={lines[n]} pathLength="1000" stroke={i === 1 ? 'var(--chalk)' : '#fff'}
          style={{ animationDuration: 9 + i * 3 + 's', animationDelay: -i * 4 + 's' }} />
      ))}
      <g fill="none" stroke="#fff" strokeOpacity=".09">
        {[90, 160, 235, 320].map((r, i) => <circle key={r} className="ring" cx="1190" cy="180" r={r} style={{ animationDelay: -i * 1.6 + 's' }} />)}
      </g>
      <circle cx="1190" cy="180" r="6" fill="var(--chalk)" />
      <g className="orbit"><circle cx="1425" cy="180" r="4.5" fill="var(--chalk)" /></g>
      <g className="orbit rev"><circle cx="1350" cy="180" r="3.5" fill="#fff" fillOpacity=".85" /></g>
      <rect x="0" y="540" width="460" height="360" fill="url(#lg-dots)" opacity=".16" mask="url(#lg-mask)" />
      <path className="tri" d="M0 900 L300 600 L600 900 Z" fill="#fff" fillOpacity=".025" />
      <path className="tri b" d="M180 900 L520 520 L860 900 Z" fill="var(--chalk)" fillOpacity=".04" />
    </svg>
  </>)
}

export default function Login({ s }) {
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [m, setM] = useState(0)

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
      <div className="login-in">
        <div className="lg-left">
          <div className="lg-brand"><Brand s={s} size={44} /><strong>{s.school_name}</strong></div>
          <blockquote className="lg-msg" key={m} aria-live="polite">{MSG[m]}</blockquote>
          <div className="lg-dots" role="tablist" aria-label="Pesan">
            {MSG.map((_, i) => <button key={i} type="button" className={i === m ? 'on' : ''} aria-label={'Pesan ' + (i + 1)} onClick={() => setM(i)} />)}
          </div>
          <p className="lg-sub">Tugas, materi, dan nilaimu di satu tempat.</p>
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
    </div>
  )
}
