import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Subjects from './Subjects.jsx'

const TYPES = { photo: 'Foto', text: 'Teks', both: 'Foto dan teks' }
const fmt = (d) => d
  ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'Tanpa tenggat'

function stateOf(sub, due) {
  if (!sub) return { k: 'none', t: 'Belum' }
  if (sub.score != null) return { k: 'graded', t: 'Dinilai ' + sub.score }
  if (sub.status === 'submitted')
    return { k: 'sent', t: due && new Date(sub.submitted_at) > new Date(due) ? 'Dikirim terlambat' : 'Dikirim' }
  return { k: 'draft', t: 'Draf' }
}

function NewTask({ profile, onDone, onCancel }) {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [newSub, setNewSub] = useState('')
  const [f, setF] = useState({ title: '', instructions: '', due: '', type: 'photo', subject: '' })
  const [picked, setPicked] = useState([])
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('classes').select('id,name').order('name').then((r) => setClasses(r.data || []))
    supabase.from('subjects').select('id,name').order('name').then((r) => setSubjects(r.data || []))
  }, [])

  async function addSubject() {
    const name = newSub.replace(/\s+/g, ' ').trim()
    if (!name) return
    const ex = subjects.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (ex) { setF({ ...f, subject: ex.id }); setNewSub(''); return }
    const { data, error } = await supabase.from('subjects').insert({ name }).select('id,name').single()
    if (error) return setErr('Gagal menambah mapel: ' + error.message)
    setSubjects([...subjects, data].sort((a, b) => a.name.localeCompare(b.name)))
    setF({ ...f, subject: data.id }); setNewSub(''); setErr('')
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  async function save() {
    if (!f.title.trim()) return setErr('Judul tugas wajib diisi.')
    if (!f.subject) return setErr('Pilih mata pelajaran.')
    if (!picked.length) return setErr('Pilih minimal satu kelas tujuan.')
    setBusy(true); setErr('')
    try {
      const id = crypto.randomUUID()
      let attachment_path = null
      if (file) {
        const path = `${id}/${file.name.replace(/[^\w.-]/g, '_')}`
        const up = await supabase.storage.from('lampiran').upload(path, file)
        if (up.error) throw up.error
        attachment_path = path
      }
      const { error } = await supabase.from('assignments').insert({
        id, title: f.title.trim(), subject_id: f.subject, instructions: f.instructions.trim() || null,
        due_at: f.due ? new Date(f.due).toISOString() : null,
        answer_type: f.type, attachment_path, created_by: profile.id,
      })
      if (error) throw error
      const e2 = (await supabase.from('assignment_classes')
        .insert(picked.map((class_id) => ({ assignment_id: id, class_id })))).error
      if (e2) { await supabase.from('assignments').delete().eq('id', id); throw e2 }
      onDone()
    } catch (x) { setErr('Gagal menyimpan: ' + x.message) }
    setBusy(false)
  }

  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onCancel}>Kembali</button>
    <h2>Tugas baru</h2>
    <label htmlFor="t">Judul</label>
    <input id="t" value={f.title} onChange={set('title')} placeholder="Contoh: Latihan soal bab 3" />
    <label>Mata pelajaran</label>
    <div className="checks">
      {subjects.map((s) => (
        <button key={s.id} type="button" className={f.subject === s.id ? 'on' : ''} onClick={() => setF({ ...f, subject: s.id })}>{s.name}</button>
      ))}
      {!subjects.length && <span className="muted">Belum ada mapel. Tambahkan di bawah.</span>}
    </div>
    <input value={newSub} placeholder="Mapel baru, lalu tekan Tambah" onChange={(e) => setNewSub(e.target.value)} />
    <button type="button" className="btn ghost" onClick={addSubject}>Tambah mapel</button>
    <label htmlFor="i">Petunjuk (opsional)</label>
    <textarea id="i" rows="4" value={f.instructions} onChange={set('instructions')} />
    <label htmlFor="d">Tenggat (opsional)</label>
    <input id="d" type="datetime-local" value={f.due} onChange={set('due')} />
    <label>Jenis jawaban siswa</label>
    <div className="seg">
      {Object.entries(TYPES).map(([k, l]) => (
        <button key={k} type="button" className={f.type === k ? 'on' : ''} onClick={() => setF({ ...f, type: k })}>{l}</button>
      ))}
    </div>
    <label>Kelas tujuan</label>
    <div className="checks">
      {classes.map((c) => (
        <button key={c.id} type="button" className={picked.includes(c.id) ? 'on' : ''} onClick={() => toggle(c.id)}>{c.name}</button>
      ))}
      {!classes.length && <span className="muted">Belum ada kelas. Impor siswa dulu.</span>}
    </div>
    {classes.length > 1 && (
      <button className="link" style={{ marginTop: 0 }} onClick={() => setPicked(picked.length === classes.length ? [] : classes.map((c) => c.id))}>
        {picked.length === classes.length ? 'Kosongkan pilihan' : 'Pilih semua kelas'}
      </button>
    )}
    <label htmlFor="a" style={{ marginTop: 8 }}>Lampiran (opsional, maks 10 MB)</label>
    <input id="a" type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
    {err && <div className="err">{err}</div>}
    <button className="btn" onClick={save} disabled={busy}>{busy ? 'Menyimpan...' : 'Kirim tugas ke kelas'}</button>
  </>)
}

function Detail({ task, data, onBack, reload }) {
  const cls = task.assignment_classes.map((x) => ({ id: x.class_id, name: x.classes?.name }))
  const subs = new Map(data.subs.filter((s) => s.assignment_id === task.id).map((s) => [s.student_id, s]))
  async function toggleArchive() {
    await supabase.from('assignments').update({ status: task.status === 'active' ? 'archived' : 'active' }).eq('id', task.id)
    await reload(); onBack()
  }
  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>{task.title}</h2>
    <p className="muted">{task.subjects?.name && task.subjects.name + ' · '}Tenggat: {fmt(task.due_at)} · Jawaban: {TYPES[task.answer_type]}{task.status === 'archived' && ' · Diarsipkan'}</p>
    {task.instructions && <p>{task.instructions}</p>}
    {cls.map((c) => {
      const studs = data.studs.filter((s) => s.class_id === c.id)
      const done = studs.filter((s) => subs.get(s.id)?.status === 'submitted').length
      return (
        <div className="panel" key={c.id}>
          <h3>{c.name} <span className="muted">· {done} dari {studs.length} sudah kirim</span></h3>
          <div className="meter"><i style={{ width: (studs.length ? (done / studs.length) * 100 : 0) + '%' }} /></div>
          {studs.map((s) => {
            const st = stateOf(subs.get(s.id), task.due_at)
            return <div className="line" key={s.id}><span>{s.full_name}</span><span className={'chip ' + st.k}>{st.t}</span></div>
          })}
        </div>
      )
    })}
    <button className="btn ghost" onClick={toggleArchive}>{task.status === 'active' ? 'Arsipkan tugas' : 'Aktifkan kembali'}</button>
  </>)
}

export default function Tasks({ profile }) {
  const [view, setView] = useState('list')
  const [data, setData] = useState(null)
  const [subj, setSubj] = useState('')
  const [manage, setManage] = useState(false)

  async function load() {
    const [a, s, st] = await Promise.all([
      supabase.from('assignments')
        .select('id,title,instructions,due_at,answer_type,status,subject_id,subjects(name),assignment_classes(class_id,classes(name))')
        .order('created_at', { ascending: false }),
      supabase.from('submissions').select('assignment_id,student_id,status,score,submitted_at'),
      supabase.from('profiles').select('id,full_name,class_id').eq('role', 'student').eq('active', true).order('full_name'),
    ])
    setData({ tasks: a.data || [], subs: s.data || [], studs: st.data || [] })
  }
  useEffect(() => { load() }, [])

  if (view === 'new') return <NewTask profile={profile} onCancel={() => setView('list')} onDone={() => { load(); setView('list') }} />
  const open = data && typeof view === 'string' && view.startsWith('t:') ? data.tasks.find((t) => t.id === view.slice(2)) : null
  if (open) return <Detail task={open} data={data} reload={load} onBack={() => setView('list')} />

  return (<>
    <h2>Tugas</h2>
    <button className="btn" onClick={() => setView('new')}>Buat tugas baru</button>
    <button className="link" onClick={() => setManage(!manage)}>{manage ? 'Tutup kelola mapel' : 'Kelola mapel'}</button>
    {manage && <Subjects onChanged={load} />}
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
            <div className="muted">{t.subjects?.name && <b>{t.subjects.name} · </b>}{t.assignment_classes.map((x) => x.classes?.name).join(', ')} · {fmt(t.due_at)}</div>
          </div>
          <span className={'chip ' + (t.status === 'archived' ? '' : 'soon')}>
            {t.status === 'archived' ? 'Arsip' : `${sent}/${total}`}
          </span>
        </button>
      )
    })}
  </>)
}
