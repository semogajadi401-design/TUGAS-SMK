import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi } from './util.js'
import { toast } from './lib/toast.js'
import './pengumuman.css'

const byName = (a, b) => a.localeCompare(b, 'id', { numeric: true })
const fmt = (d) => new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Form({ item, classes, onDone, onCancel }) {
  const edit = !!item
  const [title, setTitle] = useState(item?.title || '')
  const [body, setBody] = useState(item?.body || '')
  const [all, setAll] = useState(item?.all || false)
  const [picked, setPicked] = useState(item?.class_ids || [])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  async function save() {
    if (!title.trim()) return setErr('Judul wajib diisi.')
    if (!body.trim()) return setErr('Isi pengumuman wajib diisi.')
    if (!all && !picked.length) return setErr('Pilih minimal satu kelas, atau pilih Semua kelas.')
    setBusy(true); setErr('')
    try {
      await callApi('/api/announce', { action: 'save', id: item?.id, title, body, all, class_ids: all ? [] : picked })
      toast({ kind: 'ok', text: edit ? 'Perubahan disimpan.' : 'Pengumuman dikirim ke siswa.', ms: 3000 })
      onDone()
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (<div className="form">
    <button className="back" onClick={onCancel}>Kembali</button>
    <label className="sr" htmlFor="an-t">Judul pengumuman</label>
    <input id="an-t" className="title-in" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
      placeholder={edit ? 'Judul pengumuman' : 'Judul pengumuman baru'} />

    <section className="fsec">
      <h3>Kelas tujuan</h3>
      <div className="checks">
        <button type="button" className={all ? 'on' : ''} aria-pressed={all} onClick={() => setAll(!all)}>Semua kelas</button>
        {classes.map((c) => (
          <button key={c.id} type="button" disabled={all} className={all || picked.includes(c.id) ? 'on' : ''}
            aria-pressed={all || picked.includes(c.id)} onClick={() => toggle(c.id)}>{c.name}</button>
        ))}
        {!classes.length && <span className="muted">Belum ada kelas. Impor siswa dulu.</span>}
      </div>
      <p className="muted an-hint">
        {all ? 'Dikirim ke semua kelas, termasuk kelas yang dibuat kemudian.'
          : picked.length ? `Dikirim ke ${picked.length} kelas.` : 'Pilih satu kelas, beberapa kelas, atau Semua kelas.'}
      </p>
    </section>

    <section className="fsec">
      <h3><label htmlFor="an-b">Isi pengumuman</label><span className="muted an-count">{body.length}/4000</span></h3>
      <textarea id="an-b" rows="8" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)}
        placeholder="Tulis pengumuman untuk siswa di sini..." />
    </section>

    {err && <div className="err" role="alert">{err}</div>}
    <div className="actions">
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : edit ? 'Simpan perubahan' : 'Kirim pengumuman'}</button>
    </div>
  </div>)
}

export default function Announcements() {
  const [rows, setRows] = useState(null)
  const [classes, setClasses] = useState([])
  const [view, setView] = useState('list') // 'list' | 'new' | id pengumuman yang diubah
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')

  async function load() {
    setErr('')
    try { setRows((await callApi('/api/announce', { action: 'list' })).items) }
    catch (e) { setErr(e.message); setRows((r) => r || []) }
  }
  useEffect(() => {
    load()
    supabase.from('classes').select('id,name').then((r) => setClasses((r.data || []).sort((a, b) => byName(a.name, b.name))))
  }, [])

  async function remove(x) {
    if (!window.confirm(`Hapus pengumuman "${x.title}"? Siswa tidak akan bisa melihatnya lagi.`)) return
    setBusyId(x.id)
    try { await callApi('/api/announce', { action: 'delete', id: x.id }); await load() }
    catch (e) { toast({ kind: 'warn', text: 'Gagal menghapus: ' + e.message }) }
    setBusyId('')
  }

  const done = () => { load(); setView('list') }
  if (view === 'new') return <Form classes={classes} onCancel={() => setView('list')} onDone={done} />
  const ed = view !== 'list' ? (rows || []).find((x) => x.id === view) : null
  if (ed) return <Form item={ed} classes={classes} onCancel={() => setView('list')} onDone={done} />

  return (<>
    <h2>Pengumuman</h2>
    <button className="btn" onClick={() => setView('new')}>Buat pengumuman baru</button>
    <div style={{ height: 14 }} />
    {err && <div className="err" role="alert">{err} <button className="link" onClick={load}>Coba lagi</button></div>}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !rows.length && !err && <div className="empty">Belum ada pengumuman. Klik Buat pengumuman baru untuk memulai.</div>}
    {(rows || []).map((x) => {
      const everyone = x.all || (classes.length > 1 && x.class_ids.length >= classes.length)
      return (
        <article className="an-card" key={x.id}>
          <h3>{x.title}</h3>
          <div className="an-meta">
            {everyone ? <span className="an-chip all">Semua kelas</span>
              : x.class_names.map((n) => <span className="an-chip" key={n}>{n}</span>)}
            <span className="an-chip soft">{fmt(x.at)}{x.edited ? ' · diubah' : ''}</span>
          </div>
          <p className="an-body clamp">{x.body}</p>
          <div className="an-act">
            <button className="link" onClick={() => setView(x.id)}>Ubah</button>
            <button className="link del" disabled={busyId === x.id} onClick={() => remove(x)}>Hapus</button>
          </div>
        </article>
      )
    })}
  </>)
}
