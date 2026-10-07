import { useEffect, useState } from 'react'
import { callApi } from './util.js'
import { isNetError, reportNetFailure } from './lib/net.js'
import './pengumuman.css'

const fmt = (d) => new Date(d).toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const LONG = 280

function Item({ x }) {
  const [open, setOpen] = useState(false)
  const long = x.body.length > LONG
  return (
    <article className={'an-card' + (x.unread ? ' new' : '')}>
      <div className="an-top">
        <h3>{x.title}</h3>
        {x.unread && <span className="an-chip new">Baru</span>}
      </div>
      <div className="an-meta"><span className="an-chip soft">{x.author} · {fmt(x.at)}</span></div>
      <p className={'an-body' + (long && !open ? ' clamp' : '')}>{x.body}</p>
      {long && <button className="link" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>{open ? 'Ringkas' : 'Selengkapnya'}</button>}
    </article>
  )
}

// onSeen dipanggil setelah daftar tampil, supaya label "Baru" masih terlihat sebelum angka di menu dihapus.
export default function StudentAnnouncements({ onSeen }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    setErr('')
    try { setRows((await callApi('/api/announce', { action: 'list' })).items); onSeen?.() }
    catch (e) {
      if (isNetError(e)) { reportNetFailure(); setErr('Butuh internet untuk melihat pengumuman.') } else setErr(e.message)
      setRows((r) => r || [])
    }
  }
  useEffect(() => { load() }, [])

  return (<>
    <h2>Pengumuman</h2>
    {err && <div className="err" role="alert">{err} <button className="link" onClick={load}>Coba lagi</button></div>}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !rows.length && !err && <div className="empty">Belum ada pengumuman dari guru.</div>}
    {(rows || []).map((x) => <Item key={x.id} x={x} />)}
  </>)
}
