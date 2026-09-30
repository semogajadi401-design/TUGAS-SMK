// src/components/PreloadModal.jsx
import { useEffect, useRef, useState } from 'react'
import { runPreload } from '../lib/preload'
import './PreloadModal.css'

const RADIUS = 54
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function PreloadModal({ tasks, onFinish }) {
  const [state, setState] = useState({ done: 0, total: tasks.length, statuses: {} })
  const [leaving, setLeaving] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // aman dari double-render React StrictMode
    started.current = true
    runPreload({ tasks, onUpdate: setState }).then(() => {
      setLeaving(true)
      setTimeout(onFinish, 450) // tunggu animasi keluar
    })
  }, [])

  const percent = state.total ? Math.round((state.done / state.total) * 100) : 0
  const ready = state.done === state.total && state.total > 0

  return (
    <div className={`pl-backdrop ${leaving ? 'pl-out' : ''}`} role="dialog" aria-modal="true" aria-live="polite">
      <div className="pl-card">
        <div className="pl-ring">
          <svg viewBox="0 0 120 120" width="132" height="132">
            <circle className="pl-track" cx="60" cy="60" r={RADIUS} />
            <circle
              className="pl-bar"
              cx="60"
              cy="60"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
            />
          </svg>
          <div className="pl-center">
            {ready ? (
              <svg viewBox="0 0 24 24" width="44" height="44" className="pl-tick">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <span className="pl-percent">{percent}<small>%</small></span>
            )}
          </div>
          <span className="pl-orbit" aria-hidden="true" />
        </div>

        <h2 className="pl-title">{ready ? 'Semua siap' : 'Menyiapkan data kamu'}</h2>
        <p className="pl-sub">
          {ready ? 'Membuka aplikasi…' : 'Sebentar ya, supaya semua menu terbuka cepat.'}
        </p>

        <ul className="pl-list">
          {tasks.map((t, i) => {
            const s = state.statuses[t.id] || 'pending'
            return (
              <li key={t.id} className={`pl-item is-${s}`} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="pl-dot">
                  {s === 'ok' && (
                    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  )}
                  {s === 'error' && <b>!</b>}
                </span>
                <span className="pl-label">{t.label}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
