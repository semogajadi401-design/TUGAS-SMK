import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const fmt = (d) => new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Daftar materi dari guru untuk kelas siswa (RLS membatasi ke kelas sendiri).
export default function StudentMaterials() {
  const [rows, setRows] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const [sj, setSj] = useState('')

  async function load() {
    setErr('')
    const { data, error } = await supabase.from('materials')
      .select('id,title,content,file_path,file_name,created_at,subjects(name)')
      .order('created_at', { ascending: false })
    if (error) setErr('Gagal memuat materi: ' + error.message)
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    setUrl('')
    const m = (rows || []).find((x) => x.id === openId)
    if (m?.file_path) {
      supabase.storage.from('materi').createSignedUrl(m.file_path, 3600).then(({ data }) => setUrl(data?.signedUrl || ''))
    }
  }, [openId, rows])

  const m = (rows || []).find((x) => x.id === openId)
  if (m) return (<>
    <button className="back" onClick={() => setOpenId(null)}>Kembali</button>
    <h2>{m.title}</h2>
    <div className="muted">{m.subjects?.name && <b>{m.subjects.name} · </b>}{fmt(m.created_at)}</div>
    {m.content && <div className="panel" style={{ marginTop: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.content}</div>}
    {m.file_path && (url
      ? <a className="btn ghost" style={{ display: 'block', textAlign: 'center', marginTop: 14, textDecoration: 'none' }}
          href={url} target="_blank" rel="noreferrer">Buka PDF{m.file_name ? `: ${m.file_name}` : ''}</a>
      : <p className="muted">Menyiapkan file...</p>)}
  </>)

  const mapel = [...new Set((rows || []).map((r) => r.subjects?.name).filter(Boolean))].sort()
  const shown = (rows || []).filter((r) => !sj || r.subjects?.name === sj)

  return (<>
    <h2>Materi</h2>
    {mapel.length > 1 && (
      <select value={sj} onChange={(e) => setSj(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Semua mapel</option>
        {mapel.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    )}
    {err && <div className="err" role="alert">{err} <button className="link" onClick={load}>Coba lagi</button></div>}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !shown.length && !err && <div className="empty">Belum ada materi dari guru.</div>}
    {shown.map((r) => (
      <button className="taskcard" key={r.id} onClick={() => setOpenId(r.id)}>
        <div>
          <b>{r.title}</b>
          <div className="muted">{r.subjects?.name && <b>{r.subjects.name} · </b>}{fmt(r.created_at)}</div>
        </div>
        {r.file_path && <span className="chip">PDF</span>}
      </button>
    ))}
  </>)
}
