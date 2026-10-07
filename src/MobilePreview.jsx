import { useEffect, useState } from 'react'
import './mobilepreview.css'

// Tombol "Versi Mobile" untuk layar laptop/desktop.
// Memuat aplikasi yang sama di dalam bingkai selebar HP, sehingga media query
// CSS aktif persis seperti di HP asli.
const DEVICES = [
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'iPhone 14', w: 390, h: 844 },
  { name: 'Galaxy S20', w: 360, h: 800 },
  { name: 'iPhone 14 Pro Max', w: 430, h: 932 },
]
const DESKTOP_MIN = 900

const inFrame = () => { try { return window.self !== window.top } catch { return true } }

export default function MobilePreview() {
  const [wide, setWide] = useState(() => window.innerWidth >= DESKTOP_MIN)
  const [open, setOpen] = useState(false)
  const [dev, setDev] = useState(1)
  const [vh, setVh] = useState(() => window.innerHeight)

  useEffect(() => {
    const onResize = () => { setWide(window.innerWidth >= DESKTOP_MIN); setVh(window.innerHeight) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.style.overflow = '' }
  }, [open])

  useEffect(() => { if (!wide) setOpen(false) }, [wide])

  // Jangan tampil di dalam bingkai HP itu sendiri, maupun di HP/tablet asli.
  if (inFrame() || !wide) return null

  const d = DEVICES[dev]
  const needed = d.h + 24
  const scale = Math.min(1, (vh - 110) / needed)
  const trim = -(needed * (1 - scale)) / 2

  return (
    <>
      <button type="button" className="mp-btn" onClick={() => setOpen(true)} aria-label="Buka tampilan versi mobile">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" />
        </svg>
        Versi Mobile
      </button>

      {open && (
        <div className="mp-overlay" role="dialog" aria-label="Pratinjau versi mobile">
          <div className="mp-bar">
            <button type="button" className="mp-close" onClick={() => setOpen(false)}>Kembali ke Desktop</button>
            <select className="mp-device" value={dev} onChange={(e) => setDev(+e.target.value)} aria-label="Pilih ukuran HP">
              {DEVICES.map((x, i) => <option key={x.name} value={i}>{x.name} ({x.w}×{x.h})</option>)}
            </select>
            <span className="mp-size">{d.w} × {d.h}</span>
          </div>
          <div className="mp-phone"
            style={{ width: d.w, height: d.h, transform: `scale(${scale})`, marginTop: trim, marginBottom: trim }}>
            <iframe className="mp-frame" title="Versi Mobile" src={window.location.href.split('#')[0]} />
          </div>
        </div>
      )}
    </>
  )
}
