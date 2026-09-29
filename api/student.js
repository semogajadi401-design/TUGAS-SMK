import { createClient } from '@supabase/supabase-js'

// Aksi guru terhadap satu siswa: reset password, aktif/nonaktif, ubah nama/kelas.
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
  if (me?.role !== 'teacher' || !me.active) return res.status(403).json({ error: 'Hanya guru yang boleh melakukan ini' })

  const { id, action, value, nama, kelas } = req.body || {}
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID siswa kosong' })
  const { data: st } = await admin.from('profiles').select('id,role,code').eq('id', id).maybeSingle()
  if (!st || st.role !== 'student') return res.status(404).json({ error: 'Siswa tidak ditemukan' })

  const fail = (e, msg) => res.status(500).json({ error: msg + ': ' + e.message })

  if (action === 'reset') {
    if (!st.code) return res.status(400).json({ error: 'Siswa ini tidak punya kode awal' })
    const { error } = await admin.auth.admin.updateUserById(id, { password: st.code })
    if (error) return fail(error, 'Gagal reset password')
    await admin.from('profiles').update({ password_changed: false }).eq('id', id)
    return res.json({ ok: true })
  }

  if (action === 'active') {
    const active = value === true
    const { error } = await admin.from('profiles').update({ active }).eq('id', id)
    if (error) return fail(error, 'Gagal mengubah status')
    await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' })
    return res.json({ ok: true })
  }

  if (action === 'update') {
    const n = String(nama ?? '').replace(/\s+/g, ' ').trim()
    const k = String(kelas ?? '').replace(/\s+/g, ' ').trim()
    if (!n || !k) return res.status(400).json({ error: 'Nama dan kelas wajib diisi' })
    const { data: cls } = await admin.from('classes').select('id,name')
    let cid = (cls || []).find((c) => c.name.toLowerCase() === k.toLowerCase())?.id
    if (!cid) {
      const { data, error } = await admin.from('classes').insert({ name: k }).select('id').single()
      if (error) return fail(error, 'Gagal membuat kelas')
      cid = data.id
    }
    const { error } = await admin.from('profiles').update({ full_name: n, class_id: cid }).eq('id', id)
    if (error) return fail(error, 'Gagal menyimpan')
    return res.json({ ok: true })
  }

  return res.status(400).json({ error: 'Aksi tidak dikenal' })
}
