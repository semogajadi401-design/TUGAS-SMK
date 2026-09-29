import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { Brand } from './Settings.jsx'
import { Art } from './Backdrop.jsx'

export const I = {
  menu: 'M4 7h16M4 12h16M4 17h10',
  close: 'M6 6l12 12M18 6L6 18',
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  tasks: 'M9 4h6v3H9zM7 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M8 12h8M8 16h5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  grid: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
  check: 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  calendar: 'M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  table: 'M3 5h18v14H3zM3 10h18M9 5v14',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 7h6M9 11h6',
}

export const Icon = ({ d, size = 22 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

export default function Shell({ s, profile, role, items, tab, setTab, children }) {
  const [open, setOpen] = useState(false)
  const [fx, setFx] = useState(() => { try { return localStorage.getItem('bgfx') === '1' } catch { return false } })
  const flipFx = () => setFx((v) => { try { localStorage.setItem('bgfx', v ? '0' : '1') } catch { /* diabaikan */ } return !v })

  useEffect(() => {
    const k = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const cur = items.find((i) => i.k === tab)
  const go = (k) => { setTab(k); setOpen(false) }
  const out = () => { if (window.confirm('Keluar dari akun ini?')) supabase.auth.signOut() }

  return (
    <div className={'shell' + (fx ? ' fx-on' : '')}>
      {fx && <div className="bgfx" aria-hidden="true"><Art /></div>}
      <header className="top">
        <button className="menu-btn" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon d={I.menu} />
        </button>
        <div className="ttl"><small>{s.school_name}</small><strong>{cur?.label}</strong></div>
        <button className={'menu-btn fx-btn' + (fx ? ' on' : '')} aria-pressed={fx} onClick={flipFx}
          aria-label="Latar transparan" title="Latar transparan"><Icon d={I.layers} /></button>
        <Brand s={s} size={38} />
      </header>

      <main className="page">{children}</main>

      <div className={'scrim' + (open ? ' show' : '')} onClick={() => setOpen(false)} />
      <aside className={'drawer' + (open ? ' open' : '')} aria-label="Menu">
        <div className="d-head">
          <Brand s={s} size={60} />
          <div className="d-who"><strong>{profile.full_name}</strong><small>{role}</small></div>
          <button className="d-close" aria-label="Tutup menu" onClick={() => setOpen(false)}><Icon d={I.close} /></button>
        </div>
        <nav className="d-nav">
          {items.map((i) => (
            <button key={i.k} className={'d-item' + (tab === i.k ? ' on' : '')} onClick={() => go(i.k)}>
              <Icon d={i.icon} />{i.label}
            </button>
          ))}
        </nav>
        <button className="d-out" onClick={out}><Icon d={I.logout} />Keluar dari akun</button>
      </aside>
    </div>
  )
}
