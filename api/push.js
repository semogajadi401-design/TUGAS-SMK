import crypto from 'node:crypto'
import webpush from 'web-push'
import { authed, makeAdmin, chunk } from './_auth.js'
import { handleHook, runReminders } from './_push.js'

export const config = { maxDuration: 60 }

// Perlu di Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), PUSH_HOOK_SECRET, CRON_SECRET.
function vapidReady() {
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@sekolah.app', pub, priv)
  return true
}

const same = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Kirim ke semua perangkat milik daftar pengguna. Perangkat yang sudah tidak berlaku (404/410) dihapus.
const makeSender = (admin) => async (userIds, payload) => {
  if (!userIds?.length) return { sent: 0, dead: 0 }
  const rows = []
  for (const part of chunk(userIds, 200)) {
    const { data } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('user_id', part)
    rows.push(...(data || []))
  }
  const body = JSON.stringify(payload)
  const dead = []
  let sent = 0
  for (const part of chunk(rows, 20)) {
    await Promise.all(part.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, body, { TTL: 86400 })
        sent++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(r.id)
      }
    }))
  }
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)
  return { sent, dead: dead.length }
}

export default async function handler(req, res) {
  // 1) Pengingat tenggat harian (Vercel Cron memanggil GET dengan CRON_SECRET).
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET
    if (!secret) return res.status(500).json({ error: 'CRON_SECRET belum diisi di Vercel' })
    if (!same(req.headers.authorization, `Bearer ${secret}`)) return res.status(401).json({ error: 'Tidak diizinkan' })
    const admin = makeAdmin()
    if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY belum diisi di Vercel' })
    if (!vapidReady()) return res.status(500).json({ error: 'Kunci VAPID belum diisi di Vercel' })
    try { return res.json({ ok: true, ...(await runReminders(admin, makeSender(admin))) }) }
    catch (e) { return res.status(500).json({ error: e.message }) }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metode tidak diizinkan' })
  const b = req.body || {}

  // 2) Kejadian dari trigger database: tugas, materi, quiz, atau nilai baru.
  if (req.headers['x-hook-secret'] !== undefined) {
    if (!process.env.PUSH_HOOK_SECRET || !same(req.headers['x-hook-secret'], process.env.PUSH_HOOK_SECRET)) {
      return res.status(401).json({ error: 'Tidak diizinkan' })
    }
    const admin = makeAdmin()
    if (!admin || !vapidReady()) return res.status(500).json({ error: 'Konfigurasi server belum lengkap' })
    try { return res.json({ ok: true, ...(await handleHook(admin, makeSender(admin), b)) }) }
    catch (e) { return res.status(500).json({ error: e.message }) }
  }

  // 3) Lepas perangkat dari akun. Tanpa login: dipakai tepat saat keluar dari akun. Alamat perangkat
  //    (endpoint) panjang dan acak, jadi hanya pemilik perangkat yang mengetahuinya.
  if (b.action === 'unsubscribe') {
    const admin = makeAdmin()
    if (!admin) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY belum diisi di Vercel' })
    if (typeof b.endpoint !== 'string' || b.endpoint.length < 20 || b.endpoint.length > 1000) return res.status(400).json({ error: 'Endpoint tidak valid' })
    await admin.from('push_subscriptions').delete().eq('endpoint', b.endpoint)
    return res.json({ ok: true })
  }

  // 4) Perintah dari siswa yang sedang login.
  const a = await authed(req, res, { teacher: false }); if (!a) return
  const { admin, me } = a

  if (b.action === 'subscribe') {
    const s = b.sub || {}
    const ok = typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length <= 1000
      && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'
    if (!ok) return res.status(400).json({ error: 'Data pendaftaran tidak valid' })
    // endpoint unik: bila perangkat ini sebelumnya milik akun lain, otomatis berpindah ke akun ini.
    const r = await admin.from('push_subscriptions').upsert({
      user_id: me.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
      ua: String(b.ua || '').slice(0, 200), updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' })
    if (r.error) return res.status(500).json({ error: 'Gagal menyimpan: ' + r.error.message + ' (sudah menjalankan supabase/push.sql?)' })
    return res.json({ ok: true })
  }

  if (b.action === 'test') {
    if (!vapidReady()) return res.status(500).json({ error: 'Kunci VAPID belum diisi di Vercel' })
    const r = await makeSender(admin)([me.id], { title: 'Percobaan berhasil', body: 'Pemberitahuan sudah aktif di perangkat ini.', tag: 'test', go: 'tasks' })
    return r.sent ? res.json({ ok: true }) : res.status(404).json({ error: 'Perangkat ini belum terdaftar. Aktifkan pemberitahuan dulu.' })
  }

  return res.status(400).json({ error: 'Perintah tidak dikenal' })
}
