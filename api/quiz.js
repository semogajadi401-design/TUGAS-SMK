import { authed, chunk } from './_auth.js'
import { randomUUID } from 'node:crypto'

export const config = { maxDuration: 30 }

const GRACE_MS = 45000 // toleransi jaringan setelah waktu habis
const QGRACE_MS = 4000 // toleransi jaringan untuk jawaban per soal

const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}
const iso = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString() }
const ts = (v) => (v ? new Date(v).getTime() : null)

// Batas akhir mengerjakan, dan tidak boleh melewati waktu tutup quiz.
// Mode baru: waktu per soal (question_seconds) x jumlah soal. Mode lama: durasi total (duration_min).
function deadlineOf(quiz, at) {
  const ends = []
  const n = Array.isArray(at.order) ? at.order.length : 0
  if (quiz.question_seconds && n) ends.push(ts(at.started_at) + n * quiz.question_seconds * 1000)
  else if (quiz.duration_min) ends.push(ts(at.started_at) + quiz.duration_min * 60000)
  if (quiz.close_at) ends.push(ts(quiz.close_at))
  return ends.length ? Math.min(...ends) : null
}
const isExpired = (quiz, at, now) => { const d = deadlineOf(quiz, at); return d !== null && now > d + GRACE_MS }

// Mode waktu per soal: soal ke-k (urutan siswa ini) hanya bisa dijawab/diubah selama jendela waktunya
// [mulai + k*S, mulai + (k+1)*S]. Jawaban untuk soal yang jendelanya sudah tutup diabaikan (dicek di server).
function openAnswers(quiz, at, incoming, now) {
  const S = quiz.question_seconds
  if (!S) return incoming
  const start = ts(at.started_at)
  const out = {}
  ;(Array.isArray(at.order) ? at.order : []).forEach((id, k) => {
    if (id in incoming && now <= start + (k + 1) * S * 1000 + QGRACE_MS) out[id] = incoming[id]
  })
  return out
}

async function inChunks(admin, table, cols, col, ids) {
  const out = []
  for (const part of chunk(ids)) {
    const { data } = await admin.from(table).select(cols).in(col, part)
    out.push(...(data || []))
  }
  return out
}

// Hanya simpan jawaban untuk soal yang memang ada di quiz, dengan indeks opsi yang valid.
function cleanAnswers(raw, qs) {
  const out = {}
  for (const q of qs) {
    const v = raw?.[q.id]
    if (Number.isInteger(v) && v >= 0 && v < q.options.length) out[q.id] = v
  }
  return out
}

async function grade(admin, quizId, answers) {
  const { data: qs } = await admin.from('quiz_questions').select('id,points').eq('quiz_id', quizId)
  const list = qs || []
  const keys = await inChunks(admin, 'quiz_keys', 'question_id,correct', 'question_id', list.map((q) => q.id))
  const key = new Map(keys.map((k) => [k.question_id, k.correct]))
  const per = {}
  let right = 0, got = 0, max = 0
  for (const q of list) {
    const ok = answers?.[q.id] === key.get(q.id)
    per[q.id] = ok; max += q.points
    if (ok) { right++; got += q.points }
  }
  return { per, right, total: list.length, score: max ? Math.round((got / max) * 10000) / 100 : 0 }
}

async function finish(admin, at, answers) {
  const g = await grade(admin, at.quiz_id, answers)
  const { data, error } = await admin.from('quiz_attempts').update({
    finished_at: new Date().toISOString(), answers, per_question: g.per,
    correct_count: g.right, total: g.total, score: g.score,
  }).eq('id', at.id).is('finished_at', null).select('*').maybeSingle()
  if (error) throw error
  if (data) return data
  return (await admin.from('quiz_attempts').select('*').eq('id', at.id).maybeSingle()).data
}

// Yang boleh dilihat siswa: benar/salah per nomor + skor. TANPA pilihan siswa, TANPA kunci jawaban.
function resultView(quiz, at, now) {
  if (quiz.reveal === 'close' && !(quiz.close_at && now > ts(quiz.close_at)))
    return { done: true, hidden: true, message: 'Hasil akan tampil setelah quiz ditutup oleh guru.' }
  const order = Array.isArray(at.order) ? at.order : Object.keys(at.per_question || {})
  return {
    done: true, hidden: false, score: at.score, correct: at.correct_count, total: at.total,
    items: order.map((id, i) => ({ n: i + 1, ok: at.per_question?.[id] === true })),
  }
}

function parseQuestions(arr) {
  if (!Array.isArray(arr) || !arr.length) return { error: 'Tambahkan minimal satu soal' }
  if (arr.length > 100) return { error: 'Maksimal 100 soal per quiz' }
  const rows = []
  for (const [i, q] of arr.entries()) {
    const text = String(q?.text || '').trim().slice(0, 4000)
    const image_path = typeof q?.image_path === 'string' && q.image_path ? q.image_path : null
    const options = (Array.isArray(q?.options) ? q.options : []).map((o) => String(o ?? '').trim().slice(0, 500))
    if (!text && !image_path) return { error: `Soal ${i + 1}: isi teks atau gambar` }
    if (options.length < 2 || options.length > 6 || options.some((o) => !o)) return { error: `Soal ${i + 1}: butuh 2-6 opsi dan semuanya harus terisi` }
    const correct = Number(q?.correct)
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return { error: `Soal ${i + 1}: pilih jawaban yang benar` }
    const points = Math.min(100, Math.max(1, parseInt(q?.points) || 1))
    rows.push({ id: randomUUID(), position: i, text: text || null, image_path, options, points, correct })
  }
  return { rows }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  try {
    const a = await authed(req, res, { teacher: false }); if (!a) return
    const { admin, me } = a
    const b = req.body || {}
    const now = Date.now()
    const fail = (e, m) => res.status(500).json({ error: m + ': ' + (e?.message || e) })
    const bad = (code, msg, extra = {}) => res.status(code).json({ error: msg, ...extra })

    // ===================================== GURU =====================================
    if (me.role === 'teacher') {
      if (b.action === 'list') {
        const { data: qs, error } = await admin.from('quizzes')
          .select('id,title,status,duration_min,question_seconds,open_at,close_at,reveal,shuffle,created_at,subjects(name)')
          .order('created_at', { ascending: false })
        if (error) return fail(error, 'Gagal memuat quiz')
        const ids = (qs || []).map((q) => q.id)
        const cls = await inChunks(admin, 'quiz_classes', 'quiz_id,classes(name)', 'quiz_id', ids)
        const qn = await inChunks(admin, 'quiz_questions', 'quiz_id', 'quiz_id', ids)
        const at = await inChunks(admin, 'quiz_attempts', 'quiz_id,finished_at', 'quiz_id', ids)
        return res.json({
          quizzes: (qs || []).map((q) => ({
            ...q, subject: q.subjects?.name || '', subjects: undefined,
            classes: cls.filter((c) => c.quiz_id === q.id).map((c) => c.classes?.name).filter(Boolean),
            n_questions: qn.filter((x) => x.quiz_id === q.id).length,
            n_started: at.filter((x) => x.quiz_id === q.id).length,
            n_finished: at.filter((x) => x.quiz_id === q.id && x.finished_at).length,
          })),
        })
      }

      if (b.action === 'get') {
        if (!b.id) return bad(400, 'ID quiz kosong')
        const { data: quiz } = await admin.from('quizzes').select('*').eq('id', b.id).maybeSingle()
        if (!quiz) return bad(404, 'Quiz tidak ditemukan')
        const { data: cl } = await admin.from('quiz_classes').select('class_id').eq('quiz_id', quiz.id)
        const { data: qs } = await admin.from('quiz_questions').select('id,position,text,image_path,options,points').eq('quiz_id', quiz.id).order('position')
        const keys = await inChunks(admin, 'quiz_keys', 'question_id,correct', 'question_id', (qs || []).map((q) => q.id))
        const key = new Map(keys.map((k) => [k.question_id, k.correct]))
        const { count } = await admin.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('quiz_id', quiz.id)
        return res.json({
          quiz, class_ids: (cl || []).map((c) => c.class_id), locked: (count || 0) > 0,
          questions: (qs || []).map((q) => ({ ...q, correct: key.get(q.id) ?? 0 })),
        })
      }

      if (b.action === 'save') {
        const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 200)
        if (!title) return bad(400, 'Judul wajib diisi')
        if (!Array.isArray(b.class_ids) || !b.class_ids.length) return bad(400, 'Pilih minimal satu kelas')
        const reveal = b.reveal === 'close' ? 'close' : 'submit'
        const status = b.status === 'draft' ? 'draft' : 'published'
        const open_at = iso(b.open_at), close_at = iso(b.close_at)
        if (open_at && close_at && ts(close_at) <= ts(open_at)) return bad(400, 'Waktu tutup harus setelah waktu buka')
        if (reveal === 'close' && !close_at) return bad(400, 'Untuk "tampilkan hasil setelah quiz ditutup", waktu tutup wajib diisi')
        const qsec = b.question_seconds === '' || b.question_seconds == null ? null : parseInt(b.question_seconds)
        if (qsec !== null && (!Number.isInteger(qsec) || qsec < 5 || qsec > 600)) return bad(400, 'Waktu per soal harus 5-600 detik')

        let parsed = null
        if (b.questions !== undefined) {
          parsed = parseQuestions(b.questions)
          if (parsed.error) return bad(400, parsed.error)
        }

        const patch = {
          title, subject_id: b.subject_id || null,
          instructions: String(b.instructions || '').trim() ? String(b.instructions).trim().slice(0, 4000) : null,
          duration_min: null, question_seconds: qsec, open_at, close_at, reveal, status, shuffle: b.shuffle !== false,
        }

        let quizId = b.id, oldImages = []
        if (quizId) {
          const { data: ex } = await admin.from('quizzes').select('id,question_seconds').eq('id', quizId).maybeSingle()
          if (!ex) return bad(404, 'Quiz tidak ditemukan')
          const { count } = await admin.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('quiz_id', quizId)
          if (count > 0 && (ex.question_seconds ?? null) !== qsec) return bad(409, 'Quiz ini sudah dikerjakan siswa, jadi waktu per soal tidak bisa diubah.')
          if (parsed) {
            if (count > 0) return bad(409, 'Quiz ini sudah dikerjakan siswa, jadi soalnya tidak bisa diubah. Hapus hasil siswa dulu, atau buat quiz baru.')
            const { data: old } = await admin.from('quiz_questions').select('image_path').eq('quiz_id', quizId)
            oldImages = (old || []).map((q) => q.image_path).filter(Boolean)
          }
          const u = await admin.from('quizzes').update(patch).eq('id', quizId)
          if (u.error) return fail(u.error, 'Gagal menyimpan quiz')
        } else {
          if (!parsed) return bad(400, 'Tambahkan minimal satu soal')
          const ins = await admin.from('quizzes').insert({ ...patch, created_by: me.id }).select('id').single()
          if (ins.error) return fail(ins.error, 'Gagal menyimpan quiz')
          quizId = ins.data.id
        }

        await admin.from('quiz_classes').delete().eq('quiz_id', quizId)
        const ci = await admin.from('quiz_classes').insert([...new Set(b.class_ids)].map((class_id) => ({ quiz_id: quizId, class_id })))
        if (ci.error) return fail(ci.error, 'Gagal menyimpan kelas')

        if (parsed) {
          await admin.from('quiz_questions').delete().eq('quiz_id', quizId) // kunci ikut terhapus (cascade)
          const qi = await admin.from('quiz_questions').insert(parsed.rows.map((r) => ({
            id: r.id, quiz_id: quizId, position: r.position, text: r.text, image_path: r.image_path, options: r.options, points: r.points,
          })))
          if (qi.error) return fail(qi.error, 'Gagal menyimpan soal')
          const ki = await admin.from('quiz_keys').insert(parsed.rows.map((r) => ({ question_id: r.id, correct: r.correct })))
          if (ki.error) return fail(ki.error, 'Gagal menyimpan kunci jawaban')
          const keep = new Set(parsed.rows.map((r) => r.image_path).filter(Boolean))
          const gone = oldImages.filter((p) => !keep.has(p))
          if (gone.length) await admin.storage.from('lampiran').remove(gone)
        }
        return res.json({ ok: true, id: quizId })
      }

      if (b.action === 'delete') {
        if (!b.id) return bad(400, 'ID quiz kosong')
        const { data: old } = await admin.from('quiz_questions').select('image_path').eq('quiz_id', b.id)
        const d = await admin.from('quizzes').delete().eq('id', b.id)
        if (d.error) return fail(d.error, 'Gagal menghapus quiz')
        const paths = [...new Set((old || []).map((q) => q.image_path).filter(Boolean))]
        for (const part of chunk(paths)) await admin.storage.from('lampiran').remove(part)
        return res.json({ ok: true })
      }

      if (b.action === 'results') {
        if (!b.id) return bad(400, 'ID quiz kosong')
        const { data: quiz } = await admin.from('quizzes').select('id,title').eq('id', b.id).maybeSingle()
        if (!quiz) return bad(404, 'Quiz tidak ditemukan')
        const { data: cl } = await admin.from('quiz_classes').select('class_id').eq('quiz_id', quiz.id)
        const cids = (cl || []).map((c) => c.class_id)
        const { data: st } = cids.length
          ? await admin.from('profiles').select('id,full_name,classes(name)').eq('role', 'student').eq('active', true).in('class_id', cids).order('full_name')
          : { data: [] }
        const { data: ats } = await admin.from('quiz_attempts').select('student_id,started_at,finished_at,correct_count,total,score,per_question').eq('quiz_id', quiz.id)
        const byStudent = new Map((ats || []).map((x) => [x.student_id, x]))
        const rows = (st || []).map((s) => {
          const x = byStudent.get(s.id)
          return {
            student_id: s.id, name: s.full_name, kelas: s.classes?.name || '',
            status: !x ? 'belum' : x.finished_at ? 'selesai' : 'mengerjakan',
            score: x?.finished_at ? x.score : null, correct: x?.correct_count ?? null, total: x?.total ?? null,
            finished_at: x?.finished_at || null,
          }
        })
        // Analisis butir soal: berapa persen siswa yang menjawab benar tiap soal.
        const { data: qs } = await admin.from('quiz_questions').select('id,position,text').eq('quiz_id', quiz.id).order('position')
        const done = (ats || []).filter((x) => x.finished_at)
        const stats = (qs || []).map((q) => ({
          n: q.position + 1, text: (q.text || '(soal bergambar)').slice(0, 80),
          pct: done.length ? Math.round((done.filter((x) => x.per_question?.[q.id] === true).length / done.length) * 100) : null,
        }))
        return res.json({ quiz, rows, stats })
      }

      if (b.action === 'reset') { // hapus hasil satu siswa supaya boleh mengulang
        if (!b.id || !b.student_id) return bad(400, 'Data tidak lengkap')
        const d = await admin.from('quiz_attempts').delete().eq('quiz_id', b.id).eq('student_id', b.student_id)
        if (d.error) return fail(d.error, 'Gagal menghapus hasil')
        return res.json({ ok: true })
      }

      return bad(400, 'Aksi tidak dikenal')
    }

    // ===================================== SISWA =====================================
    const { data: prof } = await admin.from('profiles').select('class_id').eq('id', me.id).maybeSingle()
    const classId = prof?.class_id

    async function studentQuiz(id) {
      if (!id || !classId) return null
      const { data: link } = await admin.from('quiz_classes').select('quiz_id').eq('quiz_id', id).eq('class_id', classId).maybeSingle()
      if (!link) return null
      const { data: q } = await admin.from('quizzes').select('*').eq('id', id).eq('status', 'published').maybeSingle()
      return q || null
    }
    const myAttempt = async (quizId) =>
      (await admin.from('quiz_attempts').select('*').eq('quiz_id', quizId).eq('student_id', me.id).maybeSingle()).data

    if (b.action === 'list') {
      if (!classId) return res.json({ quizzes: [] })
      const { data: cl } = await admin.from('quiz_classes').select('quiz_id').eq('class_id', classId)
      const ids = (cl || []).map((c) => c.quiz_id)
      const qs = await inChunks(admin, 'quizzes', 'id,title,instructions,duration_min,question_seconds,open_at,close_at,reveal,status,subjects(name)', 'id', ids)
      const pub = qs.filter((q) => q.status === 'published')
      const pids = pub.map((q) => q.id)
      const qn = await inChunks(admin, 'quiz_questions', 'quiz_id', 'quiz_id', pids)
      const { data: mine } = pids.length
        ? await admin.from('quiz_attempts').select('*').eq('student_id', me.id).in('quiz_id', pids)
        : { data: [] }
      const out = []
      for (const q of pub) {
        let at = (mine || []).find((x) => x.quiz_id === q.id) || null
        if (at && !at.finished_at && isExpired(q, at, now)) at = await finish(admin, at, at.answers || {}) // waktu habis sebelum dikirim
        const state = q.open_at && now < ts(q.open_at) ? 'upcoming' : q.close_at && now > ts(q.close_at) ? 'closed' : 'open'
        out.push({
          id: q.id, title: q.title, subject: q.subjects?.name || '', instructions: q.instructions,
          duration_min: q.duration_min, question_seconds: q.question_seconds, open_at: q.open_at, close_at: q.close_at,
          n_questions: qn.filter((x) => x.quiz_id === q.id).length,
          state, attempt: !at ? 'none' : at.finished_at ? 'done' : 'progress',
          result_ready: !!at?.finished_at && !resultView(q, at, now).hidden,
        })
      }
      out.sort((x, y) => (y.open_at || '').localeCompare(x.open_at || ''))
      return res.json({ quizzes: out })
    }

    // Penanda "terakhir dilihat" (dipakai badge angka merah). Ditulis lewat server supaya pasti tersimpan.
    if (b.action === 'seen') {
      const kind = String(b.kind || '')
      if (!['tasks', 'materials', 'grades', 'quiz'].includes(kind)) return bad(400, 'Jenis penanda tidak valid')
      const r = await admin.from('seen_marks').upsert({ user_id: me.id, kind, seen_at: new Date().toISOString() }, { onConflict: 'user_id,kind' })
      if (r.error) return fail(r.error, 'Gagal menyimpan penanda')
      return res.json({ ok: true })
    }

    // Quiz baru: terbit sejak terakhir siswa membuka menu Quiz, belum dikerjakan, dan belum ditutup.
    if (b.action === 'news') {
      const none = { count: 0, titles: [] }
      if (!classId) return res.json(none)
      const { data: mk } = await admin.from('seen_marks').select('seen_at').eq('user_id', me.id).eq('kind', 'quiz').maybeSingle()
      if (!mk) { // pertama kali: quiz yang sudah ada dianggap sudah dilihat
        await admin.from('seen_marks').upsert({ user_id: me.id, kind: 'quiz', seen_at: new Date().toISOString() }, { onConflict: 'user_id,kind' })
        return res.json(none)
      }
      const since = ts(mk.seen_at)
      const { data: cl } = await admin.from('quiz_classes').select('quiz_id').eq('class_id', classId)
      const qs = await inChunks(admin, 'quizzes', 'id,title,created_at,status,close_at', 'id', (cl || []).map((c) => c.quiz_id))
      const { data: mine } = await admin.from('quiz_attempts').select('quiz_id').eq('student_id', me.id)
      const tried = new Set((mine || []).map((x) => x.quiz_id))
      const fresh = qs
        .filter((q) => q.status === 'published' && ts(q.created_at) > since && !tried.has(q.id) && !(q.close_at && now > ts(q.close_at)))
        .sort((x, y) => ts(y.created_at) - ts(x.created_at))
      return res.json({ count: fresh.length, titles: fresh.slice(0, 3).map((q) => q.title) })
    }

    if (b.action === 'grades') { // daftar nilai quiz milik siswa yang sedang login
      const { data: mine } = await admin.from('quiz_attempts').select('*').eq('student_id', me.id)
      const ids = (mine || []).map((x) => x.quiz_id)
      const qs = await inChunks(admin, 'quizzes', 'id,title,close_at,reveal,status,duration_min,question_seconds,open_at,subjects(name)', 'id', ids)
      const out = []
      for (const q of qs) {
        if (q.status !== 'published') continue
        let at = (mine || []).find((x) => x.quiz_id === q.id)
        if (!at) continue
        if (!at.finished_at && isExpired(q, at, now)) at = await finish(admin, at, at.answers || {})
        if (!at?.finished_at) continue // masih dikerjakan
        const hidden = resultView(q, at, now).hidden
        out.push({
          id: q.id, title: q.title, subject: q.subjects?.name || '', finished_at: at.finished_at, hidden,
          ...(hidden ? {} : { score: Number(at.score), correct: at.correct_count, total: at.total }),
        })
      }
      out.sort((x, y) => String(y.finished_at).localeCompare(String(x.finished_at)))
      return res.json({ quizzes: out })
    }

    if (b.action === 'start') {
      const quiz = await studentQuiz(b.id)
      if (!quiz) return bad(404, 'Quiz tidak ditemukan')
      let at = await myAttempt(quiz.id)
      if (at?.finished_at) return res.json(resultView(quiz, at, now))
      if (at && isExpired(quiz, at, now)) { at = await finish(admin, at, at.answers || {}); return res.json(resultView(quiz, at, now)) }

      if (!at) {
        if (quiz.open_at && now < ts(quiz.open_at)) return bad(403, 'Quiz belum dibuka')
        if (quiz.close_at && now > ts(quiz.close_at)) return bad(403, 'Quiz sudah ditutup')
        const { data: ids } = await admin.from('quiz_questions').select('id').eq('quiz_id', quiz.id).order('position')
        if (!ids?.length) return bad(400, 'Quiz ini belum punya soal')
        const order = quiz.shuffle ? shuffle(ids.map((x) => x.id)) : ids.map((x) => x.id)
        const ins = await admin.from('quiz_attempts').insert({
          quiz_id: quiz.id, student_id: me.id, started_at: new Date().toISOString(), order, answers: {},
        }).select('*').single()
        if (ins.error) {
          at = await myAttempt(quiz.id) // dua permintaan bersamaan: pakai yang sudah ada
          if (!at) return fail(ins.error, 'Gagal memulai quiz')
        } else at = ins.data
      }

      const { data: qs } = await admin.from('quiz_questions').select('id,text,image_path,options').eq('quiz_id', quiz.id)
      const byId = new Map((qs || []).map((q) => [q.id, q]))
      const ordered = (Array.isArray(at.order) ? at.order : []).map((id) => byId.get(id)).filter(Boolean)
      const withImg = ordered.filter((q) => q.image_path)
      const urls = new Map()
      if (withImg.length) {
        const { data: su } = await admin.storage.from('lampiran').createSignedUrls(withImg.map((q) => q.image_path), 3600)
        withImg.forEach((q, i) => { if (su?.[i]?.signedUrl) urls.set(q.id, su[i].signedUrl) })
      }
      const d = deadlineOf(quiz, at)
      return res.json({
        done: false,
        quiz: { id: quiz.id, title: quiz.title, instructions: quiz.instructions, duration_min: quiz.duration_min },
        question_seconds: quiz.question_seconds || null,
        started_at: at.started_at,
        deadline: d ? new Date(d).toISOString() : null,
        server_now: new Date(now).toISOString(),
        answers: at.answers || {},
        questions: ordered.map((q) => ({ id: q.id, text: q.text, image_url: urls.get(q.id) || null, options: q.options })), // tanpa kunci
      })
    }

    if (b.action === 'save' || b.action === 'submit') {
      const quiz = await studentQuiz(b.id)
      if (!quiz) return bad(404, 'Quiz tidak ditemukan')
      const at = await myAttempt(quiz.id)
      if (!at) return bad(404, 'Kamu belum memulai quiz ini')
      if (at.finished_at) return res.json(resultView(quiz, at, now))
      const late = isExpired(quiz, at, now)

      if (b.action === 'save') { // simpan otomatis berkala, supaya jawaban tidak hilang saat koneksi putus
        if (late) return bad(403, 'Waktu sudah habis', { expired: true })
        const { data: qs } = await admin.from('quiz_questions').select('id,options').eq('quiz_id', quiz.id)
        const merged = { ...(at.answers || {}), ...openAnswers(quiz, at, cleanAnswers(b.answers, qs || []), now) }
        const u = await admin.from('quiz_attempts').update({ answers: merged }).eq('id', at.id).is('finished_at', null)
        if (u.error) return fail(u.error, 'Gagal menyimpan jawaban')
        return res.json({ ok: true })
      }

      // submit: lewat batas waktu + toleransi -> hanya jawaban yang sudah tersimpan sebelum waktu habis yang dihitung
      let answers = at.answers || {}
      if (!late) {
        const { data: qs } = await admin.from('quiz_questions').select('id,options').eq('quiz_id', quiz.id)
        answers = { ...answers, ...openAnswers(quiz, at, cleanAnswers(b.answers, qs || []), now) }
      }
      const done = await finish(admin, at, answers)
      return res.json(resultView(quiz, done, now))
    }

    if (b.action === 'result') {
      const quiz = await studentQuiz(b.id)
      if (!quiz) return bad(404, 'Quiz tidak ditemukan')
      let at = await myAttempt(quiz.id)
      if (!at) return bad(404, 'Kamu belum mengerjakan quiz ini')
      if (!at.finished_at) {
        if (!isExpired(quiz, at, now)) return bad(409, 'Quiz belum selesai dikerjakan')
        at = await finish(admin, at, at.answers || {})
      }
      return res.json(resultView(quiz, at, now))
    }

    return bad(400, 'Aksi tidak dikenal')
  } catch (e) {
    return res.status(500).json({ error: 'Kesalahan server: ' + (e?.message || e) })
  }
}
