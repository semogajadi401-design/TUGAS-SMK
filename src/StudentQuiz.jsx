import { useEffect, useRef, useState } from 'react'
import { callApi } from './util.js'
import { QuestionHead } from './Questions.jsx'
import './quiz.css'

const api = (body) => callApi('/api/quiz', body)
const when = (v) => new Date(v).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const p2 = (n) => String(n).padStart(2, '0')
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600)
  return (h ? h + ':' : '') + p2(Math.floor(s / 60) % 60) + ':' + p2(s % 60)
}

function Result({ r, onBack }) {
  return (
    <div>
      {r.hidden
        ? <div className="banner">{r.message}</div>
        : <>
          <div className="qz-score"><strong>{Number(r.score)}</strong><span>{r.correct} benar dari {r.total} soal</span></div>
          <div className="qz-dots" aria-label="Hasil per nomor">
            {r.items.map((i) => <span key={i.n} className={i.ok ? 'yes' : 'no'}>{i.n}<small>{i.ok ? 'Benar' : 'Salah'}</small></span>)}
          </div>
        </>}
      <button className="btn" onClick={onBack}>Kembali ke daftar quiz</button>
    </div>
  )
}

function Take({ data, onDone }) {
  const { quiz, questions, deadline, server_now } = data
  const [ans, setAns] = useState(data.answers || {})
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [zoom, setZoom] = useState(null)
  const offset = useRef(new Date(server_now).getTime() - Date.now())
  const ansRef = useRef(ans); ansRef.current = ans
  const dirty = useRef(false)
  const sending = useRef(false)

  async function submit() {
    if (sending.current) return
    sending.current = true; setBusy(true); setErr('')
    try { onDone(await api({ action: 'submit', id: quiz.id, answers: ansRef.current })) }
    catch (e) { sending.current = false; setBusy(false); setErr(e.message) }
  }

  useEffect(() => {
    if (!deadline) return
    const end = new Date(deadline).getTime()
    const tick = () => { const ms = end - (Date.now() + offset.current); setLeft(ms); if (ms <= 0) submit() }
    tick(); const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  // Simpan otomatis tiap 8 detik jika ada perubahan, supaya jawaban aman saat koneksi putus.
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty.current) return
      dirty.current = false
      api({ action: 'save', id: quiz.id, answers: ansRef.current }).catch(() => { dirty.current = true })
    }, 8000)
    return () => clearInterval(t)
  }, [])

  const q = questions[i]
  const done = Object.keys(ans).filter((k) => questions.some((x) => x.id === k)).length
  const choose = (k) => { setAns((a) => ({ ...a, [q.id]: k })); dirty.current = true }
  const finish = () => {
    const rest = questions.length - done
    const msg = rest ? `Masih ada ${rest} soal yang belum dijawab. Kirim sekarang?` : 'Kirim semua jawaban? Setelah dikirim, tidak bisa diubah.'
    if (window.confirm(msg)) submit()
  }

  return (
    <div className="qz-take">
      <div className="qz-bar">
        <div><strong>{quiz.title}</strong><small>{done} dari {questions.length} terjawab</small></div>
        {left !== null && <div className={'qz-timer' + (left < 60000 ? ' low' : '')} role="timer" aria-label="Sisa waktu">{clock(left)}</div>}
      </div>

      <div className="panel">
        <QuestionHead n={i + 1} q={q} url={q.image_url} onZoom={setZoom} />
        <div className="qz-opts" role="radiogroup" aria-label={`Pilihan jawaban soal ${i + 1}`}>
          {q.options.map((o, k) => (
            <button key={k} role="radio" aria-checked={ans[q.id] === k} className={'qz-opt' + (ans[q.id] === k ? ' on' : '')} onClick={() => choose(k)}>
              <b>{String.fromCharCode(65 + k)}</b><span>{o}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="qz-nav">
        <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Sebelumnya</button>
        {i < questions.length - 1
          ? <button className="btn" onClick={() => setI(i + 1)}>Berikutnya</button>
          : <button className="btn" disabled={busy} onClick={finish}>{busy ? 'Mengirim...' : 'Kirim jawaban'}</button>}
      </div>

      <div className="qz-grid" aria-label="Loncat ke soal">
        {questions.map((x, k) => (
          <button key={x.id} className={(k === i ? 'cur ' : '') + (ans[x.id] !== undefined ? 'has' : '')} onClick={() => setI(k)}
            aria-label={`Soal ${k + 1}${ans[x.id] !== undefined ? ', sudah dijawab' : ', belum dijawab'}`}>{k + 1}</button>
        ))}
      </div>
      {i < questions.length - 1 && <button className="btn ghost" disabled={busy} onClick={finish}>Kirim jawaban</button>}
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}

      {zoom && <div className="modal-bg" onClick={() => setZoom(null)} style={{ alignItems: 'center' }}>
        <img src={zoom} alt="Gambar soal diperbesar" style={{ maxWidth: '96%', maxHeight: '92%', background: '#fff', borderRadius: 8 }} />
      </div>}
    </div>
  )
}

export default function StudentQuiz() {
  const [list, setList] = useState(null)
  const [view, setView] = useState(null) // { take } | { result }
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const load = () => api({ action: 'list' }).then((r) => setList(r.quizzes)).catch((e) => { setErr(e.message); setList([]) })
  useEffect(() => { load() }, [])

  async function open(qz) {
    if (qz.attempt === 'none' && !window.confirm(
      `Mulai "${qz.title}"?\n\n${qz.n_questions} soal${qz.duration_min ? `, waktu ${qz.duration_min} menit` : ''}. Waktu langsung berjalan dan quiz hanya bisa dikerjakan satu kali.`)) return
    setBusy(qz.id); setErr('')
    try {
      const r = await api({ action: qz.attempt === 'done' ? 'result' : 'start', id: qz.id })
      setView(r.done ? { result: r } : { take: r })
    } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const back = () => { setView(null); setList(null); load() }

  if (view?.take) return <Take data={view.take} onDone={(r) => setView({ result: r })} />
  if (view?.result) return <Result r={view.result} onBack={back} />

  const label = (q) => {
    if (q.attempt === 'done') return q.result_ready ? 'Lihat hasil' : 'Sudah dikirim'
    if (q.attempt === 'progress') return 'Lanjutkan'
    if (q.state === 'upcoming') return 'Belum dibuka'
    if (q.state === 'closed') return 'Ditutup'
    return 'Mulai'
  }
  const locked = (q) => q.attempt === 'none' && q.state !== 'open'

  return (
    <div>
      <h2>Quiz</h2>
      {err && <div className="err">{err}</div>}
      {list === null && <div className="empty">Memuat...</div>}
      {list && !list.length && <div className="empty">Belum ada quiz untuk kelasmu.</div>}
      {(list || []).map((q) => (
        <div className="panel" key={q.id}>
          <h3>{q.title}</h3>
          <div className="qz-meta">
            {q.subject && <span className="chip">{q.subject}</span>}
            <span className="chip">{q.n_questions} soal</span>
            {q.duration_min && <span className="chip">{q.duration_min} menit</span>}
            {q.attempt === 'done' && <span className="chip sent">Selesai</span>}
            {q.attempt === 'progress' && <span className="chip soon">Sedang dikerjakan</span>}
          </div>
          <p className="muted">
            {q.state === 'upcoming' && q.open_at ? `Dibuka ${when(q.open_at)}` : q.close_at ? `Ditutup ${when(q.close_at)}` : 'Tanpa batas waktu tutup'}
          </p>
          {q.instructions && <p className="instr">{q.instructions}</p>}
          <button className={'btn' + (q.attempt === 'done' && !q.result_ready ? ' ghost' : '')} style={{ marginTop: 12 }}
            disabled={locked(q) || busy === q.id || (q.attempt === 'done' && !q.result_ready)} onClick={() => open(q)}>
            {busy === q.id ? 'Membuka...' : label(q)}
          </button>
        </div>
      ))}
    </div>
  )
}
