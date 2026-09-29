import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from './supabase.js'

const when = (d) => d ? new Date(d).toLocaleString('id-ID',
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

/* ---------- Daftar tugas yang perlu dinilai ---------- */
function TaskList({ onOpen }) {
  const [rows, setRows] = useState(null)
  const [sj, setSj] = useState('')
  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at,status,answer_type,subjects(name)').order('created_at', { ascending: false }),
        supabase.from('submissions').select('assignment_id,status,score').eq('status', 'submitted'),
      ])
      const list = (a.data || []).map((t) => {
        const mine = (s.data || []).filter((x) => x.assignment_id === t.id)
        return { ...t, sent: mine.length, waiting: mine.filter((x) => x.score == null).length }
      })
      list.sort((x, y) => (y.waiting > 0) - (x.waiting > 0))
      setRows(list)
    })()
  }, [])
  const mapel = [...new Set((rows || []).map((t) => t.subjects?.name).filter(Boolean))].sort()
  return (<>
    <h2>Penilaian</h2>
    <p className="muted">Pilih tugas untuk melihat jawaban siswa dan memberi nilai. Nilai langsung terlihat oleh siswa setelah disimpan.</p>
    {mapel.length > 1 && (
      <select value={sj} onChange={(e) => setSj(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Semua mapel</option>
        {mapel.map((m) => <option key={m}>{m}</option>)}
      </select>
    )}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !rows.length && <div className="empty">Belum ada tugas.</div>}
    {rows && rows.filter((t) => !sj || t.subjects?.name === sj).map((t) => (
      <button className="taskcard" key={t.id} onClick={() => onOpen(t)}>
        <div><b>{t.title}</b><div className="muted">{t.subjects?.name && t.subjects.name + ' · '}{t.sent} siswa sudah kirim{t.status === 'archived' ? ' · Arsip' : ''}</div></div>
        <span className={'chip ' + (t.waiting ? 'soon' : 'graded')}>{t.waiting ? `${t.waiting} belum dinilai` : 'Selesai'}</span>
      </button>
    ))}
  </>)
}

/* ---------- Menilai satu siswa ---------- */
function GradeOne({ task, sub, pos, total, onSave, onPrev, onNext, onClose }) {
  const [photos, setPhotos] = useState([])
  const [score, setScore] = useState(sub.score ?? '')
  const [fb, setFb] = useState(sub.feedback || '')
  const [zoom, setZoom] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setScore(sub.score ?? ''); setFb(sub.feedback || ''); setErr(''); setPhotos([])
    ;(async () => {
      const { data: l } = await supabase.from('submission_photos').select('id,path').eq('submission_id', sub.id)
      if (l?.length) {
        const { data } = await supabase.storage.from('jawaban').createSignedUrls(l.map((p) => p.path), 3600)
        setPhotos((data || []).map((d) => d.signedUrl))
      }
    })()
  }, [sub.id])

  async function save(goNext) {
    const n = Number(score)
    if (score === '' || isNaN(n) || n < 0 || n > 100) return setErr('Isi nilai antara 0 sampai 100.')
    setBusy(true); setErr('')
    const feedback = fb.trim() || null
    const { error } = await supabase.from('submissions').update({ score: n, feedback }).eq('id', sub.id)
    setBusy(false)
    if (error) return setErr('Gagal menyimpan: ' + error.message)
    onSave({ ...sub, score: n, feedback }, goNext)
  }

  const late = task.due_at && sub.submitted_at && new Date(sub.submitted_at) > new Date(task.due_at)
  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onClose}>Kembali ke daftar</button>
    <div className="who">
      <div><h2 style={{ margin: 0 }}>{sub.profiles?.full_name}</h2>
        <span className="muted">{sub.profiles?.classes?.name} · dikirim {when(sub.submitted_at)}</span></div>
      <span className="chip">{pos + 1} / {total}</span>
    </div>
    {late && <div className="banner">Dikirim setelah tenggat.</div>}

    {task.answer_type !== 'text' && (<>
      <h3 className="sec">Foto jawaban</h3>
      {sub.photos_cleaned && <p className="muted">Foto sudah dibersihkan.</p>}
      {!sub.photos_cleaned && !photos.length && <p className="muted">Tidak ada foto.</p>}
      <div className="photos">
        {photos.map((u) => <div className="ph" key={u}><img src={u} alt="Foto jawaban" onClick={() => setZoom(u)} /></div>)}
      </div>
    </>)}
    {task.answer_type !== 'photo' && (<>
      <h3 className="sec">Jawaban teks</h3>
      <div className="instr">{sub.text_answer?.trim() || <span className="muted">Tidak ada teks.</span>}</div>
    </>)}

    <h3 className="sec">Nilai</h3>
    <label htmlFor="sc">Nilai (0-100)</label>
    <input id="sc" type="number" inputMode="decimal" min="0" max="100" step="any" value={score}
      onChange={(e) => setScore(e.target.value)} />
    <label htmlFor="fb">Komentar untuk siswa (opsional)</label>
    <textarea id="fb" rows="3" value={fb} onChange={(e) => setFb(e.target.value)} />
    {err && <div className="err">{err}</div>}
    <button className="btn" disabled={busy} onClick={() => save(true)}>
      {busy ? 'Menyimpan...' : pos + 1 < total ? 'Simpan & berikutnya' : 'Simpan'}
    </button>
    <div className="picks" style={{ marginTop: 10 }}>
      <button className="btn ghost" disabled={pos === 0} onClick={onPrev}>Sebelumnya</button>
      <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Simpan saja</button>
      <button className="btn ghost" disabled={pos + 1 >= total} onClick={onNext}>Lewati</button>
    </div>
    {zoom && (
      <div className="lightbox" onClick={() => setZoom('')}>
        <img src={zoom} alt="Foto diperbesar" />
        <button aria-label="Tutup" onClick={() => setZoom('')}>×</button>
      </div>
    )}
  </>)
}

/* ---------- Daftar siswa untuk satu tugas ---------- */
function ByTask({ task, onBack }) {
  const [subs, setSubs] = useState(null)
  const [f, setF] = useState('wait')
  const [cls, setCls] = useState('')
  const [idx, setIdx] = useState(null)
  const [queue, setQueue] = useState([])
  const [note, setNote] = useState('')

  async function load() {
    const { data } = await supabase.from('submissions')
      .select('id,student_id,text_answer,status,submitted_at,score,feedback,photos_cleaned,profiles(full_name,classes(name))')
      .eq('assignment_id', task.id).eq('status', 'submitted')
    setSubs((data || []).sort((a, b) =>
      (a.profiles?.classes?.name || '').localeCompare(b.profiles?.classes?.name || '') ||
      (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '')))
  }
  useEffect(() => { load() }, [])
  if (!subs) return <div className="empty">Memuat...</div>

  const classes = [...new Set(subs.map((s) => s.profiles?.classes?.name).filter(Boolean))]
  const shown = subs.filter((s) =>
    (!cls || s.profiles?.classes?.name === cls) &&
    (f === 'all' || (f === 'wait' ? s.score == null : s.score != null)))
  const byId = new Map(subs.map((s) => [s.id, s]))

  if (idx !== null) {
    const cur = byId.get(queue[idx])
    return <GradeOne key={cur.id} task={task} sub={cur} pos={idx} total={queue.length}
      onClose={() => setIdx(null)}
      onPrev={() => setIdx(idx - 1)} onNext={() => setIdx(idx + 1)}
      onSave={(upd, goNext) => {
        setSubs(subs.map((s) => (s.id === upd.id ? upd : s)))
        if (goNext) idx + 1 < queue.length ? setIdx(idx + 1) : setIdx(null)
      }} />
  }

  const cleanable = subs.filter((s) => s.score != null && !s.photos_cleaned)
  async function clean() {
    const ids = cleanable.map((s) => s.id)
    const { data } = await supabase.from('submission_photos').select('id,path').in('submission_id', ids)
    const n = (data || []).length
    if (!window.confirm(`${n} foto dari ${ids.length} siswa akan dihapus permanen. Nilai dan komentar tetap disimpan. Lanjutkan?`)) return
    const paths = (data || []).map((p) => p.path)
    for (let i = 0; i < paths.length; i += 100)
      await supabase.storage.from('jawaban').remove(paths.slice(i, i + 100))
    await supabase.from('submission_photos').delete().in('submission_id', ids)
    await supabase.from('submissions').update({ photos_cleaned: true }).in('id', ids)
    setNote(`${n} foto berhasil dibersihkan.`)
    load()
  }

  function exportXlsx() {
    const ws = XLSX.utils.aoa_to_sheet([['Nama', 'Kelas', 'Dikirim', 'Nilai', 'Komentar'],
      ...subs.map((s) => [s.profiles?.full_name, s.profiles?.classes?.name || '', when(s.submitted_at), s.score ?? '', s.feedback || ''])])
    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai')
    XLSX.writeFile(wb, 'nilai-' + task.title.replace(/[^\w-]+/g, '_') + '.xlsx')
  }

  const filters = [['wait', 'Belum dinilai'], ['done', 'Sudah dinilai'], ['all', 'Semua']]
  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>{task.title}</h2>
    {subs.length > 0 && <button className="btn ghost" style={{ marginBottom: 12 }} onClick={exportXlsx}>Ekspor nilai ke Excel</button>}
    <div className="seg">
      {filters.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
    </div>
    {classes.length > 1 && (
      <select value={cls} onChange={(e) => setCls(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Semua kelas</option>
        {classes.map((c) => <option key={c}>{c}</option>)}
      </select>
    )}
    {!shown.length && <div className="empty">{f === 'wait' ? 'Tidak ada jawaban yang menunggu dinilai.' : 'Tidak ada data.'}</div>}
    {shown.map((s) => (
      <button className="taskcard" key={s.id} onClick={() => { setQueue(shown.map((x) => x.id)); setIdx(shown.indexOf(s)) }}>
        <div><b>{s.profiles?.full_name}</b><div className="muted">{s.profiles?.classes?.name} · {when(s.submitted_at)}</div></div>
        <span className={'chip ' + (s.score != null ? 'graded' : 'sent')}>{s.score != null ? s.score : 'Nilai'}</span>
      </button>
    ))}
    {task.answer_type !== 'text' && cleanable.length > 0 && (
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Hemat penyimpanan</h3>
        <p className="muted">Foto dari {cleanable.length} siswa yang sudah dinilai bisa dihapus. Nilai dan komentar tetap aman.</p>
        <button className="btn ghost" onClick={clean}>Bersihkan foto tugas ini</button>
      </div>
    )}
    {note && <div className="ok">{note}</div>}
  </>)
}

export default function Grading() {
  const [sel, setSel] = useState(null)
  return sel ? <ByTask task={sel} onBack={() => setSel(null)} /> : <TaskList onOpen={setSel} />
}
