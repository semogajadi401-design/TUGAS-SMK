import { useEffect, useRef, useState } from 'react'

// Memantau versi aplikasi. Jika ada deploy baru, muncul pop-up "Muat Ulang".
// Tidak memuat ulang otomatis supaya jawaban yang sedang diketik siswa tidak hilang.
const CURRENT = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
const EVERY = 60 * 1000       // cek tiap 1 menit saat tab terlihat
const SNOOZE = 5 * 60 * 1000  // "Nanti" menyembunyikan pop-up 5 menit

export default function UpdateNotice() {
  const [show, setShow] = useState(false)
  const snooze = useRef(0)
  const outdated = useRef(false)

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined // mode pengembangan: tidak perlu

    const reveal = () => { if (Date.now() >= snooze.current) setShow(true) }

    async function check() {
      if (document.hidden) return
      try {
        const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (j?.id && j.id !== CURRENT) { outdated.current = true; reveal() }
      } catch { /* offline atau file belum ada: abaikan */ }
    }

    // File lama sudah dihapus server setelah deploy: muat halaman/bagian aplikasi gagal.
    const onPreloadError = (e) => { e.preventDefault?.(); outdated.current = true; reveal() }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }

    window.addEventListener('vite:preloadError', onPreloadError)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', check)
    const first = setTimeout(check, 5000)
    const timer = setInterval(() => { if (outdated.current) reveal(); else check() }, EVERY)
    return () => {
      window.removeEventListener('vite:preloadError', onPreloadError)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', check)
      clearTimeout(first); clearInterval(timer)
    }
  }, [])

  if (!show) return null
  return (
    <div className="upd" role="alertdialog" aria-labelledby="upd-t" aria-describedby="upd-d">
      <div>
        <b id="upd-t">Pembaruan tersedia</b>
        <p id="upd-d">Ada versi baru aplikasi. Jika kamu sedang mengerjakan tugas, tekan <b style={{ display: 'inline' }}>Simpan dulu</b> sebelum memuat ulang agar jawabanmu aman.</p>
      </div>
      <div className="upd-a">
        <button className="upd-later" onClick={() => { snooze.current = Date.now() + SNOOZE; setShow(false) }}>Nanti</button>
        <button className="upd-go" onClick={() => window.location.reload()}>Muat Ulang</button>
      </div>
    </div>
  )
}
