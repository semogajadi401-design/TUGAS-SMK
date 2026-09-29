import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi, fetchAll, copyText, listText, toLocalInput, compress } from './util.js'
import GroupEditor from './GroupEditor.jsx'
import { useQuestionUrls, QuestionHead } from './Questions.jsx'

const TYPES = { photo: 'Foto', text: 'Teks', both: 'Foto dan teks' }
const fmt = (d) => d
  ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Tanpa tenggat'

function stateOf(sub, due) {
  if (!sub) return { k: 'none', t: 'Belum' }
  if (sub.score != null) return { k: 'graded', t: 'Dinilai ' + sub.score }
  if (sub.status === 'submitted')
    return { k: 'sent', t: due && new Date(sub.submitted_at) > new Date(due) ? 'Dikirim terlambat' : 'Dikirim' }
  if (sub.return_note) return { k: 'draft', t: 'Diminta perbaikan' }
  return { k: 'draft', t: 'Draf' }
}

function TaskForm({ profile, task, onDone, onCancel }) {
  const edit = !!task
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [f, setF] = useState(edit
    ? { title: task.title, instructions: task.instructions || '', due: toLocalInput(task.due_at), type: task.answer_type, subject: task.subject_id || '' }
    : { title: '', instructions: '', due: '', type: 'photo', subject: '' })
  const [group, setGroup] = useState(false)
  const [picked, setPicked] = useState(edit ? task.assignment_classes.map((x) => x.class_id) : [])
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const newQ = () => ({ id: crypto.randomUUID(), text: '', image_path: null, file: null, preview: '' })
  const [qs, setQs] = useState(() => (edit && task.questions?.length ? task.questions.map((q) => ({ ...q, file: null, preview: '' })) : [newQ()]))
  const oldUrls = useQuestionUrls(edit ? task.questions : [])

  useEffect(() => {
    supabase.from('classes').select('id,name').order('name').then((r) => setClasses(r.data || []))
    supabase.from('subjects').select('id,name').order('name').then((r) => setSubjects(r.data || []))
  }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setQ = (id, patch) => setQs(qs.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  const pickImg = (id, f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setErr('File soal harus berupa gambar.')
    setErr(''); setQ(id, { file: f, preview: URL.createObjectURL(f) })
  }
  const dropImg = (id) => setQ(id, { file: null, preview: '', image_path: null })
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  async function save() {
    if (!f.title.trim()) return setErr('Judul tugas wajib diisi.')
    if (!f.subject) return setErr('Pilih mata pelajaran.')
    if (!picked.length) return setErr('Pilih minimal satu kelas tujuan.')
    setBusy(true); setErr('')
    try {
      const id = edit ? task.id : crypto.randomUUID()
      let attachment_path = null
      if (file) {
        const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const up = await supabase.storage.from('lampiran').upload(path, file)
        if (up.error) throw up.error
        attachment_path = path
      }
      const questions = []
      for (const q of qs) {
        const text = q.text.trim()
        if (!text && !q.file && !q.image_path) continue
        let image_path = q.image_path || null
        if (q.file) {
          const blob = await compress(q.file, 1600, 0.8)
          image_path = `${id}/q-${q.id}-${Date.now()}.jpg`
          const up = await supabase.storage.from('lampiran').upload(image_path, blob, { contentType: 'image/jpeg' })
          if (up.error) throw up.error
        }
        questions.push({ id: q.id, text, image_path })
      }
      const due_at = f.due ? new Date(f.due).toISOString() : null
      if (edit) {
        await callApi('/api/task', { action: 'update', id, title: f.title, instructions: f.instructions, due_at,
          answer_type: f.type, subject_id: f.subject, class_ids: picked, attachment_path, questions })
        return onDone()
      }
      const { error } = await supabase.from('assignments').insert({
        id, title: f.title.trim(), subject_id: f.subject, instructions: f.instructions.trim() || null,
        due_at, answer_type: f.type, attachment_path, created_by: profile.id, is_group: group,
        questions: questions.length ? questions : null,
      })
      if (error) throw error
      const e2 = (await supabase.from('assignment_classes')
        .insert(picked.map((class_id) => ({ assignment_id: id, class_id })))).error
      if (e2) { await supabase.from('assignments').delete().eq('id', id); throw e2 }
      onDone(group ? id : null)
    } catch (x) { setErr('Gagal menyimpan: ' + x.message) }
    setBusy(false)
  }

  return (<div className="form">
    <button className="back" onClick={onCancel}>Kembali</button>
    <label className="sr" htmlFor="t">Judul tugas</label>
    <input id="t" className="title-in" value={f.title} onChange={set('title')} placeholder={edit ? 'Judul tugas' : 'Judul tugas baru'} />

    <section className="fsec">
      <h3>Mata pelajaran</h3>
      <div className="checks">
        {subjects.map((s) => (
          <button key={s.id} type="button" className={f.subject === s.id ? 'on' : ''} onClick={() => setF({ ...f, subject: s.id })}>{s.name}</button>
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
      <h3><label htmlFor="d">Tenggat</label></h3>
      <input id="d" type="datetime-local" value={f.due} onChange={set('due')} />
      <h3>Jawaban siswa</h3>
      <div className="seg">
        {Object.entries(TYPES).map(([k, l]) => (
          <button key={k} type="button" className={f.type === k ? 'on' : ''} onClick={() => setF({ ...f, type: k })}>{l}</button>
        ))}
      </div>
      {!edit ? (<>
        <h3>Cara mengerjakan</h3>
        <div className="seg">
          <button type="button" className={!group ? 'on' : ''} onClick={() => setGroup(false)}>Sendiri</button>
          <button type="button" className={group ? 'on' : ''} onClick={() => setGroup(true)}>Kelompok</button>
        </div>
        {group && <p className="muted">Kelompok diatur setelah tugas dibuat. Satu nilai berlaku untuk semua anggota.</p>}
      </>) : task.is_group && <p className="muted">Tugas kelompok. Atur kelompok dari halaman detail tugas.</p>}
    </section>

    <section className="fsec">
      <h3>Soal <span className="muted">opsional. Tiap soal punya kolom jawaban sendiri untuk siswa</span></h3>
      {qs.map((q, i) => {
        const img = q.preview || oldUrls[q.id]
        return (
          <div className="qbox" key={q.id}>
            <div className="qtop">
              <b>Soal {i + 1}</b>
              {qs.length > 1 && <button type="button" className="qdel" onClick={() => setQs(qs.filter((x) => x.id !== q.id))}>Hapus soal</button>}
            </div>
            <label className="sr" htmlFor={'q' + q.id}>Teks soal {i + 1}</label>
            <textarea id={'q' + q.id} rows="3" value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })}
              placeholder={i === 0 ? 'Tulis soal. Contoh: Ceritakan apa yang terjadi pada gambar di bawah.' : 'Tulis soal'} />
            {img && (
              <div className="qprev">
                <img src={img} alt={`Gambar soal ${i + 1}`} />
                <button type="button" aria-label="Hapus gambar" onClick={() => dropImg(q.id)}>×</button>
              </div>
            )}
            <label className="drop" htmlFor={'qi' + q.id}>{img ? 'Ganti gambar' : 'Tambah gambar (opsional)'}</label>
            <input id={'qi' + q.id} type="file" accept="image/*" hidden
              onChange={(e) => { pickImg(q.id, e.target.files[0]); e.target.value = '' }} />
          </div>
        )
      })}
      <button type="button" className="btn ghost" onClick={() => setQs([...qs, newQ()])}>+ Tambah soal</button>
    </section>

    <details className="fsec more" open={edit && !!(task.instructions || task.attachment_path)}>
      <summary>Petunjuk dan lampiran <span className="muted">opsional</span></summary>
      <label className="sr" htmlFor="i">Petunjuk</label>
      <textarea id="i" rows="4" value={f.instructions} onChange={set('instructions')} placeholder="Tulis petunjuk pengerjaan untuk siswa" />
      <label className="drop" htmlFor="a">{file ? file.name : edit && task.attachment_path ? 'Ganti lampiran' : 'Pilih file lampiran, maks 10 MB'}</label>
      <input id="a" type="file" hidden onChange={(e) => setFile(e.target.files[0] || null)} />
    </details>

    {err && <div className="err" role="alert">{err}</div>}
    <div className="actions">
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : edit ? 'Simpan perubahan' : 'Kirim ke kelas'}</button>
    </div>
  </div>)
}

function Detail({ task, data, onBack, onEdit, onGroups, reload }) {
  const [note, setNote] = useState('')
  const qurls = useQuestionUrls(task.questions)
  const cls = task.assignment_classes.map((x) => ({ id: x.class_id, name: x.classes?.name }))
  const subs = new Map(data.subs.filter((s) => s.assignment_id === task.id).map((s) => [s.student_id, s]))

  async function toggleArchive() {
    await supabase.from('assignments').update({ status: task.status === 'active' ? 'archived' : 'active' }).eq('id', task.id)
    await reload(); onBack()
  }
  async function remove() {
    if (!window.confirm(`Hapus tugas "${task.title}" beserta semua jawaban, foto, dan nilainya? Ini tidak bisa dibatalkan.`)) return
    try { await callApi('/api/task', { action: 'delete', id: task.id }); await reload(); onBack() }
    catch (e) { setNote('Gagal menghapus: ' + e.message) }
  }
  async function copyMissing(c, studs) {
    const names = studs.filter((s) => subs.get(s.id)?.status !== 'submitted').map((s) => s.full_name)
    if (!names.length) return setNote(`Semua siswa ${c.name} sudah mengirim.`)
    const ok = await copyText(listText(`Belum mengumpulkan "${task.title}" (${c.name}):`, names))
    setNote(ok ? `Daftar ${names.length} siswa ${c.name} disalin. Tinggal tempel di WhatsApp.` : 'Browser menolak menyalin. Salin manual dari daftar di bawah.')
  }

  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>{task.title}</h2>
    <p className="muted">{task.subjects?.name && task.subjects.name + ' · '}Tenggat: {fmt(task.due_at)} · Jawaban: {TYPES[task.answer_type]}{task.is_group && ' · Kelompok'}{task.status === 'archived' && ' · Diarsipkan'}</p>
    {task.instructions && <p>{task.instructions}</p>}
    {task.questions?.length > 0 && (
      <details className="panel">
        <summary><b>{task.questions.length} soal</b> <span className="muted">lihat</span></summary>
        {task.questions.map((q, i) => (
          <div className="qbox" key={q.id}><QuestionHead n={i + 1} q={q} url={qurls[q.id]} /></div>
        ))}
      </details>
    )}
    <div className="picks">
      <button className="btn ghost" onClick={onEdit}>Ubah tugas</button>
      {task.is_group && <button className="btn ghost" onClick={onGroups}>Atur kelompok</button>}
    </div>
    {note && <div className="ok" role="status">{note}</div>}
    {cls.map((c) => {
      const studs = data.studs.filter((s) => s.class_id === c.id)
      const done = studs.filter((s) => subs.get(s.id)?.status === 'submitted').length
      return (
        <div className="panel" key={c.id}>
          <h3>{c.name} <span className="muted">· {done} dari {studs.length} sudah kirim</span></h3>
          <div className="meter"><i style={{ width: (studs.length ? (done / studs.length) * 100 : 0) + '%' }} /></div>
          {done < studs.length && (
            <button className="link" style={{ marginTop: 6 }} onClick={() => copyMissing(c, studs)}>Salin daftar yang belum mengumpulkan</button>
          )}
          {studs.map((s) => {
            const st = stateOf(subs.get(s.id), task.due_at)
            return <div className="line" key={s.id}><span>{s.full_name}</span><span className={'chip ' + st.k}>{st.t}</span></div>
          })}
        </div>
      )
    })}
    <button className="btn ghost" onClick={toggleArchive}>{task.status === 'active' ? 'Arsipkan tugas' : 'Aktifkan kembali'}</button>
    <button className="link" style={{ color: 'var(--danger)' }} onClick={remove}>Hapus tugas</button>
  </>)
}

export default function Tasks({ profile }) {
  const [view, setView] = useState('list')
  const [data, setData] = useState(null)
  const [subj, setSubj] = useState('')

  const [loadErr, setLoadErr] = useState('')

  async function load() {
    setLoadErr('')
    try {
      const [a, subs, st] = await Promise.all([
        supabase.from('assignments')
          .select('id,title,instructions,due_at,answer_type,status,is_group,attachment_path,questions,subject_id,subjects(name),assignment_classes(class_id,classes(name))')
          .order('created_at', { ascending: false }),
        fetchAll(() => supabase.from('submissions').select('id,assignment_id,student_id,status,score,submitted_at,return_note').order('id')),
        supabase.from('profiles').select('id,full_name,class_id').eq('role', 'student').eq('active', true).order('full_name'),
      ])
      if (a.error) throw new Error('Tabel tugas: ' + a.error.message)
      if (st.error) throw new Error('Data siswa: ' + st.error.message)
      setData({ tasks: a.data || [], subs, studs: st.data || [] })
    } catch (e) {
      setLoadErr(e.message || String(e))
      setData({ tasks: [], subs: [], studs: [] })
    }
  }
  useEffect(() => { load() }, [])

  const find = (p) => data && typeof view === 'string' && view.startsWith(p) ? data.tasks.find((t) => t.id === view.slice(2)) : null
  if (view === 'new') return <TaskForm profile={profile} onCancel={() => setView('list')}
    onDone={async (gid) => { await load(); setView(gid ? 'g:' + gid : 'list') }} />
  const ed = find('e:')
  if (ed) return <TaskForm profile={profile} task={ed} onCancel={() => setView('t:' + ed.id)}
    onDone={async () => { await load(); setView('t:' + ed.id) }} />
  const gr = find('g:')
  if (gr) return <GroupEditor task={gr} onBack={() => setView('t:' + gr.id)} />
  const open = find('t:')
  if (open) return <Detail task={open} data={data} reload={load} onBack={() => setView('list')}
    onEdit={() => setView('e:' + open.id)} onGroups={() => setView('g:' + open.id)} />

  return (<>
    <h2>Tugas</h2>
    <button className="btn" onClick={() => setView('new')}>Buat tugas baru</button>
    <div style={{ height: 14 }} />
    {data && (() => {
      const opts = [...new Map(data.tasks.filter((t) => t.subjects).map((t) => [t.subject_id, t.subjects.name]))]
      return opts.length > 1 && (
        <select value={subj} onChange={(e) => setSubj(e.target.value)} style={{ marginBottom: 12 }}>
          <option value="">Semua mapel</option>
          {opts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      )
    })()}
    {loadErr && <div className="err" role="alert">Gagal memuat: {loadErr} <button className="link" onClick={load}>Coba lagi</button></div>}
    {data === null && <div className="empty">Memuat...</div>}
    {data && !data.tasks.length && <div className="empty">Belum ada tugas. Klik Buat tugas baru untuk memulai.</div>}
    {data && data.tasks.filter((t) => !subj || t.subject_id === subj).map((t) => {
      const ids = t.assignment_classes.map((x) => x.class_id)
      const total = data.studs.filter((s) => ids.includes(s.class_id)).length
      const sent = data.subs.filter((s) => s.assignment_id === t.id && s.status === 'submitted').length
      return (
        <button className="taskcard" key={t.id} onClick={() => setView('t:' + t.id)}>
          <div>
            <b>{t.title}</b>
            <div className="muted">{t.subjects?.name && <b>{t.subjects.name} · </b>}{t.assignment_classes.map((x) => x.classes?.name).join(', ')} · {fmt(t.due_at)}{t.is_group && ' · Kelompok'}</div>
          </div>
          <span className={'chip ' + (t.status === 'archived' ? '' : 'soon')}>
            {t.status === 'archived' ? 'Arsip' : `${sent}/${total}`}
          </span>
        </button>
      )
    })}
  </>)
}
