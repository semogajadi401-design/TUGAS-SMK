import * as XLSX from 'xlsx'
import { authed, makeAdmin } from './_auth.js'

export const config = { maxDuration: 60 }
const BUCKET = 'cadangan'
const KEEP = 8
const wib = (d) => (d ? new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '')

async function all(admin, table, select) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(select).order('id').range(from, from + 999)
    if (error) throw new Error(table + ': ' + error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

async function build(admin) {
  const [classes, profs, tasks, subs, subjects] = await Promise.all([
    all(admin, 'classes', 'id,name'),
    all(admin, 'profiles', 'id,full_name,class_id,code,active,role'),
    all(admin, 'assignments', 'id,title,due_at,status,subject_id,assignment_classes(class_id)'),
    all(admin, 'submissions', 'id,assignment_id,student_id,status,score,feedback,submitted_at'),
    all(admin, 'subjects', 'id,name').catch(() => []),
  ])
  const cn = new Map(classes.map((c) => [c.id, c.name]))
  const sn = new Map(subjects.map((s) => [s.id, s.name]))
  const studs = profs.filter((p) => p.role === 'student')
  const stud = new Map(studs.map((s) => [s.id, s]))
  const task = new Map(tasks.map((t) => [t.id, t]))
  const book = XLSX.utils.book_new()
  const add = (name, rows, wch) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = wch.map((w) => ({ wch: w }))
    XLSX.utils.book_append_sheet(book, ws, name)
  }
  add('Siswa', [['Nama', 'Kelas', 'Kode', 'Status'],
    ...studs.map((s) => [s.full_name, cn.get(s.class_id) || '', s.code || '', s.active ? 'Aktif' : 'Nonaktif'])], [32, 12, 14, 10])
  add('Tugas', [['Judul', 'Mapel', 'Kelas', 'Tenggat', 'Status'],
    ...tasks.map((t) => [t.title, sn.get(t.subject_id) || '', t.assignment_classes.map((x) => cn.get(x.class_id)).join(', '), wib(t.due_at), t.status])], [36, 18, 20, 22, 10])
  add('Nilai', [['Nama', 'Kelas', 'Tugas', 'Mapel', 'Status', 'Dikirim', 'Nilai', 'Komentar'],
    ...subs.map((x) => {
      const s = stud.get(x.student_id), t = task.get(x.assignment_id)
      return [s?.full_name || '', cn.get(s?.class_id) || '', t?.title || '', sn.get(t?.subject_id) || '', x.status, wib(x.submitted_at), x.score ?? '', x.feedback || '']
    })], [30, 10, 32, 16, 10, 22, 8, 40])
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
}

const stamp = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

async function saveToStorage(admin) {
  await admin.storage.createBucket(BUCKET, { public: false }).catch(() => {})
  const name = `cadangan-${stamp()}.xlsx`
  const up = await admin.storage.from(BUCKET).upload(name, await build(admin), {
    upsert: true, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  if (up.error) throw new Error(up.error.message)
  const { data } = await admin.storage.from(BUCKET).list('', { limit: 200 })
  const old = (data || []).map((f) => f.name).filter((n) => n.startsWith('cadangan-')).sort().reverse().slice(KEEP)
  if (old.length) await admin.storage.from(BUCKET).remove(old)
  return name
}

export default async function handler(req, res) {
  if (req.method === 'GET') { // dipanggil otomatis oleh Vercel Cron
    const secret = process.env.CRON_SECRET
    if (!secret) return res.status(500).json({ error: 'CRON_SECRET belum diisi di Vercel' })
    if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Tidak diizinkan' })
    const admin = makeAdmin()
    if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY belum diisi di Vercel' })
    try { return res.json({ ok: true, name: await saveToStorage(admin) }) }
    catch (e) { return res.status(500).json({ error: e.message }) }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const a = await authed(req, res); if (!a) return
  const { admin } = a
  const action = req.body?.action
  try {
    if (action === 'download') return res.json({ name: `cadangan-${stamp()}.xlsx`, base64: (await build(admin)).toString('base64') })
    if (action === 'now') return res.json({ ok: true, name: await saveToStorage(admin) })
    if (action === 'list') {
      const { data } = await admin.storage.from(BUCKET).list('', { limit: 200 })
      const names = (data || []).map((f) => f.name).filter((n) => n.startsWith('cadangan-')).sort().reverse()
      const files = []
      for (const name of names) {
        const s = await admin.storage.from(BUCKET).createSignedUrl(name, 3600, { download: name })
        if (s.data) files.push({ name, url: s.data.signedUrl })
      }
      return res.json({ files })
    }
  } catch (e) { return res.status(500).json({ error: e.message }) }
  return res.status(400).json({ error: 'Aksi tidak dikenal' })
}
