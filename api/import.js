import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'

export const config = { maxDuration: 60 }

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const gen = () => Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join('')
const key = (n, k) => `${n.trim().toLowerCase()}|${k.trim().toLowerCase()}`

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
  if (me?.role !== 'teacher' || !me.active) return res.status(403).json({ error: 'Hanya guru yang boleh mengimpor' })

  const { rows = [], dryRun = true } = req.body || {}
  const { data: classes } = await admin.from('classes').select('id,name')
  const { data: studs } = await admin.from('profiles').select('full_name,class_id,code').eq('role', 'student')
  const classByName = new Map((classes || []).map((c) => [c.name.toLowerCase(), c.id]))
  const nameById = new Map((classes || []).map((c) => [c.id, c.name]))
  const usedCodes = new Set((studs || []).map((s) => s.code).filter(Boolean))
  const seen = new Set((studs || []).map((s) => key(s.full_name, nameById.get(s.class_id) || '')))

  const out = rows.map((r) => {
    const o = { ...r, status: 'ok', reason: '' }
    if (seen.has(key(r.nama, r.kelas))) return { ...o, status: 'skip', reason: 'Sudah terdaftar (nama dan kelas sama)' }
    if (r.kode && usedCodes.has(r.kode)) return { ...o, status: 'error', reason: 'Kode sudah dipakai siswa lain' }
    seen.add(key(r.nama, r.kelas))
    if (r.kode) usedCodes.add(r.kode)
    else if (!dryRun) {
      let c = gen(); while (usedCodes.has(c)) c = gen()
      usedCodes.add(c); o.kode = c
    }
    return o
  })
  if (dryRun) return res.json({ rows: out })

  const todo = out.filter((o) => o.status === 'ok')
  for (const k of [...new Set(todo.map((o) => o.kelas))]) {
    if (classByName.has(k.toLowerCase())) continue
    const { data, error } = await admin.from('classes').insert({ name: k }).select('id').single()
    if (error) return res.status(500).json({ error: 'Gagal membuat kelas ' + k + ': ' + error.message })
    classByName.set(k.toLowerCase(), data.id)
  }

  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (o) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `${o.kode.toLowerCase()}@sekolah.app`, password: o.kode, email_confirm: true,
      })
      if (error) { o.status = 'error'; o.reason = error.message; return }
      const { error: e2 } = await admin.from('profiles').insert({
        id: data.user.id, full_name: o.nama, role: 'student',
        class_id: classByName.get(o.kelas.toLowerCase()), code: o.kode,
      })
      if (e2) { await admin.auth.admin.deleteUser(data.user.id); o.status = 'error'; o.reason = e2.message }
      else o.status = 'created'
    }))
  }
  res.json({ rows: out })
}
