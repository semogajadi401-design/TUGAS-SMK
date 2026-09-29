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

const TIP_KEY = 'tip-password-hidden'
const readTip = () => { try { return localStorage.getItem(TIP_KEY) === '1' } catch { return false } }
const saveTip = () => { try { localStorage.setItem(TIP_KEY, '1') } catch { /* abaikan */ } }
const SHOW = 5

export default function Home({ profile, goAccount, goTasks, onOpen }) {
  const [rows, setRows] = useState(null)
  const [tipHidden, setTipHidden] = useState(readTip)

  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at,subjects(name)').eq('status', 'active'),
        supabase.from('submissions').select('assignment_id,status,score,updated_at,return_note'),
      ])
      const sub = new Map((s.data || []).map((x) => [x.assignment_id, x]))
      setRows((a.data || []).map((t) => {
        const x = sub.get(t.id)
        const state = x?.score != null ? 'graded' : x?.status === 'submitted' ? 'sent' : 'todo'
        return { ...t, state, score: x?.score, at: x?.updated_at, revise: state === 'todo' && !!x?.return_note }
      }))
    })()
  }, [])

  const hour = new Date().getHours()
  const hello = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam'
  const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
  const first = profile.full_name.split(' ')[0]
  const showTip = !profile.password_changed && !tipHidden

  const body = () => {
    if (rows === null) return <div className="empty">Memuat...</div>
    const total = rows.length
    const done = rows.filter((r) => r.state !== 'todo').length
    const todo = rows.filter((r) => r.state === 'todo').sort((a, b) => (a.due_at || '9') < (b.due_at || '9') ? -1 : 1)
    const waiting = rows.filter((r) => r.state === 'sent').length
    const graded = rows.filter((r) => r.state === 'graded')
    const avg = graded.length ? Math.round(graded.reduce((n, r) => n + Number(r.score), 0) / graded.length) : null
    const pct = total ? Math.round((done / total) * 100) : 0
    const recent = [...graded].sort((a, b) => (b.at || '') < (a.at || '') ? -1 : 1).slice(0, 3)

    return (<>
      <section className="sum" aria-label="Ringkasan tugas">
        <p className="sum-main">
          {!total ? 'Belum ada tugas' : todo.length ? `${todo.length} tugas perlu dikerjakan` : 'Semua tugas sudah terkirim'}
        </p>
        {total > 0 && (<>
          <div className="track" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
            <i style={{ width: pct + '%' }} />
          </div>
          <p className="sum-cap">{done} dari {total} tugas selesai</p>
        </>)}
        {(waiting > 0 || avg !== null) && (
          <dl className="facts">
            {waiting > 0 && <div><dt>Menunggu nilai</dt><dd>{waiting}</dd></div>}
            {avg !== null && <div><dt>Rata-rata nilai</dt><dd>{avg}</dd></div>}
          </dl>
        )}
      </section>

      <div className="sec-head"><h3>Perlu dikerjakan</h3></div>
      {!todo.length ? (
        <div className="empty-card">{total ? 'Tidak ada tugas yang tertunda. Kerja bagus!' : 'Tugas dari guru akan muncul di sini.'}</div>
      ) : (
        <div className="list">
          {todo.slice(0, SHOW).map((t) => {
            const di = t.revise ? { t: 'Perbaiki', c: 'late' } : dueInfo(t.due_at)
            return (
              <button className={'item ' + di.c} key={t.id} onClick={() => onOpen?.(t.id)}>
                <span className="item-t">
                  <b>{t.title}</b>
                  {t.subjects?.name && <small>{t.subjects.name}</small>}
                </span>
                <span className={'chip ' + di.c}>{di.t}</span>
              </button>
            )
          })}
          {todo.length > SHOW && (
            <button className="item more" onClick={goTasks}>Lihat semua {todo.length} tugas</button>
          )}
        </div>
      )}

      {recent.length > 0 && (<>
        <div className="sec-head"><h3>Nilai terbaru</h3></div>
        <div className="list">
          {recent.map((t) => (
            <div className="item static" key={t.id}>
              <span className="item-t">
                <b>{t.title}</b>
                {t.subjects?.name && <small>{t.subjects.name}</small>}
              </span>
              <span className="score">{t.score}</span>
            </div>
          ))}
        </div>
      </>)}
    </>)
  }

  return (
    <div className="home">
      <header className="hi">
        <small>{today}</small>
        <h2>{hello}, {first}</h2>
      </header>
      {showTip && (
        <div className="tip">
          <span>Password kamu masih kode awal. Mau diganti?</span>
          <span className="tip-a">
            <button className="inline" onClick={goAccount}>Ganti</button>
            <button className="inline soft" onClick={() => { saveTip(); setTipHidden(true) }}>Nanti saja</button>
          </span>
        </div>
      )}
      {body()}
    </div>
  )
}
