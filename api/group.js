import { authed, clean } from './_auth.js'
import { randomUUID } from 'node:crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const a = await authed(req, res, { teacher: false }); if (!a) return
  const { admin, me } = a
  const b = req.body || {}
  const aid = b.assignment_id
  if (!aid) return res.status(400).json({ error: 'ID tugas kosong' })
  const teacher = me.role === 'teacher'
  const fail = (e, m) => res.status(500).json({ error: m + ': ' + (e.message || e) })

  if (b.action === 'list' && teacher) {
    const { data: ac } = await admin.from('assignment_classes').select('class_id').eq('assignment_id', aid)
    const cids = (ac || []).map((x) => x.class_id)
    const { data: st } = cids.length
      ? await admin.from('profiles').select('id,full_name,classes(name)').eq('role', 'student').eq('active', true).in('class_id', cids).order('full_name')
      : { data: [] }
    const { data: gs } = await admin.from('task_groups').select('id,name,leader_id').eq('assignment_id', aid)
    const { data: ms } = await admin.from('task_group_members').select('group_id,student_id').eq('assignment_id', aid)
    return res.json({
      students: (st || []).map((s) => ({ id: s.id, name: s.full_name, kelas: s.classes?.name || '' })),
      groups: (gs || []).map((g) => ({ ...g, members: (ms || []).filter((m) => m.group_id === g.id).map((m) => m.student_id) })),
    })
  }

  if (b.action === 'save' && teacher) {
    const seen = new Set(), rows = []
    for (const [i, g] of (Array.isArray(b.groups) ? b.groups : []).entries()) {
      const members = [...new Set(Array.isArray(g.members) ? g.members : [])]
      if (!members.length) continue
      for (const m of members) { if (seen.has(m)) return res.status(400).json({ error: 'Satu siswa tidak boleh ada di dua kelompok' }); seen.add(m) }
      rows.push({ id: randomUUID(), name: clean(g.name) || `Kelompok ${i + 1}`, members, leader: members.includes(g.leader_id) ? g.leader_id : members[0] })
    }
    await admin.from('task_group_members').delete().eq('assignment_id', aid)
    await admin.from('task_groups').delete().eq('assignment_id', aid)
    if (rows.length) {
      const g = await admin.from('task_groups').insert(rows.map((r) => ({ id: r.id, assignment_id: aid, name: r.name, leader_id: r.leader })))
      if (g.error) return fail(g.error, 'Gagal menyimpan kelompok')
      const m = await admin.from('task_group_members').insert(rows.flatMap((r) => r.members.map((student_id) => ({ group_id: r.id, assignment_id: aid, student_id }))))
      if (m.error) return fail(m.error, 'Gagal menyimpan anggota')
    }
    return res.json({ ok: true, groups: rows.length })
  }

  if (me.role !== 'student') return res.status(403).json({ error: 'Tidak diizinkan' })
  const { data: mem } = await admin.from('task_group_members').select('group_id').eq('assignment_id', aid).eq('student_id', me.id).maybeSingle()

  if (b.action === 'mine') {
    if (!mem) return res.json({ group: null, isLeader: false })
    const { data: g } = await admin.from('task_groups').select('id,name,leader_id').eq('id', mem.group_id).maybeSingle()
    const { data: ms } = await admin.from('task_group_members').select('student_id').eq('group_id', mem.group_id)
    const { data: ps } = await admin.from('profiles').select('id,full_name').in('id', (ms || []).map((m) => m.student_id))
    const nm = new Map((ps || []).map((p) => [p.id, p.full_name]))
    return res.json({
      isLeader: g?.leader_id === me.id,
      group: { name: g?.name, leader_name: nm.get(g?.leader_id) || '', members: (ms || []).map((m) => nm.get(m.student_id)).filter(Boolean) },
    })
  }

  if (b.action === 'sync') {
    if (!mem) return res.status(403).json({ error: 'Kamu tidak ada di kelompok ini' })
    const { data: g } = await admin.from('task_groups').select('id,leader_id').eq('id', mem.group_id).maybeSingle()
    if (g?.leader_id !== me.id) return res.status(403).json({ error: 'Hanya ketua kelompok yang bisa mengirim' })
    const { data: mine } = await admin.from('submissions').select('id,text_answer,status,submitted_at').eq('assignment_id', aid).eq('student_id', me.id).maybeSingle()
    if (!mine || mine.status !== 'submitted') return res.json({ ok: true, skipped: true })
    const { data: photos } = await admin.from('submission_photos').select('path').eq('submission_id', mine.id)
    const { data: ms } = await admin.from('task_group_members').select('student_id').eq('group_id', g.id)
    let n = 0
    for (const { student_id } of (ms || []).filter((m) => m.student_id !== me.id)) {
      const { data: cur } = await admin.from('submissions').select('id,score').eq('assignment_id', aid).eq('student_id', student_id).maybeSingle()
      if (cur?.score != null) continue
      const up = await admin.from('submissions').upsert(
        { assignment_id: aid, student_id, text_answer: mine.text_answer, status: 'submitted', submitted_at: mine.submitted_at, return_note: null },
        { onConflict: 'assignment_id,student_id' }).select('id').single()
      if (up.error) return fail(up.error, 'Gagal meneruskan ke anggota')
      await admin.from('submission_photos').delete().eq('submission_id', up.data.id)
      if (photos?.length) await admin.from('submission_photos').insert(photos.map((p) => ({ submission_id: up.data.id, path: p.path })))
      n++
    }
    return res.json({ ok: true, members: n })
  }

  return res.status(400).json({ error: 'Aksi tidak dikenal' })
}
