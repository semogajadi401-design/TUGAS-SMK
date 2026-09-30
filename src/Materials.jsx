import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import './materi.css'

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
  const [stage, setStage] = useState('')

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
      const setFileCols = !!file || (edit && dropFile)
      let filePath = null, fileName = null
      if (file) {
        setStage(`Mengunggah PDF (${(file.size / 1048576).toFixed(1)} MB)...`)
        uploaded = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const up = await supabase.storage.from('materi').upload(uploaded, file, { contentType: 'application/pdf' })
        if (up.error) throw up.error
        filePath = uploaded; fileName = file.name
      }
      setStage('Menyimpan materi...')

      // Cara cepat: semua penulisan database dalam SATU permintaan (butuh supabase/simpan-materi.sql).
      const r = await supabase.rpc('save_material', {
        p_id: id, p_title: title, p_content: content || null, p_subject: f.subject || null,
        p_classes: picked, p_file_path: filePath, p_file_name: fileName, p_set_file: setFileCols,
      })
      if (r.error) {
        const missing = r.error.code === 'PGRST202' || /could not find the function|save_material/i.test(r.error.message || '')
        if (!missing) throw r.error
        await saveSlow(id, title, content, setFileCols, filePath, fileName) // cadangan bila SQL belum dijalankan
      }
      // Hapus file lama di latar belakang: guru tidak perlu menunggu.
      if (edit && item.file_path && setFileCols) supabase.storage.from('materi').remove([item.file_path]).catch(() => {})
      onDone()
    } catch (x) {
      if (uploaded) await supabase.storage.from('materi').remove([uploaded]).catch(() => {})
      setErr('Gagal menyimpan: ' + (x.message || x))
      setBusy(false); setStage('')
    }
  }

  // Cara lama (berurutan, lebih lambat). Dipakai hanya jika fungsi save_material belum ada.
  async function saveSlow(id, title, content, setFileCols, filePath, fileName) {
    const row = { title, content: content || null, subject_id: f.subject || null }
    if (setFileCols) { row.file_path = filePath; row.file_name = fileName }
    if (edit) {
      const [u, d] = await Promise.all([
        supabase.from('materials').update(row).eq('id', id),
        supabase.from('material_classes').delete().eq('material_id', id),
      ])
      if (u.error) throw u.error
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
      <button className="btn" onClick={save} disabled={busy}>{busy ? (stage || 'Menyimpan...') : edit ? 'Simpan perubahan' : 'Bagikan ke kelas'}</button>
    </div>
  </div>)
}

const PAGE = 20
const norm = (t) => String(t || '').toLowerCase()
const byName = (a, b) => a.localeCompare(b, 'id', { numeric: true })
const shortDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Materials({ profile }) {
  const [view, setView] = useState('list')
  const [rows, setRows] = useState(null)
  const [classes, setClasses] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [busyId, setBusyId] = useState('')
  // Pencarian & filter
  const [q, setQ] = useState('')
  const [fs, setFs] = useState('')      // mapel: id, atau '_none'
  const [fc, setFc] = useState('')      // kelas: id
  const [ft, setFt] = useState('')      // jenis: '', 'pdf', 'text'
  const [sort, setSort] = useState('new')
  const [group, setGroup] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  // Mode pilih (atur banyak materi sekaligus)
  const [sel, setSel] = useState(null)  // null = biasa, Set = mode pilih
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkCls, setBulkCls] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [note, setNote] = useState(null)

  async function load() {
    setLoadErr('')
    const { data, error } = await supabase.from('materials')
      .select('id,title,content,file_path,file_name,subject_id,created_at,subjects(name),material_classes(class_id,classes(name))')
      .order('created_at', { ascending: false })
    if (error) setLoadErr(error.message)
    setRows(data || [])
  }
  useEffect(() => {
    load()
    supabase.from('classes').select('id,name').then((r) => setClasses((r.data || []).sort((a, b) => byName(a.name, b.name))))
  }, [])
  useEffect(() => { setLimit(PAGE) }, [q, fs, fc, ft, sort, group])

  const subjects = useMemo(() => {
    const m = new Map()
    ;(rows || []).forEach((r) => { if (r.subject_id && r.subjects?.name) m.set(r.subject_id, r.subjects.name) })
    return [...m.entries()].sort((a, b) => byName(a[1], b[1]))
  }, [rows])
  const hasNoSubject = (rows || []).some((r) => !r.subject_id)

  const shown = useMemo(() => {
    const t = norm(q).trim()
    let l = (rows || []).filter((m) => {
      if (fs === '_none' ? m.subject_id : fs && m.subject_id !== fs) return false
      if (fc && !m.material_classes.some((x) => x.class_id === fc)) return false
      if (ft === 'pdf' && !m.file_path) return false
      if (ft === 'text' && m.file_path) return false
      if (!t) return true
      const hay = norm([m.title, m.content, m.file_name, m.subjects?.name, ...m.material_classes.map((x) => x.classes?.name)].join(' '))
      return t.split(/\s+/).every((w) => hay.includes(w))
    })
    if (sort === 'old') l = [...l].reverse()
    else if (sort === 'az') l = [...l].sort((a, b) => byName(a.title, b.title))
    return l
  }, [rows, q, fs, fc, ft, sort])

  const active = !!(q || fs || fc || ft)
  const resetFilter = () => { setQ(''); setFs(''); setFc(''); setFt('') }

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

  /* ---------- Atur banyak materi ---------- */
  const chosen = (rows || []).filter((m) => sel?.has(m.id))
  const toggleSel = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  const endSelect = () => { setSel(null); setBulkOpen(false); setBulkCls([]) }
  const pickBulkCls = (id) => setBulkCls(bulkCls.includes(id) ? bulkCls.filter((x) => x !== id) : [...bulkCls, id])

  async function bulk(kind) {
    setNote(null)
    if (!chosen.length) return setNote({ ok: false, t: 'Pilih materi dulu.' })
    if (kind !== 'delete' && !bulkCls.length) return setNote({ ok: false, t: 'Pilih kelas dulu.' })
    const ids = chosen.map((m) => m.id)
    setBulkBusy(true)
    try {
      if (kind === 'add') {
        const ins = []
        chosen.forEach((m) => {
          const have = new Set(m.material_classes.map((x) => x.class_id))
          bulkCls.forEach((c) => { if (!have.has(c)) ins.push({ material_id: m.id, class_id: c }) })
        })
        if (!ins.length) { setBulkBusy(false); return setNote({ ok: false, t: 'Semua materi terpilih sudah ada di kelas itu.' }) }
        const { error } = await supabase.from('material_classes').insert(ins)
        if (error) throw error
        setNote({ ok: true, t: `${chosen.length} materi ditambahkan ke ${bulkCls.length} kelas.` })
      } else if (kind === 'remove') {
        const empty = chosen.filter((m) => m.material_classes.every((x) => bulkCls.includes(x.class_id)))
        if (empty.length) {
          setBulkBusy(false)
          return setNote({ ok: false, t: `"${empty[0].title}"${empty.length > 1 ? ` dan ${empty.length - 1} lainnya` : ''} akan tidak punya kelas sama sekali. Kurangi pilihan kelas, atau hapus materinya.` })
        }
        const { error } = await supabase.from('material_classes').delete().in('material_id', ids).in('class_id', bulkCls)
        if (error) throw error
        setNote({ ok: true, t: `${chosen.length} materi dikeluarkan dari ${bulkCls.length} kelas.` })
      } else {
        if (!window.confirm(`Hapus ${chosen.length} materi terpilih? Siswa tidak akan bisa melihatnya lagi.`)) { setBulkBusy(false); return }
        const { error } = await supabase.from('materials').delete().in('id', ids)
        if (error) throw error
        const files = chosen.map((m) => m.file_path).filter(Boolean)
        if (files.length) await supabase.storage.from('materi').remove(files).catch(() => {})
        setNote({ ok: true, t: `${chosen.length} materi dihapus.` })
      }
      await load(); endSelect()
    } catch (x) { setNote({ ok: false, t: 'Gagal: ' + (x.message || x) }) }
    setBulkBusy(false)
  }

  if (view === 'new') return <MaterialForm profile={profile} onCancel={() => setView('list')} onDone={() => { load(); setView('list') }} />
  const ed = typeof view === 'string' && view.startsWith('e:') ? (rows || []).find((m) => m.id === view.slice(2)) : null
  if (ed) return <MaterialForm profile={profile} item={ed} onCancel={() => setView('list')} onDone={() => { load(); setView('list') }} />

  /* ---------- Kartu materi ---------- */
  function renderCard(m) {
    const names = m.material_classes.map((x) => ({ id: x.class_id, name: x.classes?.name })).filter((x) => x.name).sort((a, b) => byName(a.name, b.name))
    const all = classes.length > 1 && names.length >= classes.length
    const show = all ? [] : names.slice(0, 3)
    const isSel = !!sel?.has(m.id)
    return (
      <div key={m.id} className={'mcard' + (isSel ? ' sel' : '')} onClick={sel ? () => toggleSel(m.id) : undefined}>
        {sel && <input className="mchk" type="checkbox" checked={isSel} onChange={() => toggleSel(m.id)} aria-label={'Pilih ' + m.title} />}
        <div className="body">
          <h3>{m.title}</h3>
          <div className="mmeta">
            {m.subjects?.name && <button type="button" className="mchip subj" onClick={(e) => { e.stopPropagation(); setFs(m.subject_id) }}>{m.subjects.name}</button>}
            {all && <span className="mchip all">Semua kelas</span>}
            {show.map((c) => <button type="button" key={c.id} className="mchip" onClick={(e) => { e.stopPropagation(); setFc(c.id) }}>{c.name}</button>)}
            {!all && names.length > 3 && <span className="mchip more" title={names.slice(3).map((x) => x.name).join(', ')}>+{names.length - 3} kelas</span>}
            {m.file_path && <span className="mchip pdf">PDF</span>}
            <span className="mchip more">{shortDate(m.created_at)}</span>
          </div>
          {m.content && <p className="mprev">{m.content}</p>}
          {!sel && (
            <div className="mact">
              {m.file_path && <button className="link" style={{ marginTop: 0 }} onClick={() => open(m)}>Buka PDF</button>}
              <button className="link" style={{ marginTop: 0 }} onClick={() => setView('e:' + m.id)}>Ubah</button>
              <button className="link" style={{ marginTop: 0, marginLeft: 'auto' }} disabled={busyId === m.id} onClick={() => remove(m)}>Hapus</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const visible = shown.slice(0, limit)
  const groups = groupBy(visible, group)

  return (<>
    <h2>Materi</h2>
    <button className="btn" onClick={() => setView('new')}>Bagikan materi baru</button>
    <div style={{ height: 14 }} />
    {loadErr && <div className="err" role="alert">{loadErr} <button className="link" onClick={load}>Coba lagi</button></div>}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !rows.length && !loadErr && <div className="empty">Belum ada materi. Klik Bagikan materi baru untuk memulai.</div>}

    {rows && rows.length > 0 && (<>
      <div className="mtools">
        <div className="msearch">
          <label className="sr" htmlFor="mq">Cari materi</label>
          <input id="mq" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul, isi, mapel, atau kelas..." />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Hapus pencarian">×</button>}
        </div>
        <div className="mflt">
          <select value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Filter mata pelajaran">
            <option value="">Semua mapel</option>
            {subjects.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            {hasNoSubject && <option value="_none">Tanpa mapel</option>}
          </select>
          <select value={fc} onChange={(e) => setFc(e.target.value)} aria-label="Filter kelas">
            <option value="">Semua kelas</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={ft} onChange={(e) => setFt(e.target.value)} aria-label="Filter jenis">
            <option value="">Semua jenis</option>
            <option value="pdf">Ada file PDF</option>
            <option value="text">Teks saja</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Urutan">
            <option value="new">Terbaru dulu</option>
            <option value="old">Terlama dulu</option>
            <option value="az">Judul A-Z</option>
          </select>
        </div>
        <div className="mrow">
          <button type="button" className={'mtog' + (group ? ' on' : '')} onClick={() => setGroup(!group)}>Kelompokkan per mapel</button>
          <button type="button" className={'mtog' + (sel ? ' on' : '')} onClick={() => (sel ? endSelect() : setSel(new Set()))}>
            {sel ? 'Selesai memilih' : 'Pilih banyak'}
          </button>
        </div>
      </div>

      <div className="mbar" role="status">
        <span>{active ? `${shown.length} dari ${rows.length} materi` : `${rows.length} materi`}</span>
        {active && <button type="button" className="link" style={{ marginTop: 0 }} onClick={resetFilter}>Reset filter</button>}
      </div>

      {sel && (
        <div className="mbulk">
          <div className="mbulk-h">
            <b>{sel.size} dipilih</b>
            <span>
              <button type="button" className="link" style={{ marginTop: 0 }} onClick={() => setSel(new Set(shown.map((m) => m.id)))}>Pilih semua hasil ({shown.length})</button>
              {sel.size > 0 && <> <button type="button" className="link" style={{ marginTop: 0 }} onClick={() => setSel(new Set())}>Kosongkan</button></>}
            </span>
          </div>
          {sel.size > 0 && (<>
            <div className="mbulk-a">
              <button type="button" className="mbtn" onClick={() => setBulkOpen(!bulkOpen)}>{bulkOpen ? 'Tutup atur kelas' : 'Atur kelas'}</button>
              <button type="button" className="mbtn danger" disabled={bulkBusy} onClick={() => bulk('delete')}>Hapus</button>
            </div>
            {bulkOpen && (<>
              <div className="checks" style={{ marginTop: 10, marginBottom: 8 }}>
                {classes.map((c) => <button key={c.id} type="button" className={bulkCls.includes(c.id) ? 'on' : ''} onClick={() => pickBulkCls(c.id)}>{c.name}</button>)}
              </div>
              <div className="mbulk-a">
                <button type="button" className="mbtn solid" disabled={bulkBusy} onClick={() => bulk('add')}>Tambahkan ke kelas</button>
                <button type="button" className="mbtn" disabled={bulkBusy} onClick={() => bulk('remove')}>Keluarkan dari kelas</button>
              </div>
            </>)}
          </>)}
        </div>
      )}
      {note && <div className={note.ok ? 'ok' : 'err'} role="status" style={{ margin: '0 0 12px' }}>{note.t}</div>}

      {!shown.length && <div className="empty">Tidak ada materi yang cocok. <button type="button" className="link" onClick={resetFilter}>Reset filter</button></div>}
      {groups.map(([label, list]) => (
        <section key={label || 'all'}>
          {label != null && <div className="mgroup"><span>{label}</span><span>{list.length}</span></div>}
          {list.map((m) => renderCard(m))}
        </section>
      ))}
      {shown.length > limit && (
        <button type="button" className="btn ghost" onClick={() => setLimit(limit + PAGE)}>Tampilkan lebih banyak ({shown.length - limit} lagi)</button>
      )}
    </>)}
  </>)
}

// Kelompokkan per mapel.
function groupBy(list, on) {
  if (!on) return [[null, list]]
  const g = new Map()
  list.forEach((m) => { const k = m.subjects?.name || 'Tanpa mapel'; g.set(k, [...(g.get(k) || []), m]) })
  return [...g.entries()].sort(([a], [b]) => (a === 'Tanpa mapel') - (b === 'Tanpa mapel') || byName(a, b))
}
