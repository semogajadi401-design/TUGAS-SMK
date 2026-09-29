import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function dueInfo(due) {
  if (!due) return { t: 'Tanpa tenggat', c: '' }
  if (new Date(due) < new Date()) return { t: 'Terlambat', c: 'late' }
  const n = Math.round((dayStart(due) - dayStart(new Date())) / 864e5)
  if (n === 0) return { t: 'Hari ini', c: 'soon' }
  if (n === 1) return { t: 'Besok', c: 'soon' }
  return { t: `${n} hari lagi`, c: '' }
}

function Ring({ pct }) {
  return (
    <svg viewBox="0 0 100 100" width="104" height="104" aria-hidden="true">
      <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="10" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--chalk)" strokeWidth="10"
        strokeLinecap="round" strokeDasharray={`${pct * 2.64} 264`} transform="rotate(-90 50 50)" />
      <text x="50" y="57" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff">{pct}%</text>
    </svg>
  )
}

export default function Home({ profile, goAccount }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at').eq('status', 'active'),
        supabase.from('submissions').select('assignment_id,status,score'),
      ])
      const sub = new Map((s.data || []).map((x) => [x.assignment_id, x]))
      setRows((a.data || []).map((t) => {
        const x = sub.get(t.id)
        const state = x?.score != null ? 'graded' : x?.status === 'submitted' ? 'sent' : 'todo'
        return { ...t, state, score: x?.score }
      }))
    })()
  }, [])

  const hour = new Date().getHours()
  const hello = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam'

  return (<>
    {!profile.password_changed && (
      <div className="banner">
        Password kamu masih kode awal. <button className="inline" onClick={goAccount}>Ganti sekarang</button> supaya akunmu aman.
      </div>
    )}
    {rows === null ? <div className="empty">Memuat...</div> : (() => {
      const total = rows.length
      const done = rows.filter((r) => r.state !== 'todo').length
      const todo = rows.filter((r) => r.state === 'todo').sort((a, b) => (a.due_at || '9') < (b.due_at || '9') ? -1 : 1)
      const graded = rows.filter((r) => r.state === 'graded')
      const avg = graded.length ? Math.round(graded.reduce((n, r) => n + Number(r.score), 0) / graded.length) : null
      const pct = total ? Math.round((done / total) * 100) : 0
      return (<>
        <div className="hero">
          <div>
            <small>{hello}</small>
            <h2>{profile.full_name.split(' ')[0]}</h2>
            <p>{total ? `${done} dari ${total} tugas selesai` : 'Belum ada tugas'}</p>
          </div>
          <Ring pct={pct} />
        </div>
        <div className="stats three">
          <div className="stat"><b>{todo.length}</b><span>Belum dikerjakan</span></div>
          <div className="stat"><b>{rows.filter((r) => r.state === 'sent').length}</b><span>Menunggu nilai</span></div>
          <div className="stat"><b>{avg ?? '-'}</b><span>Rata-rata nilai</span></div>
        </div>
        <h3 className="sec">Yang perlu dikerjakan</h3>
        {!todo.length && <div className="empty">{total ? 'Semua tugas sudah dikirim. Kerja bagus!' : 'Tugas dari guru akan muncul di sini.'}</div>}
        {todo.map((t) => {
          const di = dueInfo(t.due_at)
          return (
            <div className="task" key={t.id}>
              <div><b>{t.title}</b></div>
              <span className={'chip ' + di.c}>{di.t}</span>
            </div>
          )
        })}
      </>)
    })()}
  </>)
}
