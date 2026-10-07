import { authed, chunk } from './_auth.js'

// Progres pengumpulan tugas teman sekelas (khusus siswa).
// Yang dikirim ke siswa HANYA nama dan status. Nilai, jawaban, foto, dan catatan guru tidak pernah ikut.
//   POST { assignment_id }  ->  { kelas, total, done: [{n,me}], back: [{n,me}], todo: [{n,me}] }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const a = await authed(req, res, { teacher: false }); if (!a) return
  const { admin, me } = a
  if (me.role !== 'student') return res.status(403).json({ error: 'Tidak diizinkan' })

  const aid = req.body?.assignment_id
  if (!aid) return res.status(400).json({ error: 'ID tugas kosong' })
  const fail = (e) => res.status(500).json({ error: 'Gagal memuat: ' + (e.message || e) })

  const { data: mine, error: e0 } = await admin.from('profiles').select('class_id,classes(name)').eq('id', me.id).maybeSingle()
  if (e0) return fail(e0)
  if (!mine?.class_id) return res.status(403).json({ error: 'Kamu belum masuk ke kelas mana pun' })

  // Tugas harus memang diberikan ke kelas siswa ini.
  const { data: ac, error: e1 } = await admin.from('assignment_classes').select('class_id')
    .eq('assignment_id', aid).eq('class_id', mine.class_id).maybeSingle()
  if (e1) return fail(e1)
  if (!ac) return res.status(403).json({ error: 'Tugas ini bukan untuk kelasmu' })

  const { data: st, error: e2 } = await admin.from('profiles').select('id,full_name')
    .eq('role', 'student').eq('active', true).eq('class_id', mine.class_id).order('full_name')
  if (e2) return fail(e2)
  const ids = (st || []).map((s) => s.id)

  const subs = new Map()
  for (const part of chunk(ids, 100)) {
    const { data, error } = await admin.from('submissions').select('student_id,status,score,return_note')
      .eq('assignment_id', aid).in('student_id', part)
    if (error) return fail(error)
    for (const x of data || []) subs.set(x.student_id, x)
  }

  // Aturan status sama dengan daftar tugas siswa: dinilai atau terkirim = sudah mengumpulkan;
  // dikembalikan guru (ada catatan perbaikan, belum dikirim ulang) = dikembalikan; selain itu belum.
  const out = { done: [], back: [], todo: [] }
  for (const s of st || []) {
    const x = subs.get(s.id)
    const k = x && (x.score != null || x.status === 'submitted') ? 'done' : x?.return_note ? 'back' : 'todo'
    out[k].push({ n: s.full_name, me: s.id === me.id })
  }
  res.setHeader('Cache-Control', 'no-store')
  return res.json({ kelas: mine.classes?.name || '', total: ids.length, ...out })
}
