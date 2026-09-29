import { createClient } from '@supabase/supabase-js'

export function makeAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const sk = process.env.SUPABASE_SERVICE_KEY
  if (!url || !sk) return null
  return createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Mengembalikan { admin, me } atau null (respons error sudah dikirim).
export async function authed(req, res, { teacher = true } = {}) {
  const admin = makeAdmin()
  if (!admin) { res.status(500).json({ error: 'SUPABASE_SERVICE_KEY belum diisi di Vercel' }); return null }
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  const { data: u } = await admin.auth.getUser(token)
  if (!u?.user) { res.status(401).json({ error: 'Belum login' }); return null }
  const { data: me } = await admin.from('profiles').select('id,role,active,full_name').eq('id', u.user.id).maybeSingle()
  if (!me?.active || (teacher && me.role !== 'teacher')) { res.status(403).json({ error: 'Tidak diizinkan' }); return null }
  return { admin, me }
}

export const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
export const chunk = (arr, n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
