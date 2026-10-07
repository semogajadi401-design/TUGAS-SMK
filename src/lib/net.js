// Status koneksi untuk seluruh aplikasi.
// navigator.onLine sering salah (Wi-Fi tersambung tapi tanpa internet), jadi hasilnya
// dicek ulang dengan permintaan kecil ke /version.json, dan kegagalan nyata saat
// menyimpan/mengirim ikut menandai aplikasi sebagai offline.
import { useSyncExternalStore } from 'react'

let online = typeof navigator === 'undefined' ? true : navigator.onLine
const subs = new Set()
let timer = null
let started = false

const emit = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }

// Ada respons dari server (apa pun kode HTTP-nya) = internet hidup.
export async function probe() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 5000)
  try {
    await fetch('/version.json?p=' + Date.now(), { cache: 'no-store', signal: ctl.signal })
    return true
  } catch { return false } finally { clearTimeout(t) }
}

// Selama offline, cek tiap 8 detik apakah internet sudah kembali.
function ensureTimer() {
  if (online && timer) { clearInterval(timer); timer = null }
  if (!online && !timer) timer = setInterval(async () => { if (await probe()) set(true) }, 8000)
}

function set(v) {
  if (v !== online) { online = v; emit() }
  ensureTimer()
}

export const getOnline = () => online

// Dipanggil saat permintaan ke server gagal karena jaringan (walau navigator.onLine bilang online).
export const reportNetFailure = () => set(false)

export const isNetError = (e) => !!e && (e.net === true ||
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(String(e.message || e)))

export function initNet() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('offline', () => set(false))
  window.addEventListener('online', async () => set(await probe()))
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && !online) set(await probe())
  })
  ensureTimer()
}

export const useOnline = () => useSyncExternalStore(subscribe, () => online, () => true)
