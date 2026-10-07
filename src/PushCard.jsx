import { useEffect, useState } from 'react'
import { pushStatus, enablePush, disablePush, testPush } from './lib/push.js'
import { toast } from './lib/toast.js'
import './offline.css'

const SNOOZE_KEY = 'push-prompt-snooze'
const snoozed = () => { try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0) } catch { return false } }
const snooze = () => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 864e5)) } catch { /* abaikan */ } }

// compact = ajakan singkat di atas halaman (hanya muncul bila belum diaktifkan).
// Tanpa compact = pengaturan lengkap di tab Akun.
export default function PushCard({ compact = false }) {
  const [st, setSt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hide, setHide] = useState(snoozed)

  useEffect(() => { pushStatus().then(setSt) }, [])

  async function on() {
    setBusy(true)
    try {
      const r = await enablePush()
      setSt(r)
      if (r === 'on') toast({ kind: 'ok', text: 'Pemberitahuan aktif di perangkat ini.', ms: 3500 })
    } catch (e) {
      toast({ kind: 'warn', text: 'Pemberitahuan gagal diaktifkan. Coba lagi saat internet stabil.' })
      setSt(await pushStatus())
    }
    setBusy(false)
  }
  async function off() {
    setBusy(true)
    try { await disablePush() } catch { /* abaikan */ }
    setSt(await pushStatus()); setBusy(false)
  }
  async function test() {
    setBusy(true)
    try { await testPush(); toast({ text: 'Pemberitahuan percobaan dikirim. Biasanya tiba dalam beberapa detik.', ms: 4000 }) }
    catch (e) { toast({ kind: 'warn', text: e.message || 'Gagal mengirim percobaan.' }) }
    setBusy(false)
  }

  if (!st || st === 'unavailable') return null

  if (compact) {
    if (st !== 'default' || hide) return null
    return (
      <div className="pushcard" role="note">
        <b>Aktifkan pemberitahuan</b>
        <p>Dapat kabar saat ada tugas, materi, quiz, atau nilai baru, juga pengingat tenggat, walau aplikasi sedang ditutup.</p>
        <div className="row">
          <button className="btn" disabled={busy} onClick={on}>{busy ? 'Memproses...' : 'Aktifkan'}</button>
          <button className="btn ghost" onClick={() => { snooze(); setHide(true) }}>Nanti</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pushcard">
      <b>Pemberitahuan</b>
      {st === 'on' && (<>
        <p>Aktif di perangkat ini. Kamu akan dikabari soal tugas, materi, quiz, nilai, dan tenggat.</p>
        <div className="row">
          <button className="btn ghost" disabled={busy} onClick={test}>Kirim percobaan</button>
          <button className="btn ghost" disabled={busy} onClick={off}>Matikan</button>
        </div>
      </>)}
      {(st === 'default' || st === 'off') && (<>
        <p>Dapat kabar saat ada tugas, materi, quiz, atau nilai baru, juga pengingat tenggat, walau aplikasi sedang ditutup.</p>
        <button className="btn" disabled={busy} onClick={on}>{busy ? 'Memproses...' : 'Aktifkan pemberitahuan'}</button>
      </>)}
      {st === 'denied' && <p>Pemberitahuan diblokir untuk situs ini. Buka pengaturan situs di browser (ikon gembok di kolom alamat), ubah Notifikasi menjadi Izinkan, lalu muat ulang halaman.</p>}
      {st === 'ios-install' && <p>Di iPhone/iPad, pemberitahuan hanya bisa bila aplikasi dipasang dulu: ketuk tombol Bagikan di Safari, pilih <b>Tambah ke Layar Utama</b>, lalu buka aplikasi dari ikon itu.</p>}
      {st === 'unsupported' && <p>Browser ini belum mendukung pemberitahuan. Coba Chrome, Edge, Firefox, atau Safari versi terbaru. Browser di dalam aplikasi lain (misalnya dari WhatsApp atau Instagram) juga tidak mendukungnya.</p>}
    </div>
  )
}
