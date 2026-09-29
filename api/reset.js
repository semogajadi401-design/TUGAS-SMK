import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

// Item yang otomatis ikut terpilih (karena datanya saling bergantung).
const NEEDS = { submissions: ['photos', 'scores'], assignments: ['submissions'], students: ['submissions', 'quizresults'], quizzes: ['quizresults'] }
const expand = (list) => {
  const s = new Set(list)
  for (let ch = true; ch;) { ch = false; for (const k of [...s]) for (const n of NEEDS[k] || []) if (!s.has(n)) { s.add(n); ch = true } }
  return s
}
const ALL = ['scores', 'photos', 'submissions', 'assignments', 'quizresults', 'quizzes', 'materials', 'passwords', 'students', 'classes', 'subjects']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const sk = process.env.SUPABASE_SERVICE_KEY
  if (!url || !sk) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY belum diisi di Vercel' })

  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } })
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(token)
  if (!u?.user) return res.status(401).json({ error: 'Belum login' })
  const { data: me } = await admin.from('profiles').select('role,active').eq('id', u.user.id).maybeSingle()
  if (me?.role !== 'teacher' || !me.active) return res.status(403).json({ error: 'Hanya guru yang boleh mereset data' })

  const { items, confirm } = req.body || {}
  if (confirm !== 'RESET') return res.status(400).json({ error: 'Konfirmasi salah. Ketik RESET.' })
  if (!Array.isArray(items) || !items.length || items.some((k) => !ALL.includes(k)))
    return res.status(400).json({ error: 'Pilih minimal satu data yang valid' })
  const want = expand(items)

  const done = {}, errors = []
  const step = async (key, fn) => {
    try { done[key] = await fn() } catch (e) { errors.push(`${key}: ${e.message || e}`) }
  }
  const ok = ({ error }) => { if (error) throw error }
  const any = (table, col = 'id') => admin.from(table).delete({ count: 'exact' }).not(col, 'is', null)
  const removeFiles = async (bucket, paths) => {
    for (let i = 0; i < paths.length; i += 100) ok(await admin.storage.from(bucket).remove(paths.slice(i, i + 100)))
  }

  if (want.has('scores') && !want.has('submissions'))
    await step('scores', async () => {
      const r = await admin.from('submissions').update({ score: null, feedback: null }, { count: 'exact' }).not('id', 'is', null)
      ok(r); return r.count ?? 0
    })

  if (want.has('photos'))
    await step('photos', async () => {
      const { data, error } = await admin.from('submission_photos').select('path')
      if (error) throw error
      await removeFiles('jawaban', (data || []).map((p) => p.path))
      ok(await any('submission_photos'))
      if (!want.has('submissions')) ok(await admin.from('submissions').update({ photos_cleaned: true }).not('id', 'is', null))
      return (data || []).length
    })

  if (want.has('submissions'))
    await step('submissions', async () => { const r = await any('submissions'); ok(r); return r.count ?? 0 })

  if (want.has('assignments'))
    await step('assignments', async () => {
      const { data, error } = await admin.from('assignments').select('attachment_path,questions')
      if (error) throw error
      await removeFiles('lampiran', (data || []).flatMap((a) => [a.attachment_path, ...(a.questions || []).map((q) => q.image_path)]).filter(Boolean))
      ok(await any('assignment_classes', 'assignment_id'))
      const r = await any('assignments'); ok(r); return r.count ?? 0
    })

  if (want.has('quizresults'))
    await step('quizresults', async () => { const r = await any('quiz_attempts'); ok(r); return r.count ?? 0 })

  if (want.has('quizzes'))
    await step('quizzes', async () => {
      const { data, error } = await admin.from('quiz_questions').select('image_path')
      if (error) throw error
      await removeFiles('lampiran', (data || []).map((q) => q.image_path).filter(Boolean))
      // soal, kunci jawaban, dan kelas quiz ikut terhapus otomatis (cascade)
      const r = await any('quizzes'); ok(r); return r.count ?? 0
    })

  if (want.has('materials'))
    await step('materials', async () => {
      const { data, error } = await admin.from('materials').select('file_path')
      if (error) throw error
      await removeFiles('materi', (data || []).map((m) => m.file_path).filter(Boolean))
      ok(await any('material_classes', 'material_id'))
      const r = await any('materials'); ok(r); return r.count ?? 0
    })

  if (want.has('passwords') && !want.has('students'))
    await step('passwords', async () => {
      const { data, error } = await admin.from('profiles').select('id,code').eq('role', 'student').eq('active', true)
      if (error) throw error
      const list = (data || []).filter((s) => s.code)
      let n = 0
      for (let i = 0; i < list.length; i += 10)
        await Promise.all(list.slice(i, i + 10).map(async (s) => {
          const r = await admin.auth.admin.updateUserById(s.id, { password: s.code })
          if (!r.error) { await admin.from('profiles').update({ password_changed: false }).eq('id', s.id); n++ }
        }))
      return n
    })

  if (want.has('students'))
    await step('students', async () => {
      const { data, error } = await admin.from('profiles').select('id').eq('role', 'student')
      if (error) throw error
      const ids = (data || []).map((s) => s.id)
      for (let i = 0; i < ids.length; i += 10)
        await Promise.all(ids.slice(i, i + 10).map((id) => admin.auth.admin.deleteUser(id)))
      await admin.from('profiles').delete().eq('role', 'student')
      for (let i = 0; i < ids.length; i += 100) await admin.from('seen_marks').delete().in('user_id', ids.slice(i, i + 100))
      return ids.length
    })

  if (want.has('classes'))
    await step('classes', async () => {
      ok(await admin.from('profiles').update({ class_id: null }).eq('role', 'student'))
      ok(await any('assignment_classes', 'assignment_id'))
      ok(await any('quiz_classes', 'quiz_id'))
      ok(await any('material_classes', 'material_id'))
      const r = await any('classes'); ok(r); return r.count ?? 0
    })

  if (want.has('subjects'))
    await step('subjects', async () => { const r = await any('subjects'); ok(r); return r.count ?? 0 })

  res.status(errors.length ? 207 : 200).json({ done, errors })
}
