import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi, compress } from './util.js'
import { useQuestionUrls, QuestionHead } from './Questions.jsx'
import { Icon, I } from './Shell.jsx'
import { dueInfo, fmtFull, isClosed, relative } from './deadline.js'
import { useOnline, isNetError, reportNetFailure } from './lib/net.js'
import { toast } from './lib/toast.js'
import { putCache, getCache, cachedTaskIds, savePending, getPending, delPending, listPending, cacheBlob, blobUrl } from './lib/offline.js'

const stateOf = (x) => (x?.score != null ? 'graded' : x?.status === 'submitted' ? 'sent' : x?.return_note ? 'revise' : x ? 'draft' : 'todo')
const LABEL = { revise: 'Perlu diperbaiki', todo: 'Belum dikerjakan', draft: 'Draf', sent: 'Terkirim', graded: 'Dinilai' }
const TYPE = { photo: 'Jawab dengan foto', text: 'Jawab dengan teks', both: 'Jawab dengan foto atau teks' }
const MAX_PHOTOS = 6 // tugas tanpa soal bernomor
const MAX_PER_Q = 3 // per soal bernomor

function List({ onOpen, profile }) {
  const uid = profile.id
  const online = useOnline()
  const [rows, setRows] = useState(null)
  const [f, setF] = useState('todo')
  const [sj, setSj] = useState('')
  const [fromCache, setFromCache] = useState(false)
  const [pend, setPend] = useState(new Set())   // tugas yang punya jawaban offline belum terkirim
  const [saved, setSaved] = useState(new Set()) // tugas yang sudah tersimpan di perangkat (bisa dibuka offline)

  useEffect(() => {
    let off = false
    ;(async () => {
      let list = null
      if (online) {
        const [a, s, e] = await Promise.all([
          supabase.from('assignments').select('id,title,due_at,subjects(name)').eq('status', 'active')
            .order('due_at', { ascending: true, nullsFirst: false }),
          supabase.from('submissions').select('assignment_id,status,score,return_note'),
          supabase.from('task_extensions').select('assignment_id,due_at'), // perpanjangan dari guru
        ])
        if ([a, s].some((r) => r.error && isNetError(r.error))) reportNetFailure()
        else {
          const m = new Map((s.data || []).map((x) => [x.assignment_id, x]))
          const ext = new Map((e.data || []).map((x) => [x.assignment_id, x.due_at]))
          list = (a.data || []).map((t) => ({ ...t, due: ext.get(t.id) || t.due_at, extended: ext.has(t.id), st: stateOf(m.get(t.id)) }))
          putCache(uid, 'list', list)
        }
      }
      const shown = list || (await getCache(uid, 'list')) || []
      const [p, c] = await Promise.all([listPending(uid), cachedTaskIds(uid)])
      if (off) return
      setFromCache(!list); setPend(new Set(p.map((x) => x.taskId))); setSaved(c); setRows(shown)
    })()
    return () => { off = true }
  }, [online])

  function open(t) {
    if (!online && !saved.has(t.id)) {
      toast({ kind: 'warn', text: 'Tugas ini belum pernah dibuka saat online, jadi belum bisa dibuka offline.' })
      return
    }
    onOpen(t.id)
  }

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
    {fromCache && rows?.length > 0 && <p className="muted">Menampilkan daftar tugas terakhir yang tersimpan di perangkat.</p>}
    {rows === null && <div className="empty">Memuat...</div>}
    {rows && !rows.length && fromCache && <div className="empty">Daftar tugas belum tersimpan di perangkat. Buka aplikasi saat online sekali dulu.</div>}
    {rows && (rows.length > 0 || !fromCache) && !shown.length && <div className="empty">Tidak ada tugas di kategori ini.</div>}
    {shown.map((t) => {
      const di = dueInfo(t.due)
      const pending = t.st === 'todo' || t.st === 'draft' || t.st === 'revise'
      return (
        <button className="task" key={t.id} onClick={() => open(t)}>
          <div>
            <b>{t.title}</b>
            <div className="muted">{t.subjects?.name ? t.subjects.name + ' · ' : ''}{LABEL[t.st]}{!online && !saved.has(t.id) ? ' · Belum tersedia offline' : ''}</div>
            {pend.has(t.id) && <div className="muted pendline">Jawaban offline belum terkirim</div>}
            {pending && t.due && (
              <div className="muted">{di.closed ? 'Berakhir ' : 'Batas '}{fmtFull(t.due)}{t.extended && !di.closed ? ' (diperpanjang)' : ''}</div>
            )}
          </div>
          {pending
            ? <span className={'chip ' + di.c}>{di.t}</span>
            : <span className={'chip ' + (t.st === 'graded' ? 'graded' : 'sent')}>{LABEL[t.st]}</span>}
        </button>
      )
    })}
  </>)
}

function Detail({ id, profile, onBack }) {
  const uid = profile.id
  const online = useOnline()
  const [task, setTask] = useState(null)
  const [sub, setSub] = useState(null)
  const [photos, setPhotos] = useState([])
  const [added, setAdded] = useState([])
  const [removed, setRemoved] = useState([])
  const [text, setText] = useState('')
  const [answers, setAnswers] = useState({})
  const [zoom, setZoom] = useState('')
  const [attach, setAttach] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [grp, setGrp] = useState(undefined)
  const [ext, setExt] = useState(null) // perpanjangan dari guru (jika ada)
  const [pend, setPend] = useState(null)         // jawaban yang disimpan di perangkat dan belum terkirim
  const [missing, setMissing] = useState('')     // alasan halaman tidak bisa dibuka (mis. belum pernah dibuka saat online)
  const [fromCache, setFromCache] = useState(false)
  const lockRef = useRef(false)

  // Pulihkan jawaban dari perangkat. Isi di perangkat menang atas draf di server.
  function restore(p, ph) {
    setText(p.text || ''); setAnswers(p.answers || {})
    setAdded((p.photos || []).map((x) => ({ file: x.blob, q: x.q, ready: !!x.ready, url: URL.createObjectURL(x.blob) })))
    setRemoved(ph.filter((x) => (p.removedIds || []).includes(x.id)))
    setPend(p)
  }

  async function load() {
    setMissing('')
    let netFail = !online
    if (online) {
      const [t, s, e] = await Promise.all([
        supabase.from('assignments').select('*').eq('id', id).single(),
        supabase.from('submissions').select('*, submission_photos(id,path,question_id)').eq('assignment_id', id).maybeSingle(),
        supabase.from('task_extensions').select('due_at').eq('assignment_id', id).eq('student_id', profile.id).maybeSingle(),
      ])
      netFail = [t, s].some((r) => r.error && isNetError(r.error))
      if (netFail) reportNetFailure()
      else if (!t.data) { setMissing('Tugas ini tidak ditemukan atau sudah dihapus oleh guru.'); return }
      else {
        setFromCache(false)
        setExt(e.data?.due_at || null)
        setTask(t.data); setSub(s.data); setText(s.data?.text_answer || ''); setAnswers(s.data?.answers || {})
        let g = null
        if (t.data.is_group) {
          try { g = await callApi('/api/group', { action: 'mine', assignment_id: id }) }
          catch (err) {
            const old = isNetError(err) ? (await getCache(uid, 'task:' + id))?.grp : null
            g = old || { group: null, isLeader: false }
          }
        }
        setGrp(g)
        const list = s.data?.submission_photos || []
        let ph = []
        if (list.length) {
          const { data } = await supabase.storage.from('jawaban').createSignedUrls(list.map((p) => p.path), 3600)
          ph = list.map((p, i) => ({ ...p, url: data?.[i]?.signedUrl }))
        }
        setPhotos(ph)
        let url = ''
        if (t.data.attachment_path) {
          const { data } = await supabase.storage.from('lampiran').createSignedUrl(t.data.attachment_path, 3600)
          url = data?.signedUrl || ''
        }
        setAttach(url)
        // Simpan salinan supaya halaman ini tetap bisa dibuka dan dikerjakan saat offline.
        await putCache(uid, 'task:' + id, { task: t.data, sub: s.data, ext: e.data?.due_at || null, grp: g, photos: list })
        ph.forEach((p) => cacheBlob('jawaban', p.path, p.url))
        cacheBlob('lampiran', t.data.attachment_path, url)
        const p = await getPending(uid, id)
        if (p && (s.data?.status === 'submitted' || s.data?.score != null)) { await delPending(uid, id); setPend(null) } // sudah terkirim dari perangkat lain
        else if (p) restore(p, ph)
        else setPend(null)
        return
      }
    }
    // Offline (atau jaringan putus): pakai salinan di perangkat.
    const c = await getCache(uid, 'task:' + id)
    if (!c?.task) { setMissing('Halaman tugas ini belum pernah dibuka saat online, jadi belum tersedia offline. Buka sekali saat ada internet.'); return }
    setFromCache(true)
    setExt(c.ext || null)
    setTask(c.task); setSub(c.sub); setText(c.sub?.text_answer || ''); setAnswers(c.sub?.answers || {})
    setGrp(c.task.is_group ? (c.grp || { group: null, isLeader: false }) : null)
    const ph = await Promise.all((c.photos || []).map(async (p) => ({ ...p, url: await blobUrl('jawaban', p.path) })))
    setPhotos(ph)
    setAttach(c.task.attachment_path ? await blobUrl('lampiran', c.task.attachment_path) : '')
    const p = await getPending(uid, id)
    if (p) restore(p, ph); else setPend(null)
  }
  useEffect(() => { load() }, [id])

  // Internet kembali saat halaman dibuka dari salinan: muat data terbaru bila belum ada yang diubah.
  useEffect(() => {
    if (online && fromCache && !pend && !added.length && !removed.length) load()
  }, [online])

  const qurls = useQuestionUrls(task?.questions, { cache: true, online })

  // Ada perubahan dibanding isi di server? (dipakai agar membuka tugas saat offline tidak dianggap "belum terkirim")
  const norm = (o) => JSON.stringify(Object.entries(o || {}).filter(([, v]) => String(v || '').trim()).sort())
  const dirty = () => (text || '').trim() !== (sub?.text_answer || '').trim()
    || norm(answers) !== norm(sub?.answers) || added.length > 0 || removed.length > 0

  // Simpan jawaban di perangkat (IndexedDB). explicit = siswa menekan tombol simpan.
  async function persistLocal(explicit = false) {
    if (!task || lockRef.current) return false
    if (!dirty()) { if (pend) { await delPending(uid, id); setPend(null) } return false }
    const rec = {
      title: task.title, text, answers,
      photos: added.map((a) => ({ q: a.q, blob: a.file, ready: !!a.ready })),
      removedIds: removed.map((p) => p.id),
      savedAt: explicit ? Date.now() : (pend?.savedAt || Date.now()),
    }
    await savePending(uid, id, rec)
    setPend({ ...rec, taskId: id })
    return true
  }

  // Saat offline, setiap perubahan disimpan otomatis di perangkat.
  useEffect(() => {
    if (!task || online) return undefined
    const h = setTimeout(() => { persistLocal().catch(() => {}) }, 800)
    return () => clearTimeout(h)
  }, [text, answers, added, removed, online])

  if (missing) return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <div className="empty">{missing}</div>
  </>)
  if (!task || (task.is_group && grp === undefined)) return <div className="empty">Memuat...</div>

  const graded = sub?.score != null
  const viewer = !!task.is_group && !grp?.isLeader
  const sent = sub?.status === 'submitted'
  const due = ext || task.due_at                 // tenggat efektif (perpanjangan guru jika ada)
  const closed = isClosed(due) && !graded && !sent // waktu habis sebelum dikirim
  const locked = viewer || graded || sent || closed // setelah dikirim atau waktu habis, jawaban tidak bisa diubah
  lockRef.current = locked
  const wantsPhoto = task.answer_type !== 'text' && !viewer
  const wantsText = task.answer_type !== 'photo'
  const questions = task.questions || []
  const hasQ = questions.length > 0
  const shownPhotos = photos.filter((p) => !removed.includes(p))
  const total = shownPhotos.length + added.length
  const countOf = (q) => shownPhotos.filter((p) => (p.question_id || null) === q).length + added.filter((a) => a.q === q).length
  const answered = (q) => {
    const t = (answers[q] || '').trim(), n = countOf(q)
    return task.answer_type === 'photo' ? n > 0 : task.answer_type === 'text' ? !!t : n > 0 || !!t
  }
  const di = dueInfo(due)
  const both = task.answer_type === 'both'
  const nAns = hasQ ? questions.filter((q) => answered(q.id)).length : 0
  const ready = hasQ
    ? nAns === questions.length
    : task.answer_type === 'photo' ? total > 0 : task.answer_type === 'text' ? !!text.trim() : total > 0 || !!text.trim()
  const readyText = ready ? 'Jawabanmu sudah lengkap dan siap dikirim.'
    : hasQ ? `${nAns} dari ${questions.length} soal sudah dijawab. ${both ? 'Tiap soal cukup dijawab dengan foto atau teks.' : 'Lengkapi semua soal sebelum mengirim.'}`
    : both ? 'Belum ada jawaban. Tambahkan foto atau ketik jawaban (salah satu sudah cukup).'
    : task.answer_type === 'photo' ? 'Belum ada foto jawaban.' : 'Belum ada jawaban teks.'
  const GUIDE = {
    photo: ['Cara menjawab: kirim foto', 'Foto jawabanmu di kertas, lalu unggah di bawah.'],
    text: ['Cara menjawab: ketik di layar', 'Tulis jawabanmu langsung di kolom teks di bawah.'],
    both: ['Pilih salah satu cara menjawab', 'Kamu boleh mengirim foto, atau mengetik langsung di layar. Memakai keduanya juga boleh. Cukup salah satu terisi agar tugas bisa dikirim.'],
  }[task.answer_type]

  async function pick(e, q = null) {
    const room = q ? MAX_PER_Q - countOf(q) : MAX_PHOTOS - total
    const files = [...e.target.files].slice(0, Math.max(0, room))
    e.target.value = ''
    // Saat offline, foto langsung diperkecil supaya hemat ruang penyimpanan perangkat.
    const items = await Promise.all(files.map(async (file) => {
      if (online) return { file, q, url: URL.createObjectURL(file) }
      try { const b = await compress(file); return { file: b, q, ready: true, url: URL.createObjectURL(b) } }
      catch { return { file, q, url: URL.createObjectURL(file) } }
    }))
    setAdded((cur) => [...cur, ...items])
  }

  // Tombol "Simpan di perangkat" (saat offline).
  async function saveLocal() {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      if (isClosed(due)) throw new Error('Waktu pengerjaan sudah berakhir, jadi jawaban tidak bisa disimpan lagi. Hubungi gurumu jika perlu tambahan waktu.')
      const did = await persistLocal(true)
      setMsg(did
        ? { ok: true, t: 'Tersimpan di perangkat. Setelah internet kembali, tombol "Kirim jawaban" muncul di halaman ini.' }
        : { ok: false, t: 'Belum ada jawaban baru untuk disimpan.' })
    } catch (e) {
      setMsg({ ok: false, t: 'Jawaban gagal disimpan di perangkat (penyimpanan penuh atau dibatasi browser). Salin jawabanmu dulu supaya tidak hilang.' })
    }
    setBusy(false)
  }

  async function save(submit) {
    if (busy) return
    if (!online) return saveLocal()
    setBusy(true); setMsg(null)
    try {
      if (isClosed(due)) throw new Error('Waktu pengerjaan sudah berakhir, jadi jawaban tidak bisa disimpan atau dikirim lagi. Hubungi gurumu jika perlu tambahan waktu.')
      if (submit && hasQ) {
        const i = questions.findIndex((q) => !answered(q.id))
        if (i >= 0) throw new Error(`Soal nomor ${i + 1} belum dijawab.`)
      } else if (submit) {
        if (task.answer_type === 'photo' && !total) throw new Error('Tambahkan minimal satu foto sebelum mengirim.')
        if (task.answer_type === 'text' && !text.trim()) throw new Error('Isi jawaban teks sebelum mengirim.')
        if (task.answer_type === 'both' && !total && !text.trim()) throw new Error('Tambahkan foto atau jawaban teks sebelum mengirim.')
      }
      // 1) Simpan dulu sebagai draf. Status "submitted" baru dipasang di langkah 3,
      //    setelah semua foto benar-benar terunggah. Jika unggah gagal, tugas tidak terkunci kosong.
      const { data: row, error } = await supabase.from('submissions')
        .upsert({ assignment_id: id, student_id: profile.id, text_answer: text, answers: hasQ ? answers : null, status: sub?.status || 'draft' },
          { onConflict: 'assignment_id,student_id' }).select('id').single()
      if (error) throw error
      if (removed.length) {
        await supabase.storage.from('jawaban').remove(removed.map((p) => p.path))
        await supabase.from('submission_photos').delete().in('id', removed.map((p) => p.id))
      }
      // Kompres + unggah semua foto sekaligus (bukan satu per satu), lalu satu kali insert.
      const stamp = Date.now()
      const paths = await Promise.all(added.map(async (a, i) => {
        const blob = a.ready ? a.file : await compress(a.file)
        const path = `${profile.id}/${row.id}/${stamp}-${i}.jpg`
        const up = await supabase.storage.from('jawaban').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) {
          const er = new Error('Foto gagal diunggah. Periksa koneksi internet lalu coba lagi. Jawabanmu belum terkirim.')
          er.net = isNetError(up.error)
          throw er
        }
        return path
      }))
      if (paths.length) {
        const ins = await supabase.from('submission_photos').insert(paths.map((path, i) => ({ submission_id: row.id, path, question_id: added[i].q })))
        if (ins.error) throw ins.error
      }
      // 2) Saat mengirim: cek ulang isi yang TERSIMPAN di server, bukan hanya isi layar.
      // 3) Baru kunci (status submitted).
      if (submit) {
        const { data: saved, error: e2 } = await supabase.from('submission_photos').select('question_id').eq('submission_id', row.id)
        if (e2) throw e2
        const fotoDi = (q) => (saved || []).filter((p) => (p.question_id || null) === q).length
        const terisi = (txt, n) => task.answer_type === 'photo' ? n > 0 : task.answer_type === 'text' ? !!txt.trim() : n > 0 || !!txt.trim()
        const kosong = hasQ
          ? questions.findIndex((q) => !terisi(answers[q.id] || '', fotoDi(q.id)))
          : (terisi(text, (saved || []).length) ? -1 : 0)
        if (kosong >= 0) throw new Error(hasQ ? `Soal nomor ${kosong + 1} belum tersimpan di server. Coba kirim lagi.` : 'Jawabanmu belum tersimpan lengkap. Coba kirim lagi.')
        const fin = await supabase.from('submissions')
          .update({ status: 'submitted', ...(sub?.return_note ? { return_note: null } : {}) }).eq('id', row.id)
        if (fin.error) throw fin.error
      }
      if (submit && task.is_group && grp?.isLeader) {
        try { await callApi('/api/group', { action: 'sync', assignment_id: id }) }
        catch { throw new Error('Jawabanmu tersimpan, tapi belum diteruskan ke anggota kelompok. Tekan tombol simpan sekali lagi.') }
      }
      await delPending(uid, id); setPend(null) // sudah di server, salinan di perangkat tidak diperlukan lagi
      setAdded([]); setRemoved([])
      await load()
      setMsg({ ok: true, t: submit ? 'Tugas terkirim ke guru dan tidak bisa diubah lagi.' : 'Jawabanmu tersimpan. Kamu masih bisa mengubahnya sebelum dikirim.' })
    } catch (e) {
      if (isNetError(e)) {
        // Koneksi putus di tengah jalan: jangan sampai jawaban hilang.
        reportNetFailure()
        try {
          await persistLocal(true)
          setMsg({ ok: true, t: 'Koneksi terputus. Jawabanmu aman di perangkat. Setelah internet kembali, tekan "Kirim jawaban".' })
        } catch {
          setMsg({ ok: false, t: 'Koneksi terputus dan jawaban belum bisa disimpan di perangkat. Salin jawabanmu dulu supaya tidak hilang.' })
        }
      } else {
        setMsg({ ok: false, t: /row-level security/.test(e.message)
          ? 'Tugas ini sudah terkunci (sudah dikirim atau sudah dinilai), jadi tidak bisa diubah.' : e.message })
      }
    }
    setBusy(false)
  }

  // Kotak foto untuk satu soal (q) atau seluruh tugas (q = null).
  function photoBox(q, max) {
    const mine = shownPhotos.filter((p) => (p.question_id || null) === q)
    const mineNew = added.filter((a) => a.q === q)
    const n = mine.length + mineNew.length
    return (<>
      <div className="photos">
        {mine.map((p) => (
          <div className="ph" key={p.id}>
            <img src={p.url} alt="Foto jawaban" loading="lazy" decoding="async" />
            {!locked && <button aria-label="Hapus foto" onClick={() => setRemoved([...removed, p])}>×</button>}
          </div>
        ))}
        {mineNew.map((a) => (
          <div className="ph" key={a.url}>
            <img src={a.url} alt="Foto baru" />
            <button aria-label="Hapus foto" onClick={() => setAdded(added.filter((x) => x !== a))}>×</button>
          </div>
        ))}
      </div>
      {!locked && n < max && (
        <div className="picks">
          <label className="btn ghost">Ambil foto<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e, q)} /></label>
          <label className="btn ghost">Pilih dari galeri<input type="file" accept="image/*" multiple hidden onChange={(e) => pick(e, q)} /></label>
        </div>
      )}
      {!locked && <p className="muted">Maksimal {max} foto{q ? ' untuk soal ini' : ''}. Foto diperkecil otomatis sebelum diunggah.</p>}
    </>)
  }

  return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={onBack}>Kembali</button>
    <h2>{task.title}</h2>
    <div className="tags">
      <span className={'chip ' + di.c}>{di.t}</span>
      <span className="chip">{TYPE[task.answer_type]}</span>
    </div>
    {due && (
      <p className={'muted dueline' + (closed ? ' over' : '')}>
        {closed ? 'Waktu pengerjaan berakhir ' : 'Batas pengumpulan: '}<b>{fmtFull(due)}</b>
        {!closed && !graded && !sent ? ` (${relative(due)})` : ''}
        {ext && !closed ? ' · diperpanjang oleh guru' : ''}
      </p>
    )}
    {task.instructions && <p className="instr">{task.instructions}</p>}
    {attach && <a className="btn ghost attach" href={attach} target="_blank" rel="noreferrer">Buka lampiran dari guru</a>}
    {!locked && GUIDE && (
      <div className="howto" role="note">
        <b>{GUIDE[0]}</b>
        <span>{GUIDE[1]}{hasQ ? ' Berlaku untuk setiap soal.' : ''}</span>
        {both && <div className="opts"><span className="opt">Foto</span><i>atau</i><span className="opt">Teks</span><i>(boleh keduanya)</i></div>}
      </div>
    )}

    {task.is_group && (
      <div className="banner">
        {!grp?.group ? 'Ini tugas kelompok, tapi kamu belum dimasukkan ke kelompok. Hubungi gurumu.'
          : grp.isLeader ? `Tugas kelompok ${grp.group.name}. Jawaban yang kamu kirim berlaku untuk semua anggota: ${grp.group.members.join(', ')}.`
          : `Tugas kelompok ${grp.group.name}. Yang mengirim jawaban adalah ketua: ${grp.group.leader_name}.`}
      </div>
    )}
    {!locked && !online && (
      <div className="banner offnote" role="note">
        <b>Kamu sedang offline.</b> Kerjakan seperti biasa, lalu tekan <b>Simpan di perangkat</b>.
        Jawabanmu baru terkirim ke guru setelah internet kembali dan kamu menekan <b>Kirim jawaban</b>.
        {due ? <> Batas pengumpulan tetap berlaku: kirim sebelum <b>{fmtFull(due)}</b>.</> : null}
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
    {sent && !graded && <div className="banner">Tugas sudah dikirim ke guru, jadi tidak bisa diubah lagi. Menunggu dinilai.</div>}
    {closed && !viewer && (
      <div className="banner">
        Waktu pengerjaan sudah berakhir, jadi kamu tidak bisa mengerjakan atau mengirim tugas ini lagi.
        {sub?.return_note ? ' Guru sempat memintamu memperbaikinya, tapi waktunya sudah habis.' : ''} Hubungi gurumu jika perlu tambahan waktu.
      </div>
    )}

    {hasQ ? questions.map((q, i) => (
      <div className="qcard" key={q.id}>
        <QuestionHead n={i + 1} q={q} url={qurls[q.id]} onZoom={setZoom} />
        {!locked && <span className={'qstate' + (answered(q.id) ? ' ok' : '')}>{answered(q.id) ? 'Sudah dijawab' : 'Belum dijawab'}</span>}
        {wantsPhoto && photoBox(q.id, MAX_PER_Q)}
        {both && wantsPhoto && wantsText && <div className="or"><span>atau</span></div>}
        {wantsText && (<>
          <label className="qlabel" htmlFor={'a' + q.id}>{both ? `Ketik jawaban soal ${i + 1}` : `Jawaban soal ${i + 1}`}</label>
          <textarea id={'a' + q.id} rows="4" value={answers[q.id] || ''} disabled={locked}
            onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Ketik jawabanmu di sini" />
        </>)}
      </div>
    )) : (<>
      {wantsPhoto && (<>
        <h3 className="sec">{both ? 'Cara 1: foto jawaban' : 'Foto jawaban'}</h3>
        {sub?.photos_cleaned && <p className="muted">Foto sudah dibersihkan guru untuk menghemat penyimpanan. Nilaimu tetap tersimpan.</p>}
        {photoBox(null, MAX_PHOTOS)}
      </>)}
      {both && wantsPhoto && wantsText && <div className="or"><span>atau</span></div>}
      {wantsText && (<>
        <h3 className="sec">{both ? 'Cara 2: ketik jawaban' : 'Jawaban teks'}</h3>
        <textarea rows="6" value={text} disabled={locked} onChange={(e) => setText(e.target.value)}
          placeholder="Ketik jawabanmu di sini" />
      </>)}
    </>)}
    {hasQ && sub?.photos_cleaned && <p className="muted">Foto jawaban sudah dibersihkan guru untuk menghemat penyimpanan. Nilaimu tetap tersimpan.</p>}
    {zoom && (
      <div className="lightbox" onClick={() => setZoom('')}>
        <img src={zoom} alt="Gambar diperbesar" />
        <button aria-label="Tutup" onClick={() => setZoom('')}>×</button>
      </div>
    )}

    {msg && <div className={msg.ok ? 'ok' : 'err'} role="status">{msg.t}</div>}
    {!locked && <div className={'ready' + (ready ? ' ok' : '')} role="status">{readyText}</div>}
    {!locked && pend && (
      <div className="banner pend" role="status">
        {online
          ? <>Jawaban yang kamu simpan saat offline ({fmtFull(pend.savedAt)}) <b>belum terkirim ke guru</b>. Periksa lagi, lalu tekan <b>Kirim jawaban</b>.</>
          : <>Tersimpan di perangkat ({fmtFull(pend.savedAt)}). Belum terkirim ke guru.</>}
      </div>
    )}
    {!locked && (online ? (
      <div className="picks">
        <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Simpan dulu</button>
        <button className="btn" disabled={busy} onClick={() => save(true)}>{busy ? 'Mengirim...' : pend ? 'Kirim jawaban' : 'Kirim Sekarang'}</button>
      </div>
    ) : (
      <div className="picks">
        <button className="btn" disabled={busy} onClick={saveLocal}>{busy ? 'Menyimpan...' : 'Simpan di perangkat'}</button>
      </div>
    ))}
  </>)
}

export default function StudentTasks({ profile, openId, setOpenId }) {
  return openId
    ? <Detail id={openId} profile={profile} onBack={() => setOpenId(null)} />
    : <List onOpen={setOpenId} profile={profile} />
}

function TaskGrades() {
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

function QuizGrades() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    callApi('/api/quiz', { action: 'grades' }).then((r) => setRows(r.quizzes)).catch((e) => { setErr(e.message); setRows([]) })
  }, [])
  if (rows === null) return <div className="empty">Memuat...</div>
  const shown = rows.filter((r) => !r.hidden)
  const avg = shown.length ? Math.round(shown.reduce((n, r) => n + r.score, 0) / shown.length) : null
  const per = {}
  shown.forEach((r) => { const n = r.subject || 'Tanpa mapel'; (per[n] = per[n] || []).push(r.score) })
  const num = (v) => Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 })
  return (<>
    {err && <div className="err">{err}</div>}
    {avg !== null && <div className="hero hero-quiz"><div><small>Rata-rata nilai quiz</small><h2>{avg}</h2><p>dari {shown.length} quiz</p></div></div>}
    {Object.keys(per).length > 1 && (
      <div className="stats">
        {Object.entries(per).map(([n, v]) => (
          <div className="stat" key={n}><b>{Math.round(v.reduce((a, b) => a + b, 0) / v.length)}</b><span>{n}</span></div>
        ))}
      </div>
    )}
    {!rows.length && !err && <div className="empty">Belum ada quiz yang selesai dikerjakan.</div>}
    {rows.map((r) => (
      <div className="result" key={r.id}>
        <div className="big">{r.hidden ? '?' : num(r.score)}</div>
        <div>
          <b>{r.title}</b>
          {r.subject && <div className="muted">{r.subject}</div>}
          <p className="muted" style={{ marginTop: 4 }}>{r.hidden ? 'Nilai tampil setelah quiz ditutup oleh guru.' : `${r.correct} benar dari ${r.total} soal`}</p>
        </div>
      </div>
    ))}
  </>)
}

export function Grades() {
  const [view, setView] = useState(null) // null = pilih kartu | 'tasks' | 'quiz'
  if (view) return (<>
    <button className="link" style={{ marginTop: 0 }} onClick={() => setView(null)}>Kembali</button>
    <h2>{view === 'tasks' ? 'Nilai Tugas' : 'Nilai Quiz'}</h2>
    {view === 'tasks' ? <TaskGrades /> : <QuizGrades />}
  </>)
  return (<>
    <h2>Nilai</h2>
    <div className="gcards">
      <button className="gcard g-task" onClick={() => setView('tasks')}>
        <span className="gicon"><Icon d={I.tasks} size={28} /></span>
        <span className="gtxt"><b>Nilai Tugas</b><small>Nilai dan komentar dari guru untuk tugasmu</small></span>
        <span className="garrow" aria-hidden="true">›</span>
      </button>
      <button className="gcard g-quiz" onClick={() => setView('quiz')}>
        <span className="gicon"><Icon d={I.quiz} size={28} /></span>
        <span className="gtxt"><b>Nilai Quiz</b><small>Skor dari quiz yang sudah kamu kerjakan</small></span>
        <span className="garrow" aria-hidden="true">›</span>
      </button>
    </div>
  </>)
}
