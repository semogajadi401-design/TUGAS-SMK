import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const COUNT = 10 // detik hitung mundur

const TIERS = [
  { min: 100, c: 'gold', msg: 'Sempurna! Kamu luar biasa!', sub: 'Semua jawabanmu benar.' },
  { min: 90, c: 'gold', msg: 'Luar biasa!', sub: 'Hasil yang sangat membanggakan.' },
  { min: 75, c: 'green', msg: 'Bagus sekali!', sub: 'Terus pertahankan semangat belajarmu.' },
  { min: 60, c: 'blue', msg: 'Lumayan bagus!', sub: 'Sedikit lagi, kamu pasti bisa lebih baik.' },
  { min: 40, c: 'orange', msg: 'Jangan menyerah!', sub: 'Pelajari lagi materinya, kamu pasti bisa memperbaikinya.' },
  { min: 0, c: 'rose', msg: 'Tetap semangat!', sub: 'Setiap percobaan membuatmu lebih pintar. Belajar lagi ya.' },
]
const tierOf = (s) => TIERS.find((t) => s >= t.min) || TIERS[TIERS.length - 1]
const waiting = (n) => (n > 7 ? 'Jawabanmu sudah terkirim' : n > 3 ? 'Mengoreksi jawabanmu...' : 'Sebentar lagi...')
const fmt = (v) => Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })
const rnd = (a, b) => a + Math.random() * (b - a)

// Animasi hitung mundur 10 detik, lalu nilai besar di tengah layar, lalu mengecil dan halaman hasil tampil.
export default function QuizReveal({ score, onEnd }) {
  const value = Number(score) || 0
  const t = tierOf(value)
  const [phase, setPhase] = useState('count') // count | score | out
  const [n, setN] = useState(COUNT)
  const [shown, setShown] = useState(0)

  const sparks = useMemo(() => Array.from({ length: 16 }, () => ({
    x: rnd(2, 98) + '%', s: rnd(4, 10) + 'px', d: rnd(5, 10) + 's', dl: -rnd(0, 8) + 's',
  })), [])
  const confetti = useMemo(() => value >= 75 ? Array.from({ length: 40 }, (_, i) => ({
    x: rnd(0, 100) + '%', d: rnd(2.6, 4.6) + 's', dl: rnd(0, 1.2) + 's',
    h: ['#ffc93c', '#ff6b8b', '#4cc9f0', '#35d49a', '#b388ff', '#fff'][i % 6],
  })) : [], [value])

  // 1) hitung mundur berdasarkan jam (tetap akurat walau tab sempat melambat)
  useEffect(() => {
    if (phase !== 'count') return
    const t0 = Date.now()
    const id = setInterval(() => {
      const el = (Date.now() - t0) / 1000
      setN(Math.max(0, Math.ceil(COUNT - el)))
      if (el >= COUNT + 0.8) { clearInterval(id); setPhase('score') }
    }, 100)
    return () => clearInterval(id)
  }, [phase])

  // 2) nilai naik dari 0, ditahan sebentar, lalu otomatis mengecil
  useEffect(() => {
    if (phase !== 'score') return
    let raf, t0
    const step = (ts) => {
      t0 ??= ts
      const p = Math.min(1, (ts - t0) / 1500)
      setShown(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const hold = setTimeout(() => setPhase('out'), 5000)
    return () => { cancelAnimationFrame(raf); clearTimeout(hold) }
  }, [phase])

  // 3) selesai mengecil -> tutup
  useEffect(() => {
    if (phase !== 'out') return
    setShown(value)
    const id = setTimeout(onEnd, 950)
    return () => clearTimeout(id)
  }, [phase])

  const node = (
    <div className={`rv c-${t.c}${phase === 'out' ? ' out' : ''}`} role="dialog" aria-modal="true" aria-label="Menghitung nilai quiz"
      onClick={phase === 'score' ? () => setPhase('out') : undefined}>
      <div className="rv-bg" aria-hidden="true"><i /><i /><i /></div>
      {sparks.map((p, k) => <span key={k} className="rv-p" aria-hidden="true" style={{ '--x': p.x, '--s': p.s, '--d': p.d, '--dl': p.dl }} />)}

      {phase === 'count' && (
        <div className="rv-stage">
          <div className="rv-ring">
            <svg viewBox="0 0 220 220" aria-hidden="true">
              <circle className="rv-track" cx="110" cy="110" r="98" />
              <circle className="rv-prog" cx="110" cy="110" r="98" />
              <circle className="rv-dash" cx="110" cy="110" r="84" />
            </svg>
            <span className="rv-orbit o1" aria-hidden="true"><i /></span>
            <span className="rv-orbit o2" aria-hidden="true"><i /></span>
            <span className="rv-orbit o3" aria-hidden="true"><i /></span>
            <b key={n} className="rv-num">{n}</b>
          </div>
          <p className="rv-msg" key={waiting(n)}>{waiting(n)}</p>
        </div>
      )}

      {phase !== 'count' && (
        <div className="rv-final">
          <div className="rv-scorewrap">
            <span className="rv-wave" aria-hidden="true" /><span className="rv-wave w2" aria-hidden="true" />
            <div className="rv-score"><strong>{fmt(shown)}</strong><small>dari 100</small></div>
          </div>
          <h2>{t.msg}</h2>
          <p>{t.sub}</p>
          <em>Ketuk untuk melanjutkan</em>
          <span className="rv-sr" aria-live="assertive">Nilaimu {fmt(value)}. {t.msg}</span>
        </div>
      )}

      {phase !== 'count' && confetti.map((c, k) => <span key={k} className="rv-cf" aria-hidden="true" style={{ '--x': c.x, '--d': c.d, '--dl': c.dl, '--h': c.h }} />)}
    </div>
  )
  return createPortal(node, document.body)
}
