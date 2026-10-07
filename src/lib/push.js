// Notifikasi push (Web Push) untuk siswa. Berjalan di Chrome, Edge, Firefox, Opera, Samsung Internet,
// dan Safari 16+. Di iPhone/iPad, notifikasi hanya bisa bila aplikasi dipasang ke Layar Utama.
import { callApi } from '../util.js'

const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const registration = () => Promise.race([
  navigator.serviceWorker.ready,
  new Promise((_, rej) => setTimeout(() => rej(new Error('sw')), 4000)),
])

// 'unavailable' | 'ios-install' | 'unsupported' | 'denied' | 'default' | 'off' | 'on'
export async function pushStatus() {
  if (!KEY || !import.meta.env.PROD) return 'unavailable'
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'default'
  try {
    const sub = await (await registration()).pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch { return 'off' }
}

async function subscribeNow(reg) {
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) }) }
    catch (e) {
      // Kunci server berubah: hapus pendaftaran lama lalu daftar ulang.
      const old = await reg.pushManager.getSubscription()
      if (!old) throw e
      await old.unsubscribe()
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) })
    }
  }
  await callApi('/api/push', { action: 'subscribe', sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 200) })
  return sub
}

// Dipanggil dari tombol (harus dari ketukan pengguna). Mengembalikan status baru.
export async function enablePush() {
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default'
  }
  await subscribeNow(await registration())
  return 'on'
}

export async function disablePush() {
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await callApi('/api/push', { action: 'unsubscribe', endpoint }).catch(() => {})
}

// Setiap siswa membuka aplikasi: pastikan perangkat ini terdaftar atas akun yang sedang login.
export async function syncPush() {
  if (!KEY || !import.meta.env.PROD || !supported() || Notification.permission !== 'granted') return
  await subscribeNow(await registration())
}

// Saat keluar dari akun: lepas perangkat ini dari akun tersebut supaya pemberitahuan
// tidak muncul untuk orang berikutnya yang memakai perangkat yang sama.
export async function detachPush() {
  try {
    if (!supported() || !import.meta.env.PROD) return
    const sub = await (await registration()).pushManager.getSubscription()
    if (!sub) return
    await fetch('/api/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
    })
  } catch { /* abaikan */ }
}

export const testPush = () => callApi('/api/push', { action: 'test' })
