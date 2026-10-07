import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { dueInfo, fmtFull, isClosed, relative } from './deadline.js'

const TIP_KEY = 'tip-password-hidden'
const readTip = () => { try { return localStorage.getItem(TIP_KEY) === '1' } catch { return false } }
const saveTip = () => { try { localStorage.setItem(TIP_KEY, '1') } catch { /* abaikan */ } }
const SHOW = 5

export default function Home({ profile, goAccount, goTasks, onOpen }) {
  const [rows, setRows] = useState(null)
  const [tipHidden, setTipHidden] = useState(readTip)

  useEffect(() => {
    (async () => {
      const [a, s, e] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at,subjects(name)').eq('status', 'active'),
        supabase.from('submissions').select('assignment_id,status,score,updated_at,return_note'),
        supabase.from('task_extensions').select('assignment_id,due_at'), // perpanjangan dari guru
      ])
      const ext = new Map((e.data || []).map((x) => [x.assignment_id, x.due_at]))
      const sub = new Map((s.data || []).map((x) => [x.assignment_id, x]))
      setRows((a.data || []).map((t) => {
        const x = sub.get(t.id)
        const state = x?.score != null ? 'graded' : x?.status === 'submitted' ? 'sent' : 'todo'
        return { ...t, due: ext.get(t.id) || t.due_at, extended: ext.has(t.id), state, score: x?.score, at: x?.updated_at, revise: state === 'todo' && !!x?.return_note }
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
    const byDue = (a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1
    const pending = rows.filter((r) => r.state === 'todo')
    const open = pending.filter((r) => !isClosed(r.due)).sort(byDue)       // masih bisa dikerjakan
    const closed = pending.filter((r) => isClosed(r.due)).sort(byDue)      // tenggat lewat, terkunci
    const todo = [...open, ...closed]
    const back = open.filter((r) => r.revise)
    const fresh = open.filter((r) => !r.revise)
    const nearest = open.find((r) => r.due)
    let main = 'Belum ada tugas'
    if (total) {
      if (!todo.length) main = 'Semua tugas sudah terkirim'
      else if (back.length && fresh.length) main = `${back.length} tugas perlu diperbaiki dan ${fresh.length} perlu dikerjakan`
      else if (back.length) main = `${back.length} tugas dikembalikan guru untuk diperbaiki`
      else if (fresh.length) main = `${fresh.length} tugas perlu dikerjakan`
      else main = `Waktu mengerjakan ${closed.length} tugas sudah berakhir`
    }
    const waiting = rows.filter((r) => r.state === 'sent').length
    const graded = rows.filter((r) => r.state === 'graded')
    const avg = graded.length ? Math.round(graded.reduce((n, r) => n + Number(r.score), 0) / graded.length) : null
    const pct = total ? Math.round((done / total) * 100) : 0
    const recent = [...graded].sort((a, b) => (b.at || '') < (a.at || '') ? -1 : 1).slice(0, 3)

    return (<>
      <section className="sum" aria-label="Ringkasan tugas">
        <p className="sum-main">
          {main}
        </p>
        {total > 0 && (<>
          <div className="track" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
            <i style={{ width: pct + '%' }} />
          </div>
          <p className="sum-cap">{done} dari {total} tugas selesai</p>
        </>)}
        {nearest && (
          <p className="sum-due">
            {nearest.revise ? 'Perbaiki' : 'Kerjakan'} <b>{nearest.title}</b> sebelum <b>{fmtFull(nearest.due)}</b> ({relative(nearest.due)}){nearest.extended ? ' · diperpanjang guru' : ''}.
          </p>
        )}
        {closed.length > 0 && (
          <p className="sum-due">
            {open.length ? `${closed.length} tugas lain sudah ditutup karena tenggat lewat. ` : 'Kamu tidak bisa mengerjakannya lagi. '}
            Hubungi gurumu jika perlu tambahan waktu.
          </p>
        )}
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
            const closedNow = isClosed(t.due)
            const di = closedNow ? dueInfo(t.due) : t.revise ? { t: 'Perbaiki', c: 'late' } : dueInfo(t.due)
            const line = !t.due ? '' : closedNow ? `Berakhir ${fmtFull(t.due)}` : `${t.revise ? 'Perbaiki sebelum' : 'Batas'} ${fmtFull(t.due)}`
            return (
              <div className={'item row ' + di.c} key={t.id}>
                <div className="item-t item-link">
                  <b>{t.title}</b>
                  {t.subjects?.name && <small>{t.subjects.name}</small>}
                  {line && <small>{line}{t.extended && !closedNow ? ' (diperpanjang)' : ''}</small>}
                </div>
                <div className="item-side">
                  <span className={'chip ' + di.c}>{di.t}</span>
                  {closedNow ? (
                    <button className="lite-btn" onClick={() => onOpen?.(t.id)}>Lihat detail</button>
                  ) : (
                    <button className={'btn3d' + (t.revise ? ' fix' : '')} onClick={() => onOpen?.(t.id)}>
                      <span>{t.revise ? 'Perbaiki Sekarang' : 'Kerjakan Sekarang'}</span>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </button>
                  )}
                </div>
              </div>
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
        {(profile.kelas || profile.code) && (
          <small className="who">{[profile.kelas && `Kelas ${profile.kelas}`, profile.code && `Username: ${profile.code}`].filter(Boolean).join(' · ')}</small>
        )}
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
