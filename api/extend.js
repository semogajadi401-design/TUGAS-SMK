import { authed, chunk } from './_auth.js'

// POST /api/extend  (khusus guru)
// { action: 'set', assignment_id, student_ids: [...], due_at }
// Memberi perpanjangan waktu per siswa. Untuk tugas kelompok, seluruh anggota kelompok ikut diperpanjang.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const a = await authed(req, res); if (!a) return
  const { admin } = a
  const b = req.body || {}
  if (b.action !== 'set') return res.status(400).json({ error: 'Aksi tidak dikenal' })

  const aid = b.assignment_id
  const d = new Date(b.due_at)
  if (!aid || isNaN(d)) return res.status(400).json({ error: 'Data perpanjangan tidak lengkap' })
  if (d <= new Date()) return res.status(400).json({ error: 'Waktu perpanjangan harus di masa depan' })
  if (d - Date.now() > 366 * 864e5) return res.status(400).json({ error: 'Perpanjangan terlalu jauh (maksimal 1 tahun)' })

  let ids = [...new Set((Array.isArray(b.student_ids) ? b.student_ids : []).map(String))].slice(0, 1000)
  if (!ids.length) return res.status(400).json({ error: 'Pilih minimal satu siswa' })

  const { data: t } = await admin.from('assignments').select('id,is_group').eq('id', aid).maybeSingle()
  if (!t) return res.status(404).json({ error: 'Tugas tidak ditemukan' })

  if (t.is_group) {
    const { data: mine } = await admin.from('task_group_members').select('group_id').eq('assignment_id', aid).in('student_id', ids)
    const gids = [...new Set((mine || []).map((x) => x.group_id))]
    if (gids.length) {
      const { data: all } = await admin.from('task_group_members').select('student_id').in('group_id', gids)
      ids = [...new Set([...ids, ...(all || []).map((x) => x.student_id)])]
    }
  }

  const rows = ids.map((student_id) => ({ assignment_id: aid, student_id, due_at: d.toISOString() }))
  for (const part of chunk(rows)) {
    const { error } = await admin.from('task_extensions').upsert(part, { onConflict: 'assignment_id,student_id' })
    if (error) return res.status(500).json({ error: 'Gagal menyimpan perpanjangan: ' + error.message })
  }
  return res.json({ ok: true, n: rows.length, due_at: d.toISOString() })
}
