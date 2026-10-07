/* Service worker aplikasi. Dibuat otomatis saat build (vite.config.js): __BUILD_ID__
 * - Menyimpan kerangka aplikasi supaya bisa dibuka tanpa internet.
 * - Menerima dan menampilkan notifikasi push.
 * Data (tugas, jawaban) TIDAK lewat sini: itu disimpan aplikasi sendiri di IndexedDB. */
const BUILD_TS = __BUILD_TS__
const SHELL = 'shell-' + BUILD_TS
const PRECACHE = __PRECACHE__

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL)
    await c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))) // gagal satu = pemasangan dibatalkan, versi lama tetap jalan
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Simpan 2 generasi terakhir supaya halaman lama yang masih terbuka tidak kehilangan filenya.
    const names = (await caches.keys()).filter((k) => k.startsWith('shell-')).sort().reverse()
    await Promise.all(names.slice(2).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

async function navigate(req) {
  try { return await timeout(fetch(req), 4000) } // jaringan dulu supaya versi terbaru yang dipakai
  catch {
    const c = await caches.open(SHELL)
    return (await c.match('/index.html')) || (await caches.match('/index.html')) || Response.error()
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  const type = res.headers.get('content-type') || ''
  // File yang sudah dihapus server dijawab dengan index.html: jangan disimpan sebagai aset.
  if (res.ok && !type.includes('text/html')) (await caches.open(SHELL)).put(req, res.clone())
  return res
}

async function swr(req) {
  const c = await caches.open('fonts')
  const hit = await c.match(req)
  const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r }).catch(() => hit)
  return hit || net
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) {
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(swr(req))
    return // Supabase dan lainnya tidak disentuh
  }
  const p = url.pathname
  if (p.startsWith('/api/') || p === '/version.json' || p === '/sw.js') return
  if (req.mode === 'navigate') return e.respondWith(navigate(req))
  if (p.startsWith('/assets/') || PRECACHE.includes(p)) e.respondWith(cacheFirst(req))
})

// ---- Notifikasi push ----
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Tugas Sekolah', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: '/icons/icon-192.png',
    data: { go: d.go || '', id: d.id || '' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { go, id } = e.notification.data || {}
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) {
      if ('focus' in c) { await c.focus(); c.postMessage({ type: 'go', go, id }); return }
    }
    const q = go ? `/?go=${encodeURIComponent(go)}${id ? '&id=' + encodeURIComponent(id) : ''}` : '/'
    await self.clients.openWindow(q)
  })())
})
