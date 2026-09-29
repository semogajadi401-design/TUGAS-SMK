import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi, compress, toLocalInput } from './util.js'
import { useQuestionUrls } from './Questions.jsx'
import './quiz.css'

const api = (body) => callApi('/api/quiz', body)
const when = (v) => (v ? new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const newQ = () => ({ id: crypto.randomUUID(), text: '', image_path: null, options: ['', ''], correct: 0, points: 1 })

function Editor({ id, onBack }) {
  const [loaded, setLoaded] = useState(!id)
  const [locked, setLocked] = useState(false)
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [f, setF] = useState({ title: '', subject_id: '', instructions: '', question_seconds: '', open_at: '', close_at: '', reveal: 'submit', shuffle: true, status: 'published', class_ids: [] })
  const [qs, setQs] = useState([newQ()])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const urls = useQuestionUrls(qs)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  useEffect(() => {
    supabase.from('classes').select('id,name').order('name').then((r) => setClasses(r.data || []))
    supabase.from('subjects').select('id,name').order('name').then((r) => setSubjects(r.data || []))
    if (!id) return
    api({ action: 'get', id }).then((r) => {
      const z = r.quiz
      setF({ title: z.title, subject_id: z.subject_id || '', instructions: z.instructions || '', question_seconds: z.question_seconds ?? '',
        open_at: toLocalInput(z.open_at), close_at: toLocalInput(z.close_at), reveal: z.reveal, shuffle: z.shuffle, status: z.status, class_ids: r.class_ids })
      setQs(r.questions.map((q) => ({ id: q.id, text: q.text || '', image_path: q.image_path, options: q.options, correct: q.correct, points: q.points })))
      setLocked(r.locked); setLoaded(true)
    }).catch((e) => { setErr(e.message); setLoaded(true) })
  }, [])

  const upQ = (k, patch) => setQs((a) => a.map((q, j) => (j === k ? { ...q, ...patch } : q)))
  const upOpt = (k, o, v) => upQ(k, { options: qs[k].options.map((x, j) => (j === o ? v : x)) })
  const addOpt = (k) => qs[k].options.length < 6 && upQ(k, { options: [...qs[k].options, ''] })
  const delOpt = (k, o) => {
    const q = qs[k]
    if (q.options.length <= 2) return
    upQ(k, { options: q.options.filter((_, j) => j !== o), correct: q.correct === o ? 0 : q.correct > o ? q.correct - 1 : q.correct })
  }
  const move = (k, d) => setQs((a) => { const b = [...a], j = k + d; if (j < 0 || j >= b.length) return a; [b[k], b[j]] = [b[j], b[k]]; return b })
  const delQ = (k) => qs.length > 1 && window.confirm(`Hapus soal ${k + 1}?`) && setQs((a) => a.filter((_, j) => j !== k))
  const toggleClass = (cid) => set('class_ids', f.class_ids.includes(cid) ? f.class_ids.filter((x) => x !== cid) : [...f.class_ids, cid])

  async function pick(k, file) {
    if (!file) return
    setErr('')
    try {
      const blob = await compress(file, 1600, 0.8)
      const path = `quiz/${qs[k].id}-${Date.now()}.jpg`
      const up = await supabase.storage.from('lampiran').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      upQ(k, { image_path: path })
    } catch (e) { setErr('Gambar gagal diunggah: ' + e.message) }
  }

  async function save(status) {
    setBusy(true); setErr('')
    try {
      const body = { ...f, id, status, subject_id: f.subject_id || null }
      if (!locked) body.questions = qs.map((q) => ({ text: q.text, image_path: q.image_path, options: q.options, correct: q.correct, points: q.points }))
      await api({ action: 'save', ...body })
      onBack(true)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  if (!loaded) return <div className="empty">Memuat...</div>
  return (
    <div className="qz-edit">
      <button className="link" onClick={() => onBack()}>Kembali</button>
      <h2>{id ? 'Ubah quiz' : 'Buat quiz'}</h2>

      <div className="panel">
        <label htmlFor="qt">Judul</label>
        <input id="qt" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Contoh: Ulangan Harian Bab 3" />
        <label htmlFor="qs">Mata pelajaran</label>
        <select id="qs" value={f.subject_id} onChange={(e) => set('subject_id', e.target.value)}>
          <option value="">Tanpa mapel</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label>Untuk kelas</label>
        <div className="qz-classes">
          {classes.map((c) => (
            <label key={c.id} className={'qz-check' + (f.class_ids.includes(c.id) ? ' on' : '')}>
              <input type="checkbox" checked={f.class_ids.includes(c.id)} onChange={() => toggleClass(c.id)} />{c.name}
            </label>
          ))}
          {!classes.length && <span className="muted">Belum ada kelas. Buat dulu di Siswa & Kelas.</span>}
        </div>
        <label htmlFor="qi">Petunjuk untuk siswa <span className="muted">opsional</span></label>
        <textarea id="qi" rows={3} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} />
      </div>

      <div className="panel">
        <h3>Waktu dan hasil</h3>
        <div className="qz-2col">
          <div><label htmlFor="qd">Waktu per soal (detik)</label>
            <input id="qd" type="number" min="5" max="600" value={f.question_seconds} disabled={locked} onChange={(e) => set('question_seconds', e.target.value)} placeholder="Tanpa batas" /></div>
          <div><label htmlFor="qst">Status</label>
            <select id="qst" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="published">Terbit (siswa bisa lihat)</option><option value="draft">Draf (disembunyikan)</option>
            </select></div>
          <div><label htmlFor="qo">Dibuka</label>
            <input id="qo" type="datetime-local" value={f.open_at} onChange={(e) => set('open_at', e.target.value)} /></div>
          <div><label htmlFor="qc">Ditutup</label>
            <input id="qc" type="datetime-local" value={f.close_at} onChange={(e) => set('close_at', e.target.value)} /></div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Setiap soal memakai waktu ini (contoh 10 = 10 detik per soal) dengan hitung mundur. Siswa boleh mengubah jawaban selama waktu belum habis, lalu soal pindah otomatis dan tidak bisa kembali. Kosongkan jika tidak ingin membatasi waktu.{locked && ' Waktu per soal terkunci karena quiz sudah dikerjakan siswa.'}</p>
        <label htmlFor="qr">Kapan siswa melihat benar/salah</label>
        <select id="qr" value={f.reveal} onChange={(e) => set('reveal', e.target.value)}>
          <option value="submit">Langsung setelah selesai</option>
          <option value="close">Setelah quiz ditutup (waktu tutup wajib diisi)</option>
        </select>
        <label className="qz-check inline"><input type="checkbox" checked={f.shuffle} onChange={(e) => set('shuffle', e.target.checked)} />Acak urutan soal untuk tiap siswa</label>
      </div>

      <h3 className="sec">Soal ({qs.length})</h3>
      {locked && <div className="banner">Quiz ini sudah dikerjakan siswa, jadi soalnya dikunci. Pengaturan di atas tetap bisa diubah. Untuk mengubah soal, hapus hasil siswa dulu atau buat quiz baru.</div>}
      {qs.map((q, k) => (
        <fieldset className="panel qz-q" key={q.id} disabled={locked}>
          <div className="qz-qhead">
            <strong>Soal {k + 1}</strong>
            {!locked && <span>
              <button className="link" onClick={() => move(k, -1)} disabled={k === 0} aria-label={`Naikkan soal ${k + 1}`}>Naik</button>{' '}
              <button className="link" onClick={() => move(k, 1)} disabled={k === qs.length - 1} aria-label={`Turunkan soal ${k + 1}`}>Turun</button>{' '}
              <button className="link" onClick={() => delQ(k)} aria-label={`Hapus soal ${k + 1}`}>Hapus</button>
            </span>}
          </div>
          <textarea rows={2} value={q.text} onChange={(e) => upQ(k, { text: e.target.value })} placeholder="Tulis pertanyaan" aria-label={`Teks soal ${k + 1}`} />
          {urls[q.id] && <img className="qimg" src={urls[q.id]} alt={`Gambar soal ${k + 1}`} />}
          {!locked && <div className="qz-imgrow">
            <label className="btn ghost qz-file">{q.image_path ? 'Ganti gambar' : 'Tambah gambar'}
              <input type="file" accept="image/*" hidden onChange={(e) => { pick(k, e.target.files[0]); e.target.value = '' }} /></label>
            {q.image_path && <button className="link" onClick={() => upQ(k, { image_path: null })}>Lepas gambar</button>}
          </div>}
          <div className="qz-optlist" role="radiogroup" aria-label={`Pilihan soal ${k + 1}`}>
            {q.options.map((o, j) => (
              <div className="qz-optrow" key={j}>
                <input type="radio" name={'c' + q.id} checked={q.correct === j} onChange={() => upQ(k, { correct: j })} aria-label={`Jawaban benar: opsi ${String.fromCharCode(65 + j)}`} />
                <b>{String.fromCharCode(65 + j)}</b>
                <input value={o} onChange={(e) => upOpt(k, j, e.target.value)} placeholder={`Opsi ${String.fromCharCode(65 + j)}`} aria-label={`Opsi ${String.fromCharCode(65 + j)} soal ${k + 1}`} />
                {!locked && q.options.length > 2 && <button className="link" onClick={() => delOpt(k, j)} aria-label={`Hapus opsi ${String.fromCharCode(65 + j)}`}>Hapus</button>}
              </div>
            ))}
          </div>
          <div className="qz-imgrow">
            {!locked && q.options.length < 6 && <button className="link" onClick={() => addOpt(k)}>Tambah opsi</button>}
            <span className="muted">Pilih bulatan di kiri untuk menandai jawaban benar.</span>
            <label className="qz-pts">Poin <input type="number" min="1" max="100" value={q.points} onChange={(e) => upQ(k, { points: e.target.value })} /></label>
          </div>
        </fieldset>
      ))}
      {!locked && <button className="btn ghost" onClick={() => setQs((a) => [...a, newQ()])}>Tambah soal</button>}

      {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      <div className="qz-nav" style={{ marginTop: 16 }}>
        <button className="btn ghost" disabled={busy} onClick={() => save('draft')}>Simpan sebagai draf</button>
        <button className="btn" disabled={busy} onClick={() => save('published')}>{busy ? 'Menyimpan...' : 'Simpan dan terbitkan'}</button>
      </div>
    </div>
  )
}

function Results({ id, onBack }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const load = () => api({ action: 'results', id }).then(setD).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  async function reset(r) {
    if (!window.confirm(`Hapus hasil ${r.name}? Siswa ini bisa mengerjakan ulang dari awal.`)) return
    try { await api({ action: 'reset', id, student_id: r.student_id }); load() } catch (e) { setErr(e.message) }
  }
  if (err && !d) return <div><button className="link" onClick={onBack}>Kembali</button><div className="err">{err}</div></div>
  if (!d) return <div className="empty">Memuat...</div>

  const fin = d.rows.filter((r) => r.status === 'selesai')
  const avg = fin.length ? Math.round(fin.reduce((a, r) => a + Number(r.score), 0) / fin.length * 10) / 10 : null
  return (
    <div>
      <button className="link" onClick={onBack}>Kembali</button>
      <h2>{d.quiz.title}</h2>
      <div className="qz-meta">
        <span className="chip sent">{fin.length} selesai</span>
        <span className="chip soon">{d.rows.filter((r) => r.status === 'mengerjakan').length} mengerjakan</span>
        <span className="chip none">{d.rows.filter((r) => r.status === 'belum').length} belum mulai</span>
        {avg !== null && <span className="chip">Rata-rata {avg}</span>}
      </div>
      {err && <div className="err">{err}</div>}

      <div className="panel">
        <h3>Nilai siswa</h3>
        {!d.rows.length && <p className="muted">Belum ada siswa aktif di kelas yang dipilih.</p>}
        {d.rows.map((r) => (
          <div className="line" key={r.student_id}>
            <span><strong>{r.name}</strong> <small className="muted">{r.kelas}</small></span>
            <span className="qz-right">
              {r.status === 'selesai' ? <b>{Number(r.score)}</b> : <span className="muted">{r.status === 'belum' ? 'Belum mulai' : 'Mengerjakan'}</span>}
              {r.status !== 'belum' && <button className="link" style={{ marginTop: 0 }} onClick={() => reset(r)}>Ulang</button>}
            </span>
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Analisis soal</h3>
        {d.stats.every((s) => s.pct === null) && <p className="muted">Muncul setelah ada siswa yang selesai.</p>}
        {d.stats.map((s) => (
          <div className="qz-stat" key={s.n}>
            <div><b>{s.n}.</b> {s.text}</div>
            {s.pct !== null && <div className="qz-barwrap" title={`${s.pct}% menjawab benar`}>
              <div className={'qz-fill' + (s.pct < 40 ? ' low' : '')} style={{ width: s.pct + '%' }} /><span>{s.pct}% benar</span></div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Quiz() {
  const [list, setList] = useState(null)
  const [view, setView] = useState({ k: 'list' })
  const [err, setErr] = useState('')
  const load = () => api({ action: 'list' }).then((r) => setList(r.quizzes)).catch((e) => { setErr(e.message); setList([]) })
  useEffect(() => { if (view.k === 'list') load() }, [view.k])
  const back = () => { setList(null); setView({ k: 'list' }) }

  async function del(q) {
    if (!window.confirm(`Hapus quiz "${q.title}" beserta semua soal dan hasil siswa? Ini tidak bisa dibatalkan.`)) return
    try { await api({ action: 'delete', id: q.id }); load() } catch (e) { setErr(e.message) }
  }

  if (view.k === 'edit') return <Editor id={view.id} onBack={back} />
  if (view.k === 'results') return <Results id={view.id} onBack={back} />
  return (
    <div>
      <h2>Quiz</h2>
      <button className="btn" onClick={() => setView({ k: 'edit' })}>Buat quiz</button>
      {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      <div style={{ marginTop: 16 }}>
        {list === null && <div className="empty">Memuat...</div>}
        {list && !list.length && <div className="empty">Belum ada quiz. Buat yang pertama.</div>}
        {(list || []).map((q) => (
          <div className="panel" key={q.id}>
            <h3>{q.title}</h3>
            <div className="qz-meta">
              {q.status === 'draft' ? <span className="chip draft">Draf</span> : <span className="chip sent">Terbit</span>}
              {q.subject && <span className="chip">{q.subject}</span>}
              <span className="chip">{q.n_questions} soal</span>
              {q.question_seconds ? <span className="chip">{q.question_seconds} detik/soal</span> : q.duration_min ? <span className="chip">{q.duration_min} menit</span> : null}
            </div>
            <p className="muted">
              Kelas: {q.classes.join(', ') || '-'}<br />
              {q.n_finished} selesai dari {q.n_started} yang mulai
              {q.close_at ? ` · ditutup ${when(q.close_at)}` : ''}
            </p>
            <div className="qz-nav" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setView({ k: 'results', id: q.id })}>Lihat hasil</button>
              <button className="btn ghost" onClick={() => setView({ k: 'edit', id: q.id })}>Ubah</button>
              <button className="btn ghost" onClick={() => del(q)}>Hapus</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
