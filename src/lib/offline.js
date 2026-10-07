// Penyimpanan offline di perangkat (IndexedDB), tanpa library tambahan.
//   kv      : salinan data (daftar tugas, isi tugas, profil terakhir)
//   pending : jawaban yang disimpan saat offline dan belum terkirim (termasuk foto)
//   blobs   : gambar soal, foto jawaban, dan lampiran guru (URL bertanda tangan kedaluwarsa 1 jam,
//             jadi isinya disimpan sendiri)
// Semua kunci diawali id pengguna, sehingga akun lain di perangkat yang sama tidak melihatnya.

const DB = 'tugas-offline'
const STORES = ['kv', 'pending', 'blobs']
let dbp

const open = () => (dbp ||= new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB tidak tersedia'))
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => STORES.forEach((n) => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n) })
  r.onsuccess = () => resolve(r.result)
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
