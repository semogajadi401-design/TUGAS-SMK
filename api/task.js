import { authed, clean, chunk } from './_auth.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const a = await authed(req, res); if (!a) return
  const { admin } = a
  const b = req.body || {}
  if (!b.id) return res.status(400).json({ error: 'ID tugas kosong' })
  const { data: t } = await admin.from('assignments').select('id,attachment_path,questions').eq('id', b.id).maybeSingle()
  if (!t) return res.status(404).json({ error: 'Tugas tidak ditemukan' })
  const fail = (e, m) => res.status(500).json({ error: m + ': ' + (e.message || e) })

  if (b.action === 'update') {
    const title = clean(b.title)
    if (!title) return res.status(400).json({ error: 'Judul wajib diisi' })
    if (!['photo', 'text', 'both'].includes(b.answer_type)) return res.status(400).json({ error: 'Jenis jawaban tidak valid' })
    if (!Array.isArray(b.class_ids) || !b.class_ids.length) return res.status(400).json({ error: 'Pilih minimal satu kelas' })
    const patch = {
      title, answer_type: b.answer_type, subject_id: b.subject_id || null,
      instructions: clean(b.instructions) ? String(b.instructions).trim() : null,
      due_at: b.due_at ? new Date(b.due_at).toISOString() : null,
    }
    if (b.attachment_path) patch.attachment_path = b.attachment_path
    let newQs
    if (Array.isArray(b.questions)) {
      newQs = b.questions.slice(0, 50).map((q) => ({
        id: String(q.id || ''), text: String(q.text || '').trim().slice(0, 4000),
        image_path: typeof q.image_path === 'string' && q.image_path ? q.image_path : null,
      })).filter((q) => q.id && (q.text || q.image_path))
      patch.questions = newQs.length ? newQs : null
    }
    const u = await admin.from('assignments').update(patch).eq('id', t.id)
    if (u.error) return fail(u.error, 'Gagal menyimpan')
    await admin.from('assignment_classes').delete().eq('assignment_id', t.id)
    const i = await admin.from('assignment_classes').insert(b.class_ids.map((class_id) => ({ assignment_id: t.id, class_id })))
    if (i.error) return fail(i.error, 'Gagal menyimpan kelas')
    if (b.attachment_path && t.attachment_path && t.attachment_path !== b.attachment_path)
      await admin.storage.from('lampiran').remove([t.attachment_path])
    if (newQs) {
      // Hapus gambar soal lama yang sudah tidak dipakai.
      const keep = new Set(newQs.map((q) => q.image_path).filter(Boolean))
      const gone = (t.questions || []).map((q) => q.image_path).filter((p) => p && !keep.has(p))
      if (gone.length) await admin.storage.from('lampiran').remove(gone)
    }
    return res.json({ ok: true })
  }

  if (b.action === 'delete') {
    const { data: subs } = await admin.from('submissions').select('id').eq('assignment_id', t.id)
    const ids = (subs || []).map((s) => s.id)
    const paths = []
    for (const part of chunk(ids)) {
      const { data } = await admin.from('submission_photos').select('path').in('submission_id', part)
      paths.push(...(data || []).map((p) => p.path))
    }
    for (const part of chunk([...new Set(paths)])) await admin.storage.from('jawaban').remove(part)
    for (const part of chunk(ids)) await admin.from('submission_photos').delete().in('submission_id', part)
    await admin.from('submissions').delete().eq('assignment_id', t.id)
    await admin.from('task_group_members').delete().eq('assignment_id', t.id)
    await admin.from('task_groups').delete().eq('assignment_id', t.id)
    await admin.from('assignment_classes').delete().eq('assignment_id', t.id)
    const d = await admin.from('assignments').delete().eq('id', t.id)
    if (d.error) return fail(d.error, 'Gagal menghapus')
    const files = [t.attachment_path, ...(t.questions || []).map((q) => q.image_path)].filter(Boolean)
    if (files.length) await admin.storage.from('lampiran').remove(files)
    return res.json({ ok: true })
  }

  return res.status(400).json({ error: 'Aksi tidak dikenal' })
}
