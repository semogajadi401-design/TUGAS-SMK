import { useEffect, useState } from 'react'
import './splash.css'

const KEY = 'aksara-splash'
const LETTERS = ['A', 'K', 'S', 'A', 'R', 'A']
// [huruf depan, sisa kata]; kata tanpa huruf depan (dan) diberi null
const WORDS = [['A', 'plikasi'], ['K', 'egiatan'], ['S', 'ekolah'], [null, 'dan'], ['R', 'uang'], ['A', 'kademik']]

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const seen = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }

// Splash AKSARA: tampil sekali setiap aplikasi dibuka (bukan setiap muat ulang halaman).
export default function Splash() {
  const [phase, setPhase] = useState(() => (seen() ? 'gone' : 'in'))
  const rm = reduced()

  useEffect(() => {
    if (phase !== 'in') return
    try { sessionStorage.setItem(KEY, '1') } catch { /* abaikan */ }
    const t1 = setTimeout(() => setPhase('out'), rm ? 1600 : 4300)
    return () => clearTimeout(t1)
  }, [phase])

  useEffect(() => {
    if (phase !== 'out') return
    const t = setTimeout(() => setPhase('gone'), 700)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'gone') return null

  let n = -1
  return (
    <div className={'sp' + (phase === 'out' ? ' out' : '') + (rm ? ' calm' : '')} role="status"
      aria-label="AKSARA, Aplikasi Kegiatan Sekolah dan Ruang Akademik" onClick={() => setPhase('out')}>
      <div className="sp-bg" aria-hidden="true">
        <i className="orb o1" /><i className="orb o2" /><i className="orb o3" />
        <div className="sp-grid" />
      </div>

      <div className="sp-core" aria-hidden="true">
        <div className="sp-hi">Selamat datang di</div>
        <h1 className="sp-word">
          {LETTERS.map((c, i) => <span key={i} className="ch" style={{ '--i': i }}>{c}</span>)}
        </h1>
        <div className="sp-line" />
        <p className="sp-sub">
          {WORDS.map(([h, rest], i) => {
            if (h) n++
            return (
              <span key={i} className={'w' + (h ? '' : ' dim')} style={{ '--d': i }}>
                {h && <b>{h}</b>}{rest}
              </span>
            )
          })}
        </p>
      </div>

      <button className="sp-skip" onClick={() => setPhase('out')}>Lewati</button>
      <div className="sp-bar" aria-hidden="true"><i /></div>
    </div>
  )
}
