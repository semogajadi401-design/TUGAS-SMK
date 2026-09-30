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
    // Simpan tugas dan baca daftar kelas lama BERSAMAAN, lalu ubah hanya kelas yang berbeda.
    const [u, cur] = await Promise.all([
      admin.from('assignments').update(patch).eq('id', t.id),
      admin.from('assignment_classes').select('class_id').eq('assignment_id', t.id),
    ])
    if (u.error) return fail(u.error, 'Gagal menyimpan')
    if (cur.error) return fail(cur.error, 'Gagal membaca kelas')
    const want = [...new Set(b.class_ids)]
    const have = new Set((cur.data || []).map((x) => x.class_id))
    const add = want.filter((c) => !have.has(c))
    const del = [...have].filter((c) => !want.includes(c))
    const classJobs = [
      del.length ? admin.from('assignment_classes').delete().eq('assignment_id', t.id).in('class_id', del) : null,
      add.length ? admin.from('assignment_classes').insert(add.map((class_id) => ({ assignment_id: t.id, class_id }))) : null,
    ].filter(Boolean)
    // Hapus file lama yang tidak dipakai lagi, juga bersamaan.
    const fileJobs = []
    if (b.attachment_path && t.attachment_path && t.attachment_path !== b.attachment_path)
      fileJobs.push(admin.storage.from('lampiran').remove([t.attachment_path]))
    if (newQs) {
      const keep = new Set(newQs.map((q) => q.image_path).filter(Boolean))
      const gone = (t.questions || []).map((q) => q.image_path).filter((p) => p && !keep.has(p))
      if (gone.length) fileJobs.push(admin.storage.from('lampiran').remove(gone))
    }
    const [classRes] = await Promise.all([Promise.all(classJobs), Promise.all(fileJobs)])
    const ce = classRes.find((r) => r?.error)
    if (ce) return fail(ce.error, 'Gagal menyimpan kelas')
    return res.json({ ok: true })
  }

  if (b.action === 'delete') {
    const { data: subs } = await admin.from('submissions').select('id').eq('assignment_id', t.id)
    const ids = (subs || []).map((s) => s.id)
    const rs = await Promise.all(chunk(ids).map((part) => admin.from('submission_photos').select('path').in('submission_id', part)))
    const paths = rs.flatMap((r) => (r.data || []).map((p) => p.path))
    await Promise.all(chunk([...new Set(paths)]).map((part) => admin.storage.from('jawaban').remove(part)))
    await Promise.all(chunk(ids).map((part) => admin.from('submission_photos').delete().in('submission_id', part)))
    await admin.from('submissions').delete().eq('assignment_id', t.id)
    await Promise.all([
      admin.from('task_group_members').delete().eq('assignment_id', t.id),
      admin.from('task_groups').delete().eq('assignment_id', t.id),
      admin.from('assignment_classes').delete().eq('assignment_id', t.id),
    ])
    const d = await admin.from('assignments').delete().eq('id', t.id)
    if (d.error) return fail(d.error, 'Gagal menghapus')
    const files = [t.attachment_path, ...(t.questions || []).map((q) => q.image_path)].filter(Boolean)
    if (files.length) await admin.storage.from('lampiran').remove(files)
    return res.json({ ok: true })
  }

  return res.status(400).json({ error: 'Aksi tidak dikenal' })
}
