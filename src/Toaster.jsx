import { useEffect, useState } from 'react'
import { onToast } from './lib/toast.js'
import './offline.css'

export default function Toaster() {
  const [items, setItems] = useState([])
  const close = (id) => setItems((l) => l.filter((x) => x.id !== id))

  useEffect(() => onToast((t) => {
    // Pesan dengan teks sama menggantikan yang lama, supaya tidak menumpuk.
    setItems((l) => [...l.filter((x) => x.text !== t.text), t].slice(-3))
    if (t.ms > 0) setTimeout(() => close(t.id), t.ms)
  }), [])

  if (!items.length) return null
  return (
    <div className="toasts" role="region" aria-label="Pemberitahuan">
      {items.map((t) => (
        <div key={t.id} className={'toast ' + t.kind} role="status" aria-live="polite">
          <span>{t.text}</span>
          {t.action && <button className="toast-go" onClick={() => { close(t.id); t.action.onClick() }}>{t.action.label}</button>}
          <button className="toast-x" aria-label="Tutup" onClick={() => close(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
