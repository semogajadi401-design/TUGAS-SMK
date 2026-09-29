import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi } from './util.js'

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function dueInfo(due) {
  if (!due) return { t: 'Tanpa tenggat', c: '' }
  if (new Date(due) < new Date()) return { t: 'Terlambat', c: 'late' }
  const n = Math.round((dayStart(due) - dayStart(new Date())) / 864e5)
  if (n === 0) return { t: 'Hari ini', c: 'soon' }
  if (n === 1) return { t: 'Besok', c: 'soon' }
  return { t: `${n} hari lagi`, c: '' }
}
const fmt = (d) => new Date(d).toLocaleString('id-ID',
  { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const stateOf = (x) => (x?.score != null ? 'graded' : x?.status === 'submitted' ? 'sent' : x?.return_note ? 'revise' : x ? 'draft' : 'todo')
const LABEL = { revise: 'Perlu diperbaiki', todo: 'Belum dikerjakan', draft: 'Draf', sent: 'Terkirim', graded: 'Dinilai' }
const TYPE = { photo: 'Jawab dengan foto', text: 'Jawab dengan teks', both: 'Jawab dengan foto dan teks' }
const MAX_PHOTOS = 6

async function compress(file, max = 1280, q = 0.7) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas')
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
      bmp.close?.()
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
      if (b) return b
    } catch { /* lanjut ke cara lama */ }
  }
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses foto'))), 'image/jpeg', q)
    }
    img.onerror = () => rej(new Error('File itu bukan foto yang valid'))
    img.src = url
  })
}

function List({ onOpen }) {
  const [rows, setRows] = useState(null)
  const [f, setF] = useState('todo')
  const [sj, setSj] = useState('')

  useEffect(() => {
    (async () => {
      const [a, s] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at,subjects(name)').eq('status', 'active')
          .order('due_at', { ascending: true, nullsFirst: false }),
        supabase.from('submissions').select('assignment_id,status,score,return_note'),
      ])
      const m = new Map((s.data || []).map((x) => [x.assignment_id, x]))
      setRows((a.data || []).map((t) => ({ ...t, st: stateOf(m.get(t.id)) })))
    })()
  }, [])

  const filters = [['todo', 'Belum'], ['sent', 'Dikirim'], ['graded', 'Dinilai'], ['all', 'Semua']]
  const match = (r) => f === 'all' || (f === 'todo' ? r.st === 'todo' || r.st === 'draft' || r.st === 'revise' : r.st === f)
  const mapel = [...new Set((rows || []).map((r) => r.subjects?.name).filter(Boolean))].sort()
  const shown = (rows || []).filter(match).filter((r) => !sj || r.subjects?.name === sj)

  return (<>
    <div className="seg">
      {filters.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
    </div>
    {mapel.length > 1 && (
      <select value={sj} onChange={(e) => setSj(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Semua mapel</option>
        {mapel.map((m) => <option key={m}>{m}</option>)}
      </select>
    )}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !shown.length && <div className="empty">Tidak ada tugas di kategori ini.</div>}
    {shown.map((t) => {
      const di = dueInfo(t.due_at)
      return (
        <button className="task" key={t.id} onClick={() => onOpen(t.id)}>
          <div><b>{t.title}</b><div className="muted">{t.subjects?.name ? t.subjects.name + ' · ' : ''}{LABEL[t.st]}</div></div>
          {t.st === 'todo' || t.st === 'draft' || t.st === 'revise'
            ? <span className={'chip ' + di.c}>{di.t}</span>
            : <span className={'chip ' + (t.st === 'graded' ? 'graded' : 'sent')}>{LABEL[t.st]}</span>}
        </button>
      )
    })}
  </>)
}

function Detail({ id, profile, onBack }) {
  const [task, setTask] = useState(null)
  const [sub, setSub] = useState(null)
  const [photos, setPhotos] = useState([])
  const [added, setAdded] = useState([])
  const [removed, setRemoved] = useState([])
  const [text, setText] = useState('')
  const [attach, setAttach] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [grp, setGrp] = useState(undefined)

  async function load() {
    const [t, s] = await Promise.all([
      supabase.from('assignments').select('*').eq('id', id).single(),
      supabase.from('submissions').select('*, submission_photos(id,path)').eq('assignment_id', id).maybeSingle(),
    ])
    setTask(t.data); setSub(s.data); setText(s.data?.text_answer || '')
    if (t.data?.is_group) callApi('/api/group', { action: 'mine', assignment_id: id }).then(setGrp).catch(() => setGrp({ group: null, isLeader: false }))
    else setGrp(null)
    const list = s.data?.submission_photos || []
    if (list.length) {
      const { data } = await supabase.storage.from('jawaban').createSignedUrls(list.map((p) => p.path), 3600)
      setPhotos(list.map((p, i) => ({ ...p, url: data?.[i]?.signedUrl })))
    } else setPhotos([])
    if (t.data?.attachment_path) {
      const { data } = await supabase.storage.from('lampiran').createSignedUrl(t.data.attachment_path, 3600)
      setAttach(data?.signedUrl || '')
    }
  }
  useEffect(() => { load() }, [id])

  if (!task || (task.is_group && grp === undefined)) return <div className="empty">Memuat...</div>

  const graded = sub?.score != null
  const viewer = !!task.is_group && !grp?.isLeader
  const locked = viewer || graded || (sub?.status === 'submitted' && task.due_at && new Date() > new Date(task.due_at))
  const wantsPhoto = task.answer_type !== 'text' && !viewer
  const wantsText = task.answer_type !== 'photo'
  const total = photos.filter((p) => !removed.includes(p)).length + added.length
  const shownPhotos = photos.filter((p) => !removed.includes(p))
  const di = dueInfo(task.due_at)

  function pick(e) {
    const files = [...e.target.files].slice(0, Math.max(0, MAX_PHOTOS - total))
    setAdded([...added, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))])
    e.target.value = ''
  }

  async function save(submit) {
    setBusy(true); setMsg(null)
    try {
      if (submit) {
        if (task.answer_type === 'photo' && !total) throw new Error('Tambahkan minimal satu foto sebelum mengirim.')
        if (task.answer_type === 'text' && !text.trim()) throw new Error('Isi jawaban teks sebelum mengirim.')
        if (task.answer_type === 'both' && !total && !text.trim()) throw new Error('Tambahkan foto atau jawaban teks sebelum mengirim.')
      }
      const status = submit ? 'submitted' : (sub?.status || 'draft')
      const { data: row, error } = await supabase.from('submissions')
        .upsert({ assignment_id: id, student_id: profile.id, text_answer: text, status, ...(submit && sub?.return_note ? { return_note: null } : {}) },
          { onConflict: 'assignment_id,student_id' }).select('id').single()
      if (error) throw error
      if (removed.length) {
        await supabase.storage.from('jawaban').remove(removed.map((p) => p.path))
        await supabase.from('submission_photos').delete().in('id', removed.map((p) => p.id))
      }
      // Kompres + unggah semua foto sekaligus (bukan satu per satu), lalu satu kali insert.
      const stamp = Date.now()
      const paths = await Promise.all(added.map(async (a, i) => {
        const blob = await compress(a.file)
        const path = `${profile.id}/${row.id}/${stamp}-${i}.jpg`
        const up = await supabase.storage.from('jawaban').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        return path
      }))
      if (paths.length) {
        const ins = await supabase.from('submission_photos').insert(paths.map((path) => ({ submission_id: row.id, path })))
        if (ins.error) throw ins.error
      }
      if (submit && task.is_group && grp?.isLeader) {
        try { await callApi('/api/group', { action: 'sync', assignment_id: id }) }
        catch { throw new Error('Jawabanmu tersimpan, tapi belum diteruskan ke anggota kelompok. Tekan tombol simpan sekali lagi.') }
      }
      setAdded([]); setRemoved([])
      await load()
      setMsg({ ok: true, t: submit ? 'Tugas terkirim. Kamu masih bisa mengubahnya sampai tenggat.' : 'Draf tersimpan.' })
    } catch (e) {
      setMsg({ ok: false, t: /row-level security/.test(e.message)
        ? 'Tugas ini sudah terkunci (tenggat lewat atau sudah dinilai), jadi tidak bisa diubah.' : e.message })
    }
    setBusy(false)
  }

  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>{task.title}</h2>
    <div className="tags">
      <span className={'chip ' + di.c}>{di.t}</span>
      <span className="chip">{TYPE[task.answer_type]}</span>
    </div>
    {task.due_at && <p className="muted">Tenggat: {fmt(task.due_at)}</p>}
    {task.instructions && <p className="instr">{task.instructions}</p>}
    {attach && <a className="btn ghost attach" href={attach} target="_blank" rel="noreferrer">Buka lampiran dari guru</a>}

    {task.is_group && (
      <div className="banner">
        {!grp?.group ? 'Ini tugas kelompok, tapi kamu belum dimasukkan ke kelompok. Hubungi gurumu.'
          : grp.isLeader ? `Tugas kelompok ${grp.group.name}. Jawaban yang kamu kirim berlaku untuk semua anggota: ${grp.group.members.join(', ')}.`
          : `Tugas kelompok ${grp.group.name}. Yang mengirim jawaban adalah ketua: ${grp.group.leader_name}.`}
      </div>
    )}
    {sub?.return_note && sub.status !== 'submitted' && !graded && (
      <div className="banner"><b>Guru meminta perbaikan:</b> {sub.return_note}</div>
    )}
    {graded && (
      <div className="result">
        <div className="big">{sub.score}</div>
        <div><b>Nilai kamu</b>{sub.feedback && <p>{sub.feedback}</p>}</div>
      </div>
    )}
    {locked && !graded && <div className="banner">Tenggat sudah lewat, jawabanmu terkunci dan menunggu dinilai.</div>}

    {wantsPhoto && (<>
      <h3 className="sec">Foto jawaban</h3>
      {sub?.photos_cleaned && <p className="muted">Foto sudah dibersihkan guru untuk menghemat penyimpanan. Nilaimu tetap tersimpan.</p>}
      <div className="photos">
        {shownPhotos.map((p) => (
          <div className="ph" key={p.id}>
            <img src={p.url} alt="Foto jawaban" loading="lazy" decoding="async" />
            {!locked && <button aria-label="Hapus foto" onClick={() => setRemoved([...removed, p])}>×</button>}
          </div>
        ))}
        {added.map((a, i) => (
          <div className="ph" key={a.url}>
            <img src={a.url} alt="Foto baru" />
            <button aria-label="Hapus foto" onClick={() => setAdded(added.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      {!locked && total < MAX_PHOTOS && (
        <div className="picks">
          <label className="btn ghost">Ambil foto<input type="file" accept="image/*" capture="environment" hidden onChange={pick} /></label>
          <label className="btn ghost">Pilih dari galeri<input type="file" accept="image/*" multiple hidden onChange={pick} /></label>
        </div>
      )}
      {!locked && <p className="muted">Maksimal {MAX_PHOTOS} foto. Foto diperkecil otomatis sebelum diunggah.</p>}
    </>)}

    {wantsText && (<>
      <h3 className="sec">Jawaban teks</h3>
      <textarea rows="6" value={text} disabled={locked} onChange={(e) => setText(e.target.value)}
        placeholder="Ketik jawabanmu di sini" />
    </>)}

    {msg && <div className={msg.ok ? 'ok' : 'err'} role="status">{msg.t}</div>}
    {!locked && (sub?.status === 'submitted'
      ? <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Menyimpan...' : 'Simpan perubahan'}</button>
      : <div className="picks">
          <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Simpan draf</button>
          <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Mengirim...' : 'Kirim tugas'}</button>
        </div>)}
  </>)
}

export default function StudentTasks({ profile, openId, setOpenId }) {
  return openId
    ? <Detail id={openId} profile={profile} onBack={() => setOpenId(null)} />
    : <List onOpen={setOpenId} />
}

export function Grades() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.from('submissions').select('score,feedback,updated_at,assignments(title,subjects(name))')
      .not('score', 'is', null).order('updated_at', { ascending: false })
      .then((r) => setRows(r.data || []))
  }, [])
  if (rows === null) return <div className="empty">Memuat...</div>
  const avg = rows.length ? Math.round(rows.reduce((n, r) => n + Number(r.score), 0) / rows.length) : null
  const per = {}
  rows.forEach((r) => { const n = r.assignments?.subjects?.name || 'Tanpa mapel'; (per[n] = per[n] || []).push(Number(r.score)) })
  return (<>
    {avg !== null && <div className="hero"><div><small>Rata-rata nilai</small><h2>{avg}</h2><p>dari {rows.length} tugas</p></div></div>}
    {Object.keys(per).length > 1 && (
      <div className="stats">
        {Object.entries(per).map(([n, v]) => (
          <div className="stat" key={n}><b>{Math.round(v.reduce((a, b) => a + b, 0) / v.length)}</b><span>{n}</span></div>
        ))}
      </div>
    )}
    {!rows.length && <div className="empty">Belum ada tugas yang dinilai.</div>}
    {rows.map((r, i) => (
      <div className="result" key={i}>
        <div className="big">{r.score}</div>
        <div><b>{r.assignments?.title}</b>{r.assignments?.subjects?.name && <div className="muted">{r.assignments.subjects.name}</div>}{r.feedback && <p>{r.feedback}</p>}</div>
      </div>
    ))}
  </>)
}
