// Logika pemberitahuan push (dipisah dari api/push.js supaya bisa diuji tanpa jaringan).
// `send(userIds, payload)` disuntikkan oleh pemanggil.
import { chunk } from './_auth.js'

const HOUR = 3600e3
const tzOffset = () => Number(process.env.REMINDER_TZ_OFFSET ?? 8) * HOUR // 8 = WITA, 7 = WIB, 9 = WIT

async function studentsOfClass(admin, classId) {
  const { data } = await admin.from('profiles').select('id').eq('role', 'student').eq('active', true).eq('class_id', classId)
  return (data || []).map((x) => x.id)
}

// Tiap pemberitahuan hanya boleh terkirim sekali per kunci (mis. menyunting materi menyisipkan ulang
// tautan kelasnya, tapi siswa tidak perlu diberi tahu lagi).
async function once(admin, key) {
  const { error } = await admin.from('push_log').insert({ key })
  return !error
}

// Dipanggil oleh trigger database (supabase/push.sql). Bentuk data sama dengan Database Webhooks Supabase.
export async function handleHook(admin, send, b) {
  const { type, table, record: r = {}, old_record: old = {} } = b || {}

  if (type === 'INSERT' && table === 'assignment_classes') {
    const { data: t } = await admin.from('assignments').select('id,title,status,subjects(name)').eq('id', r.assignment_id).maybeSingle()
    if (!t || t.status !== 'active') return { skipped: 'tugas tidak aktif' }
    if (!(await once(admin, `task:${t.id}:${r.class_id}`))) return { skipped: 'sudah pernah dikirim' }
    const body = t.title + (t.subjects?.name ? ' · ' + t.subjects.name : '')
    return send(await studentsOfClass(admin, r.class_id), { title: 'Tugas baru', body, tag: 'task-' + t.id, go: 'tasks', id: t.id })
  }

  if (type === 'INSERT' && table === 'material_classes') {
    const { data: m } = await admin.from('materials').select('id,title').eq('id', r.material_id).maybeSingle()
    if (!m) return { skipped: 'materi tidak ada' }
    if (!(await once(admin, `material:${m.id}:${r.class_id}`))) return { skipped: 'sudah pernah dikirim' }
    return send(await studentsOfClass(admin, r.class_id), { title: 'Materi baru', body: m.title, tag: 'material-' + m.id, go: 'materials' })
  }

  if (type === 'INSERT' && table === 'quiz_classes') {
    const { data: q } = await admin.from('quizzes').select('id,title,status').eq('id', r.quiz_id).maybeSingle()
    if (!q || q.status !== 'published') return { skipped: 'quiz belum diterbitkan' }
    if (!(await once(admin, `quiz:${q.id}:${r.class_id}`))) return { skipped: 'sudah pernah dikirim' }
    return send(await studentsOfClass(admin, r.class_id), { title: 'Quiz baru', body: q.title, tag: 'quiz-' + q.id, go: 'quiz' })
  }

  // Nilai tugas keluar untuk pertama kalinya (mengubah nilai yang sudah ada tidak memicu pemberitahuan).
  if (type === 'UPDATE' && table === 'submissions' && r.score != null && old.score == null && r.student_id) {
    const { data: t } = await admin.from('assignments').select('title').eq('id', r.assignment_id).maybeSingle()
    if (!(await once(admin, `grade:${r.id}`))) return { skipped: 'sudah pernah dikirim' }
    return send([r.student_id], { title: 'Nilai baru', body: `Nilai tugas "${t?.title || ''}" sudah keluar.`, tag: 'grade-' + r.assignment_id, go: 'grades' })
  }

  return { skipped: 'bukan kejadian yang dipantau' }
}

const pad = (n) => String(n).padStart(2, '0')

// Pengingat harian: tugas yang berakhir hari ini atau besok (waktu setempat) dan belum dikirim siswa.
export async function runReminders(admin, send, now = new Date()) {
  const off = tzOffset()
  const local = new Date(now.getTime() + off) // "jam dinding" setempat, dibaca lewat getUTC*
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const end = new Date(today + 2 * 864e5 - off) // awal lusa setempat
  const dayKey = `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}`

  const { data: tasks, error } = await admin.from('assignments')
    .select('id,title,due_at,assignment_classes(class_id)').eq('status', 'active')
    .gt('due_at', now.toISOString()).lt('due_at', end.toISOString())
  if (error) throw new Error('assignments: ' + error.message)
  if (!tasks?.length) return { tasks: 0, students: 0, sent: 0 }

  const ids = tasks.map((t) => t.id)
  const classIds = [...new Set(tasks.flatMap((t) => (t.assignment_classes || []).map((c) => c.class_id)))]
  const [studs, subs, exts] = await Promise.all([
    admin.from('profiles').select('id,class_id').eq('role', 'student').eq('active', true).in('class_id', classIds),
    admin.from('submissions').select('assignment_id,student_id').eq('status', 'submitted').in('assignment_id', ids),
    admin.from('task_extensions').select('assignment_id,student_id,due_at').in('assignment_id', ids),
  ])
  const done = new Set((subs.data || []).map((x) => `${x.assignment_id}:${x.student_id}`))
  const ext = new Map((exts.data || []).map((x) => [`${x.assignment_id}:${x.student_id}`, x.due_at]))

  const perStudent = new Map()
  for (const s of studs.data || []) {
    for (const t of tasks) {
      if (!(t.assignment_classes || []).some((c) => c.class_id === s.class_id)) continue
      const k = `${t.id}:${s.id}`
      if (done.has(k)) continue
      const due = new Date(ext.get(k) || t.due_at)
      if (due <= now || due >= end) continue // perpanjangan guru membuat tenggatnya di luar jendela pengingat
      if (!perStudent.has(s.id)) perStudent.set(s.id, [])
      perStudent.get(s.id).push({ id: t.id, title: t.title, due })
    }
  }

  const label = (due) => {
    const l = new Date(due.getTime() + off)
    const d = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())
    return `${d === today ? 'hari ini' : 'besok'} pukul ${pad(l.getUTCHours())}.${pad(l.getUTCMinutes())}`
  }

  let sent = 0
  for (const part of chunk([...perStudent.entries()], 10)) {
    await Promise.all(part.map(async ([sid, list]) => {
      if (!(await once(admin, `remind:${dayKey}:${sid}`))) return
      list.sort((a, b) => a.due - b.due)
      const body = list.length === 1
        ? `"${list[0].title}" berakhir ${label(list[0].due)}.`
        : `${list.length} tugas belum dikirim dan segera berakhir: ${list.slice(0, 2).map((x) => x.title).join(', ')}${list.length > 2 ? ' dan lainnya' : ''}.`
      const r = await send([sid], { title: 'Pengingat tenggat', body, tag: 'reminder', go: 'tasks', id: list.length === 1 ? list[0].id : '' })
      sent += r?.sent || 0
    }))
  }

  // Bersihkan catatan lama.
  await admin.from('push_log').delete().lt('at', new Date(now.getTime() - 90 * 864e5).toISOString())
  return { tasks: tasks.length, students: perStudent.size, sent }
}
