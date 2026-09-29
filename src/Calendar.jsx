import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const key = (d) => { const x = new Date(d), p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}` }
const hm = (d) => new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export default function Calendar({ onOpen }) {
  const [rows, setRows] = useState(null)
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [sel, setSel] = useState(key(new Date()))

  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at,subjects(name)').eq('status', 'active').not('due_at', 'is', null),
        supabase.from('submissions').select('assignment_id,status,score'),
      ])
      const m = new Map((s.data || []).map((x) => [x.assignment_id, x]))
      setRows((a.data || []).map((t) => ({ ...t, done: m.get(t.id)?.score != null || m.get(t.id)?.status === 'submitted' })))
    })()
  }, [])

  const byDay = {}
  ;(rows || []).forEach((t) => { (byDay[key(t.due_at)] = byDay[key(t.due_at)] || []).push(t) })
  const lead = (cur.getDay() + 6) % 7
  const total = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  const today = key(new Date())
  const month = cur.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  const shift = (n) => setCur(new Date(cur.getFullYear(), cur.getMonth() + n, 1))
  const day = (sel && byDay[sel]) || []

  return (<>
    <h2>Kalender tenggat</h2>
    <div className="cal-head">
      <button className="cal-nav" aria-label="Bulan sebelumnya" onClick={() => shift(-1)}>‹</button>
      <b>{month}</b>
      <button className="cal-nav" aria-label="Bulan berikutnya" onClick={() => shift(1)}>›</button>
    </div>
    <div className="cal-grid">
      {DAYS.map((d) => <span className="cal-dow" key={d}>{d}</span>)}
      {cells.map((n, i) => {
        if (!n) return <span key={'e' + i} />
        const k = key(new Date(cur.getFullYear(), cur.getMonth(), n))
        const list = byDay[k] || []
        const pending = list.some((t) => !t.done)
        return (
          <button key={k} className={'cal-d' + (k === today ? ' today' : '') + (k === sel ? ' sel' : '')} onClick={() => setSel(k)}
            aria-label={`${n}, ${list.length} tugas`}>
            {n}
            {list.length > 0 && <i className={pending ? 'pending' : 'ok'} />}
          </button>
        )
      })}
    </div>
    <div className="sec-head" style={{ marginTop: 18 }}>
      <h3>{new Date(sel + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    </div>
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !day.length && <div className="empty-card">Tidak ada tenggat di hari ini.</div>}
    {day.length > 0 && (
      <div className="list">
        {day.sort((a, b) => a.due_at < b.due_at ? -1 : 1).map((t) => (
          <button className="item" key={t.id} onClick={() => onOpen(t.id)}>
            <span className="item-t"><b>{t.title}</b><small>{t.subjects?.name && t.subjects.name + ' · '}Sampai {hm(t.due_at)}</small></span>
            <span className={'chip ' + (t.done ? 'sent' : new Date(t.due_at) < new Date() ? 'late' : 'soon')}>
              {t.done ? 'Terkirim' : new Date(t.due_at) < new Date() ? 'Terlambat' : 'Belum'}
            </span>
          </button>
        ))}
      </div>
    )}
  </>)
}
