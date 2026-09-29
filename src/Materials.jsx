import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const MAX_MB = 10
const fmt = (d) => new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function MaterialForm({ profile, item, onDone, onCancel }) {
  const edit = !!item
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [f, setF] = useState({ title: item?.title || '', content: item?.content || '', subject: item?.subject_id || '' })
  const [picked, setPicked] = useState(item ? item.material_classes.map((x) => x.class_id) : [])
  const [file, setFile] = useState(null)
  const [dropFile, setDropFile] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('classes').select('id,name').order('name').then((r) => setClasses(r.data || []))
    supabase.from('subjects').select('id,name').order('name').then((r) => setSubjects(r.data || []))
  }, [])

  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  function choose(e) {
    const x = e.target.files[0]
    e.target.value = ''
    if (!x) return
    if (x.type !== 'application/pdf' && !/\.pdf$/i.test(x.name)) return setErr('File harus berformat PDF.')
    if (x.size > MAX_MB * 1024 * 1024) return setErr(`Ukuran PDF maksimal ${MAX_MB} MB.`)
    setErr(''); setFile(x); setDropFile(false)
  }

  async function save() {
    const title = f.title.trim(), content = f.content.trim()
    const keepOld = edit && item.file_path && !dropFile && !file
    if (!title) return setErr('Judul materi wajib diisi.')
    if (!picked.length) return setErr('Pilih minimal satu kelas tujuan.')
    if (!content && !file && !keepOld) return setErr('Isi materi dengan mengetik atau unggah file PDF.')
    setBusy(true); setErr('')
    let uploaded = null
    try {
      const id = edit ? item.id : crypto.randomUUID()
      const row = { title, content: content || null, subject_id: f.subject || null }
      if (file) {
        uploaded = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const up = await supabase.storage.from('materi').upload(uploaded, file, { contentType: 'application/pdf' })
        if (up.error) throw up.error
        row.file_path = uploaded; row.file_name = file.name
      } else if (edit && dropFile) { row.file_path = null; row.file_name = null }

      if (edit) {
        const u = await supabase.from('materials').update(row).eq('id', id)
        if (u.error) throw u.error
        const d = await supabase.from('material_classes').delete().eq('material_id', id)
        if (d.error) throw d.error
      } else {
        const i = await supabase.from('materials').insert({ id, ...row, created_by: profile.id })
        if (i.error) throw i.error
      }
      const c = await supabase.from('material_classes').insert(picked.map((class_id) => ({ material_id: id, class_id })))
      if (c.error) {
        if (!edit) await supabase.from('materials').delete().eq('id', id)
        throw c.error
      }
      if (edit && item.file_path && (file || dropFile)) await supabase.storage.from('materi').remove([item.file_path])
      onDone()
    } catch (x) {
      if (uploaded) await supabase.storage.from('materi').remove([uploaded])
      setErr('Gagal menyimpan: ' + (x.message || x))
      setBusy(false)
    }
  }

  return (<div className="form">
    <button className="back" onClick={onCancel}>Kembali</button>
    <label className="sr" htmlFor="mt">Judul materi</label>
    <input id="mt" className="title-in" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
      placeholder={edit ? 'Judul materi' : 'Judul materi baru'} />

    <section className="fsec">
      <h3>Mata pelajaran <span className="muted">opsional</span></h3>
      <div className="checks">
        {subjects.map((s) => (
          <button key={s.id} type="button" className={f.subject === s.id ? 'on' : ''}
            onClick={() => setF({ ...f, subject: f.subject === s.id ? '' : s.id })}>{s.name}</button>
        ))}
        {!subjects.length && <span className="muted">Belum ada mapel. Buat dulu di menu Pengaturan.</span>}
      </div>
    </section>

    <section className="fsec">
      <div className="fhead">
        <h3>Kelas tujuan</h3>
        {classes.length > 1 && (
          <button type="button" className="mini" onClick={() => setPicked(picked.length === classes.length ? [] : classes.map((c) => c.id))}>
            {picked.length === classes.length ? 'Kosongkan' : 'Pilih semua'}
          </button>
        )}
      </div>
      <div className="checks">
        {classes.map((c) => (
          <button key={c.id} type="button" className={picked.includes(c.id) ? 'on' : ''} onClick={() => toggle(c.id)}>{c.name}</button>
        ))}
        {!classes.length && <span className="muted">Belum ada kelas. Impor siswa dulu.</span>}
      </div>
    </section>

    <section className="fsec">
      <h3><label htmlFor="mc">Isi materi <span className="muted">ketik langsung</span></label></h3>
      <textarea id="mc" rows="8" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })}
        placeholder="Ketik materi untuk siswa di sini..." />
      <h3>File PDF <span className="muted">opsional, maks {MAX_MB} MB</span></h3>
      {edit && item.file_path && !dropFile && !file && (
        <div className="line"><span>{item.file_name || 'File PDF'}</span>
          <button type="button" className="link" style={{ marginTop: 0 }} onClick={() => setDropFile(true)}>Hapus file</button></div>
      )}
      <label className="drop" htmlFor="mf">{file ? file.name : edit && item.file_path && !dropFile ? 'Ganti file PDF' : 'Pilih file PDF'}</label>
      <input id="mf" type="file" accept="application/pdf,.pdf" hidden onChange={choose} />
    </section>

    {err && <div className="err" role="alert">{err}</div>}
    <div className="actions">
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : edit ? 'Simpan perubahan' : 'Bagikan ke kelas'}</button>
    </div>
  </div>)
}

export default function Materials({ profile }) {
  const [view, setView] = useState('list')
  const [rows, setRows] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [busyId, setBusyId] = useState('')

  async function load() {
    setLoadErr('')
    const { data, error } = await supabase.from('materials')
      .select('id,title,content,file_path,file_name,subject_id,created_at,subjects(name),material_classes(class_id,classes(name))')
      .order('created_at', { ascending: false })
    if (error) setLoadErr(error.message)
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  async function open(m) {
    const { data } = await supabase.storage.from('materi').createSignedUrl(m.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function remove(m) {
    if (!window.confirm(`Hapus materi "${m.title}"? Siswa tidak akan bisa melihatnya lagi.`)) return
    setBusyId(m.id)
    const { error } = await supabase.from('materials').delete().eq('id', m.id)
    if (error) setLoadErr('Gagal menghapus: ' + error.message)
    else if (m.file_path) await supabase.storage.from('materi').remove([m.file_path])
    setBusyId(''); load()
  }

  if (view === 'new') return <MaterialForm profile={profile} onCancel={() => setView('list')} onDone={() => { load(); setView('list') }} />
  const ed = typeof view === 'string' && view.startsWith('e:') ? (rows || []).find((m) => m.id === view.slice(2)) : null
  if (ed) return <MaterialForm profile={profile} item={ed} onCancel={() => setView('list')} onDone={() => { load(); setView('list') }} />

  return (<>
    <h2>Materi</h2>
    <button className="btn" onClick={() => setView('new')}>Bagikan materi baru</button>
    <div style={{ height: 14 }} />
    {loadErr && <div className="err" role="alert">{loadErr} <button className="link" onClick={load}>Coba lagi</button></div>}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !rows.length && !loadErr && <div className="empty">Belum ada materi. Klik Bagikan materi baru untuk memulai.</div>}
    {(rows || []).map((m) => (
      <div className="panel" key={m.id}>
        <h3>{m.title}</h3>
        <div className="muted">
          {m.subjects?.name && <b>{m.subjects.name} · </b>}
          {m.material_classes.map((x) => x.classes?.name).filter(Boolean).join(', ')} · {fmt(m.created_at)}
        </div>
        {m.content && <p style={{ whiteSpace: 'pre-wrap' }}>{m.content.length > 160 ? m.content.slice(0, 160) + '...' : m.content}</p>}
        {m.file_path && <p className="muted">PDF: {m.file_name || 'file'}</p>}
        <div className="line" style={{ borderBottom: 0, paddingBottom: 0 }}>
          <span>
            {m.file_path && <><button className="link" style={{ marginTop: 0 }} onClick={() => open(m)}>Buka PDF</button>{' '}</>}
            <button className="link" style={{ marginTop: 0 }} onClick={() => setView('e:' + m.id)}>Ubah</button>
          </span>
          <button className="link" style={{ marginTop: 0 }} disabled={busyId === m.id} onClick={() => remove(m)}>Hapus</button>
        </div>
      </div>
    ))}
  </>)
}
