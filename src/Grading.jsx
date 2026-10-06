import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi, fetchAll, loadXlsx, copyText, listText } from './util.js'
import { useQuestionUrls, QuestionHead } from './Questions.jsx'

const QUICK = [50, 60, 70, 80, 90, 100]
const TEMPLATES = ['Bagus sekali', 'Sudah baik', 'Perlu diperbaiki', 'Jawaban kurang lengkap', 'Foto kurang jelas, mohon kirim ulang', 'Kerjakan sesuai petunjuk']

const when = (d) => d ? new Date(d).toLocaleString('id-ID',
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

/* ---------- Daftar tugas yang perlu dinilai ---------- */
function TaskList({ onOpen }) {
  const [rows, setRows] = useState(null)
  const [sj, setSj] = useState('')
  useEffect(() => {
    (async () => {
      const [a, s, st] = await Promise.all([
        supabase.from('assignments')
          .select('id,title,due_at,status,answer_type,questions,is_group,subjects(name),assignment_classes(class_id,classes(name))')
          .order('created_at', { ascending: false }),
        fetchAll(() => supabase.from('submissions').select('id,assignment_id,score').eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('profiles').select('id,class_id').eq('role', 'student').eq('active', true).order('id')),
      ])
      const perClass = new Map()
      for (const p of st) perClass.set(p.class_id, (perClass.get(p.class_id) || 0) + 1)
      const cnt = new Map()
      for (const x of s) {
        const c = cnt.get(x.assignment_id) || { sent: 0, waiting: 0 }
        c.sent++; if (x.score == null) c.waiting++
        cnt.set(x.assignment_id, c)
      }
      const list = (a.data || []).map((t) => ({
        ...t,
        ...(cnt.get(t.id) || { sent: 0, waiting: 0 }),
        total: (t.assignment_classes || []).reduce((n, c) => n + (perClass.get(c.class_id) || 0), 0),
      }))
      list.sort((x, y) => (y.waiting > 0) - (x.waiting > 0))
      setRows(list)
    })()
  }, [])
  const mapel = [...new Set((rows || []).map((t) => t.subjects?.name).filter(Boolean))].sort()
  const visible = (rows || []).filter((t) => !sj || t.subjects?.name === sj)
  const aktif = visible.filter((t) => t.status !== 'archived')
  const arsip = visible.filter((t) => t.status === 'archived')

  const card = (t) => {
    const pct = t.total ? Math.min(100, Math.round((t.sent / t.total) * 100)) : 0
    const chip = t.waiting
      ? ['soon', `${t.waiting} belum dinilai`]
      : t.sent ? ['graded', 'Semua dinilai'] : ['miss', 'Belum ada yang kirim']
    return (
      <button className="taskcard" key={t.id} onClick={() => onOpen(t)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{t.title}</b>
          <div className="muted">{t.subjects?.name && t.subjects.name + ' · '}{t.sent}{t.total ? ` dari ${t.total}` : ''} siswa sudah kirim</div>
          <div className="meter slim"><i style={{ width: pct + '%' }} /></div>
        </div>
        <span className={'chip ' + chip[0]}>{chip[1]}</span>
      </button>
    )
  }

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
    {aktif.map(card)}
    {arsip.length > 0 && <h3 className="sec">Arsip</h3>}
    {arsip.map(card)}
  </>)
}

/* ---------- Menilai satu siswa ---------- */
function GradeOne({ task, sub, ids, label, members, pos, total, onSave, onReturned, onPrev, onNext, onClose }) {
  const [photos, setPhotos] = useState([])
  const [score, setScore] = useState(sub.score ?? '')
  const [fb, setFb] = useState(sub.feedback || '')
  const [zoom, setZoom] = useState('')
  const qurls = useQuestionUrls(task.questions)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setScore(sub.score ?? ''); setFb(sub.feedback || ''); setErr(''); setPhotos([])
    ;(async () => {
      const { data: l } = await supabase.from('submission_photos').select('id,path,question_id').eq('submission_id', sub.id)
      if (l?.length) {
        const { data } = await supabase.storage.from('jawaban').createSignedUrls(l.map((p) => p.path), 3600)
        setPhotos(l.map((p, i) => ({ url: data?.[i]?.signedUrl, q: p.question_id || null })).filter((p) => p.url))
      }
    })()
  }, [sub.id])

  async function save(goNext) {
    const n = Number(score)
    if (score === '' || isNaN(n) || n < 0 || n > 100) return setErr('Isi nilai antara 0 sampai 100.')
    setBusy(true); setErr('')
    const feedback = fb.trim() || null
    const { error } = await supabase.from('submissions').update({ score: n, feedback }).in('id', ids || [sub.id])
    setBusy(false)
    if (error) return setErr('Gagal menyimpan: ' + error.message)
    onSave({ ...sub, score: n, feedback }, goNext, ids || [sub.id])
  }

  async function sendBack() {
    if (!fb.trim()) return setErr('Tulis alasan perbaikan di kolom komentar dulu.')
    if (!window.confirm('Kembalikan jawaban ini ke siswa untuk diperbaiki? Nilainya (jika ada) dikosongkan.')) return
    setBusy(true); setErr('')
    const list = ids || [sub.id]
    const { error } = await supabase.from('submissions')
      .update({ status: 'draft', return_note: fb.trim(), score: null, feedback: null }).in('id', list)
    setBusy(false)
    if (error) return setErr('Gagal mengembalikan: ' + error.message)
    onReturned(list)
  }

  const late = task.due_at && sub.submitted_at && new Date(sub.submitted_at) > new Date(task.due_at)
  const isLast = pos + 1 >= total
  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onClose}>Kembali ke daftar</button>

    <div className="gnav">
      <button className="btn ghost" disabled={pos === 0 || busy} onClick={onPrev}>‹ Sebelumnya</button>
      <span className="chip">{pos + 1} dari {total}</span>
      <button className="btn ghost" disabled={isLast || busy} onClick={onNext}>Lewati ›</button>
    </div>

    <div className="who">
      <div>
        <h2 style={{ margin: 0 }}>{label || sub.profiles?.full_name}</h2>
        <span className="muted">{sub.profiles?.classes?.name} · dikirim {when(sub.submitted_at)}</span>
        {members?.length > 1 && <div className="muted">Nilai berlaku untuk {members.length} anggota: {members.join(', ')}</div>}
      </div>
      {sub.score != null
        ? <span className="chip graded">Sudah dinilai: {sub.score}</span>
        : <span className="chip soon">Belum dinilai</span>}
    </div>
    {late && <div className="banner">Dikirim setelah tenggat.</div>}

    {task.questions?.length ? task.questions.map((q, i) => {
      const mine = photos.filter((p) => p.q === q.id)
      const txt = (sub.answers?.[q.id] || '').trim()
      return (
        <div className="qcard" key={q.id}>
          <QuestionHead n={i + 1} q={q} url={qurls[q.id]} onZoom={setZoom} />
          <div className="qlabel">Jawaban siswa</div>
          {task.answer_type !== 'text' && (<>
            {sub.photos_cleaned && !mine.length && <p className="muted">Foto sudah dibersihkan.</p>}
            <div className="photos">
              {mine.map((p) => <div className="ph" key={p.url}><img src={p.url} alt="Foto jawaban" loading="lazy" decoding="async" onClick={() => setZoom(p.url)} /></div>)}
            </div>
          </>)}
          {task.answer_type !== 'photo' && <div className="instr">{txt || <span className="muted">Tidak ada jawaban teks.</span>}</div>}
          {task.answer_type === 'photo' && !mine.length && !sub.photos_cleaned && <p className="muted">Tidak ada foto.</p>}
        </div>
      )
    }) : (<>
      {task.answer_type !== 'text' && (<>
        <h3 className="sec">Foto jawaban</h3>
        {sub.photos_cleaned && <p className="muted">Foto sudah dibersihkan.</p>}
        {!sub.photos_cleaned && !photos.length && <p className="muted">Tidak ada foto.</p>}
        <div className="photos">
          {photos.map((p) => <div className="ph" key={p.url}><img src={p.url} alt="Foto jawaban" loading="lazy" decoding="async" onClick={() => setZoom(p.url)} /></div>)}
        </div>
      </>)}
      {task.answer_type !== 'photo' && (<>
        <h3 className="sec">Jawaban teks</h3>
        <div className="instr">{sub.text_answer?.trim() || <span className="muted">Tidak ada teks.</span>}</div>
      </>)}
    </>)}

    <h3 className="sec">Nilai</h3>
    <label htmlFor="sc">Nilai (0-100)</label>
    <input id="sc" type="number" inputMode="decimal" min="0" max="100" step="any" value={score}
      onChange={(e) => setScore(e.target.value)} />
    <div className="checks">
      {QUICK.map((v) => <button key={v} type="button" className={String(score) === String(v) ? 'on' : ''} onClick={() => setScore(String(v))}>{v}</button>)}
    </div>
    <label htmlFor="fb">Komentar untuk siswa (opsional)</label>
    <textarea id="fb" rows="3" value={fb} onChange={(e) => setFb(e.target.value)} />
    <div className="checks">
      {TEMPLATES.map((t) => <button key={t} type="button" onClick={() => setFb(fb.trim() ? fb.trim().replace(/[.]*$/, '') + '. ' + t : t)}>{t}</button>)}
    </div>
    {err && <div className="err">{err}</div>}
    <button className="btn" disabled={busy} onClick={() => save(true)}>
      {busy ? 'Menyimpan...' : isLast ? 'Simpan & selesai' : 'Simpan & berikutnya'}
    </button>
    <button className="btn ghost" style={{ marginTop: 10 }} disabled={busy} onClick={() => save(false)}>Simpan, tetap di sini</button>
    <button className="link" disabled={busy} onClick={sendBack}>Minta siswa memperbaiki (kembalikan jawaban)</button>
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
  const [studs, setStuds] = useState([])
  const [f, setF] = useState('wait')
  const [cls, setCls] = useState('')
  const [idx, setIdx] = useState(null)
  const [queue, setQueue] = useState([])
  const [note, setNote] = useState('')
  const [g, setG] = useState({})

  const cids = (task.assignment_classes || []).map((x) => x.class_id)

  async function load(first) {
    const [sb, st] = await Promise.all([
      supabase.from('submissions')
        .select('id,student_id,text_answer,answers,status,submitted_at,score,feedback,photos_cleaned,profiles(full_name,classes(name))')
        .eq('assignment_id', task.id).eq('status', 'submitted'),
      cids.length
        ? fetchAll(() => supabase.from('profiles').select('id,full_name,class_id,classes(name)')
          .eq('role', 'student').eq('active', true).in('class_id', cids).order('id'))
        : Promise.resolve([]),
    ])
    const list = (sb.data || []).sort((a, b) =>
      (a.profiles?.classes?.name || '').localeCompare(b.profiles?.classes?.name || '') ||
      (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || ''))
    setSubs(list)
    setStuds(st)
    if (first) setF(list.some((s) => s.score == null) ? 'wait' : list.length ? 'done' : 'miss')
  }
  useEffect(() => {
    load(true)
    if (task.is_group) callApi('/api/group', { action: 'list', assignment_id: task.id }).then((j) => {
      const m = {}; (j.groups || []).forEach((gr) => gr.members.forEach((id) => { m[id] = gr })); setG(m)
    }).catch(() => {})
  }, [])
  if (!subs) return <div className="empty">Memuat...</div>

  // Tugas kelompok: tampilkan satu baris per kelompok (jawaban ketua), nilai berlaku untuk semua anggota.
  const rep = (s) => !task.is_group || !g[s.student_id] || g[s.student_id].leader_id === s.student_id
  const idsOf = (s) => g[s.student_id] && task.is_group
    ? subs.filter((x) => g[s.student_id].members.includes(x.student_id)).map((x) => x.id) : [s.id]
  const nameOf = (s) => (task.is_group && g[s.student_id] ? g[s.student_id].name : s.profiles?.full_name)
  const membersOf = (s) => task.is_group && g[s.student_id]
    ? subs.filter((x) => g[s.student_id].members.includes(x.student_id)).map((x) => x.profiles?.full_name).filter(Boolean) : []

  const sentIds = new Set(subs.map((s) => s.student_id))
  const hasSent = (st) => sentIds.has(st.id) ||
    (task.is_group && g[st.id] && g[st.id].members.some((m) => sentIds.has(m)))
  const missing = studs.filter((st) => !hasSent(st))
    .sort((a, b) => (a.classes?.name || '').localeCompare(b.classes?.name || '') || (a.full_name || '').localeCompare(b.full_name || ''))

  const reps = subs.filter(rep)
  const nWait = reps.filter((s) => s.score == null).length
  const nDone = reps.length - nWait
  const unit = task.is_group ? 'kelompok' : 'siswa'
  const totalUnits = task.is_group ? null : studs.length
  const pct = totalUnits ? Math.min(100, Math.round((reps.length / totalUnits) * 100)) : 0

  const classes = [...new Set([...subs.map((s) => s.profiles?.classes?.name), ...missing.map((s) => s.classes?.name)].filter(Boolean))].sort()
  const inCls = (name) => !cls || name === cls
  const shown = reps.filter((s) => inCls(s.profiles?.classes?.name) &&
    (f === 'wait' ? s.score == null : s.score != null))
  const shownMissing = missing.filter((s) => inCls(s.classes?.name))
  const byId = new Map(subs.map((s) => [s.id, s]))

  if (idx !== null) {
    const cur = byId.get(queue[idx])
    return <GradeOne key={cur.id} task={task} sub={cur} ids={idsOf(cur)}
      label={task.is_group && g[cur.student_id] ? nameOf(cur) : undefined}
      members={membersOf(cur)}
      pos={idx} total={queue.length}
      onClose={() => setIdx(null)}
      onPrev={() => setIdx(idx - 1)} onNext={() => setIdx(idx + 1)}
      onReturned={(list) => { setSubs(subs.filter((s) => !list.includes(s.id))); setIdx(null); setNote('Jawaban dikembalikan ke siswa untuk diperbaiki.') }}
      onSave={(upd, goNext, list) => {
        setSubs(subs.map((s) => (list.includes(s.id) ? { ...s, score: upd.score, feedback: upd.feedback } : s)))
        if (goNext && idx + 1 < queue.length) setIdx(idx + 1)
        else { setIdx(null); if (goNext) setNote('Selesai. Semua jawaban dalam antrean sudah diproses.') }
      }} />
  }

  const cleanable = subs.filter((s) => s.score != null && !s.photos_cleaned)
  async function clean() {
    const ids = cleanable.map((s) => s.id)
    const { data } = await supabase.from('submission_photos').select('id,path').in('submission_id', ids)
    const n = (data || []).length
    if (!window.confirm(`${n} foto dari ${ids.length} siswa akan dihapus permanen. Nilai dan komentar tetap disimpan. Lanjutkan?`)) return
    const paths = [...new Set((data || []).map((p) => p.path))]
    for (let i = 0; i < paths.length; i += 100)
      await supabase.storage.from('jawaban').remove(paths.slice(i, i + 100))
    await supabase.from('submission_photos').delete().in('submission_id', ids)
    await supabase.from('submissions').update({ photos_cleaned: true }).in('id', ids)
    setNote(`${n} foto berhasil dibersihkan.`)
    load()
  }

  async function exportXlsx() {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.aoa_to_sheet([['Nama', 'Kelas', 'Status', 'Dikirim', 'Nilai', 'Komentar'],
      ...subs.map((s) => [s.profiles?.full_name, s.profiles?.classes?.name || '', 'Sudah kirim', when(s.submitted_at), s.score ?? '', s.feedback || '']),
      ...missing.map((s) => [s.full_name, s.classes?.name || '', 'Belum kirim', '', '', ''])])
    ws['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Nilai')
    XLSX.writeFile(wb, 'nilai-' + task.title.replace(/[^\w-]+/g, '_') + '.xlsx')
  }

  async function copyMissing() {
    const names = shownMissing.map((s) => s.full_name)
    if (!names.length) return
    const title = `Belum mengumpulkan "${task.title}"${cls ? ` (${cls})` : ''}:`
    const ok = await copyText(listText(title, names))
    setNote(ok ? `Daftar ${names.length} siswa disalin. Tinggal tempel di WhatsApp.` : 'Browser menolak menyalin.')
  }

  const filters = [['wait', 'Perlu dinilai', nWait], ['done', 'Sudah dinilai', nDone], ['miss', 'Belum kirim', missing.length]]
  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>{task.title}</h2>
    {note && <div className="ok" role="status" style={{ margin: '0 0 12px' }}>{note}</div>}

    <div className="panel gsum">
      <div className="gsum-top">
        <b>{reps.length}{totalUnits ? ` dari ${totalUnits}` : ''} {unit} sudah kirim</b>
        {totalUnits ? <span className="muted">{pct}%</span> : null}
      </div>
      {totalUnits ? <div className="meter slim"><i style={{ width: pct + '%' }} /></div> : null}
      <div className="gsum-stats">
        <span className="chip soon">{nWait} belum dinilai</span>
        <span className="chip graded">{nDone} sudah dinilai</span>
        <span className="chip miss">{missing.length} belum kirim</span>
      </div>
    </div>

    <div className="seg">
      {filters.map(([k, l, n]) => (
        <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l} <span className="cnt">{n}</span></button>
      ))}
    </div>
    {classes.length > 1 && (
      <select value={cls} onChange={(e) => setCls(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Semua kelas</option>
        {classes.map((c) => <option key={c}>{c}</option>)}
      </select>
    )}

    {f !== 'miss' && !shown.length && (
      <div className="empty">{f === 'wait' ? 'Tidak ada jawaban yang menunggu dinilai.' : 'Belum ada jawaban yang dinilai.'}</div>
    )}
    {f !== 'miss' && shown.map((s) => {
      const late = task.due_at && s.submitted_at && new Date(s.submitted_at) > new Date(task.due_at)
      return (
        <button className="taskcard" key={s.id} onClick={() => { setQueue(shown.map((x) => x.id)); setIdx(shown.indexOf(s)) }}>
          <div>
            <b>{nameOf(s)}</b>
            <div className="muted">{s.profiles?.classes?.name} · {when(s.submitted_at)}{late ? ' · Terlambat' : ''}</div>
          </div>
          <span className={'chip ' + (s.score != null ? 'graded' : 'soon')}>{s.score != null ? 'Nilai ' + s.score : 'Belum dinilai'}</span>
        </button>
      )
    })}

    {f === 'miss' && (<>
      {!shownMissing.length && <div className="empty">Semua siswa sudah mengirim.</div>}
      {shownMissing.length > 0 && (
        <button className="btn ghost" style={{ marginBottom: 12 }} onClick={copyMissing}>Salin nama yang belum mengumpulkan</button>
      )}
      {shownMissing.map((s) => (
        <div className="taskcard static" key={s.id}>
          <div><b>{s.full_name}</b><div className="muted">{s.classes?.name}</div></div>
          <span className="chip miss">Belum kirim</span>
        </div>
      ))}
    </>)}

    {subs.length > 0 && <button className="btn ghost" style={{ margin: '12px 0' }} onClick={exportXlsx}>Ekspor nilai ke Excel</button>}
    {task.answer_type !== 'text' && cleanable.length > 0 && (
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Hemat penyimpanan</h3>
        <p className="muted">Foto dari {cleanable.length} siswa yang sudah dinilai bisa dihapus. Nilai dan komentar tetap aman.</p>
        <button className="btn ghost" onClick={clean}>Bersihkan foto tugas ini</button>
      </div>
    )}
  </>)
}

export default function Grading() {
  const [sel, setSel] = useState(null)
  return sel ? <ByTask task={sel} onBack={() => setSel(null)} /> : <TaskList onOpen={setSel} />
}
