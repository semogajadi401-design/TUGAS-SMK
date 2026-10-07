// Penyimpanan offline di perangkat (IndexedDB), tanpa library tambahan.
//   kv      : salinan data (daftar tugas, isi tugas, profil terakhir)
//   pending : jawaban yang disimpan saat offline dan belum terkirim (termasuk foto)
//   blobs   : gambar soal, foto jawaban, dan lampiran guru (URL bertanda tangan kedaluwarsa 1 jam,
//             jadi isinya disimpan sendiri)
//   auth    : data masuk offline siswa (hash PBKDF2 password + profil), TIDAK ikut terhapus saat keluar akun
// Semua kunci diawali id pengguna, sehingga akun lain di perangkat yang sama tidak melihatnya.

const DB = 'tugas-offline'
const STORES = ['kv', 'pending', 'blobs', 'auth']
let dbp

const open = () => (dbp ||= new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB tidak tersedia'))
  const r = indexedDB.open(DB, 2)
  r.onupgradeneeded = () => STORES.forEach((n) => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n) })
  r.onsuccess = () => {
    // Tab lain yang membuka versi baru tidak boleh terblokir oleh koneksi lama ini.
    r.result.onversionchange = () => { r.result.close(); dbp = undefined }
    resolve(r.result)
  }
  r.onerror = () => { dbp = undefined; reject(r.error) }
}))

async function run(store, mode, fn) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Penyimpanan perangkat penuh atau dibatalkan'))
  })
}

const get = (s, k) => run(s, 'readonly', (o) => o.get(k)).catch(() => undefined)
const put = (s, k, v) => run(s, 'readwrite', (o) => o.put(v, k))
const del = (s, k) => run(s, 'readwrite', (o) => o.delete(k)).catch(() => {})
const clear = (s) => run(s, 'readwrite', (o) => o.clear()).catch(() => {})

// Semua [kunci, nilai] yang kuncinya diawali `prefix`.
async function range(store, prefix) {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const out = []
      const req = db.transaction(store, 'readonly').objectStore(store)
        .openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'))
      req.onsuccess = () => {
        const c = req.result
        if (c) { out.push([c.key, c.value]); c.continue() } else resolve(out)
      }
      req.onerror = () => reject(req.error)
    })
  } catch { return [] }
}

// ---- salinan data -------------------------------------------------------
export const putCache = (uid, key, value) => put('kv', `${uid}:${key}`, value).catch(() => {})
export const getCache = (uid, key) => get('kv', `${uid}:${key}`)
export const cachedTaskIds = async (uid) =>
  new Set((await range('kv', `${uid}:task:`)).map(([k]) => k.slice(`${uid}:task:`.length)))

// Profil terakhir yang berhasil dimuat (untuk membuka aplikasi saat offline).
export const saveLastProfile = (p) => put('kv', 'last-profile', p).catch(() => {})
export const loadLastProfile = () => get('kv', 'last-profile')

// ---- jawaban yang belum terkirim ---------------------------------------
// Bentuk: { taskId, title, text, answers, photos: [{ q, blob, ready }], removedIds, savedAt }
export const savePending = (uid, taskId, rec) => put('pending', `${uid}:${taskId}`, { ...rec, taskId })
export const getPending = (uid, taskId) => get('pending', `${uid}:${taskId}`)
export const delPending = (uid, taskId) => del('pending', `${uid}:${taskId}`)
export const listPending = async (uid) =>
  (await range('pending', `${uid}:`)).map(([, v]) => v).sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0))

// ---- gambar dan lampiran -----------------------------------------------
const bkey = (bucket, path) => `${bucket}:${path}`

// Unduh isi file dari URL bertanda tangan lalu simpan, supaya tetap terbuka saat offline.
export async function cacheBlob(bucket, path, url, maxBytes = 8e6) {
  try {
    if (!path || !url || await get('blobs', bkey(bucket, path))) return
    const r = await fetch(url)
    if (!r.ok) return
    const b = await r.blob()
    if (b.size <= maxBytes) await put('blobs', bkey(bucket, path), b)
  } catch { /* gagal menyimpan salinan bukan masalah besar */ }
}

export async function blobUrl(bucket, path) {
  const b = await get('blobs', bkey(bucket, path))
  return b ? URL.createObjectURL(b) : ''
}

// Saat keluar dari akun: hapus salinan data dan gambar. Jawaban yang belum terkirim
// TIDAK dihapus; hanya akun pemiliknya yang bisa melihatnya lagi saat masuk kembali.
export async function wipeCaches() {
  await Promise.all([clear('kv'), clear('blobs')])
}

// ---- masuk offline (khusus siswa) --------------------------------------
// Setelah siswa berhasil masuk ONLINE, password disimpan sebagai hash PBKDF2 (bukan teks asli) bersama
// profilnya. Saat offline, password yang diketik dicocokkan dengan hash itu, lalu aplikasi dibuka dengan
// profil tersimpan. Aturan:
//   - hanya siswa; guru selalu butuh internet
//   - berlaku OFFLINE_LOGIN_DAYS hari sejak terakhir masuk/ganti password secara online
//   - 5 kali salah berturut-turut = terkunci 5 menit
//   - dihapus bila akun dinonaktifkan (saat terdeteksi online)
// Ubah ke false bila data tugas offline harus dibersihkan setiap kali siswa keluar akun
// (konsekuensinya: setelah keluar akun, masuk offline berikutnya akan menampilkan data kosong).
export const KEEP_OFFLINE_ON_LOGOUT = true
export const OFFLINE_LOGIN_DAYS = 30
const ITER = 150000
const MAX_FAILS = 5
const LOCK_MS = 5 * 60 * 1000

const enc = new TextEncoder()
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
const canHash = () => typeof crypto !== 'undefined' && !!crypto.subtle
const akey = (email) => String(email || '').trim().toLowerCase()

async function derive(pw, saltHex, iter) {
  const salt = Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16))
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256))
}
const same = (a, b) => { // perbandingan waktu-konstan
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// Password hasil login online disimpan sementara di memori sampai profil berhasil dimuat.
let staged = null
export const stageLogin = (email, pw) => { staged = { email: akey(email), pw } }
export const dropStagedLogin = () => { staged = null }

export async function saveOfflineLogin(email, pw, profile) {
  if (!canHash() || !profile) return
  try {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
    const hash = await derive(pw, salt, ITER)
    await put('auth', akey(email), {
      email: akey(email), uid: profile.id, salt, iter: ITER, hash,
      profile, savedAt: Date.now(), fails: 0, lockUntil: 0,
    })
  } catch { /* gagal menyimpan data masuk offline bukan masalah besar */ }
}

// Dipanggil setiap profil berhasil dimuat dari server. Bila baru saja masuk dengan password,
// simpan data masuk offline; bila tidak, cukup perbarui profil yang tersimpan.
export async function commitLogin(profile) {
  const s = staged; staged = null
  if (!profile || profile.role !== 'student' || !profile.active) return
  if (s) return saveOfflineLogin(s.email, s.pw, profile)
  try {
    for (const [k, rec] of await range('auth', '')) {
      if (rec.uid === profile.id) await put('auth', k, { ...rec, profile })
    }
  } catch { /* abaikan */ }
}

export async function forgetOfflineLogin(uid) {
  try {
    for (const [k, rec] of await range('auth', '')) if (rec.uid === uid) await del('auth', k)
  } catch { /* abaikan */ }
}

// Hasil: { ok:true, profile, uid } atau { ok:false, reason: 'none'|'wrong'|'locked'|'expired'|'inactive', left?, wait? }
export async function offlineLogin(email, pw) {
  const k = akey(email)
  const rec = await get('auth', k)
  if (!rec || !canHash()) return { ok: false, reason: 'none' }
  const now = Date.now()
  if (rec.lockUntil > now) return { ok: false, reason: 'locked', wait: Math.ceil((rec.lockUntil - now) / 60000) }
  if (now - rec.savedAt > OFFLINE_LOGIN_DAYS * 864e5) return { ok: false, reason: 'expired' }
  if (!rec.profile?.active) return { ok: false, reason: 'inactive' }

  // Sama seperti login online: password diketik apa adanya, atau versi huruf besar.
  let match = false
  for (const c of new Set([pw, pw.toUpperCase()])) {
    if (same(await derive(c, rec.salt, rec.iter), rec.hash)) match = true
  }
  if (!match) {
    const fails = (rec.fails || 0) + 1
    const lock = fails >= MAX_FAILS
    await put('auth', k, { ...rec, fails: lock ? 0 : fails, lockUntil: lock ? now + LOCK_MS : 0 }).catch(() => {})
    return lock
      ? { ok: false, reason: 'locked', wait: Math.ceil(LOCK_MS / 60000) }
      : { ok: false, reason: 'wrong', left: MAX_FAILS - fails }
  }
  if (rec.fails || rec.lockUntil) await put('auth', k, { ...rec, fails: 0, lockUntil: 0 }).catch(() => {})
  return { ok: true, profile: rec.profile, uid: rec.uid }
}
