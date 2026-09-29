import { useEffect, useState } from 'react'
import { callApi } from './util.js'

export default function Backup() {
  const [files, setFiles] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () => callApi('/api/backup', { action: 'list' }).then((j) => setFiles(j.files || [])).catch(() => setFiles([]))
  useEffect(() => { load() }, [])

  async function download() {
    setBusy(true); setMsg(null)
    try {
      const j = await callApi('/api/backup', { action: 'download' })
      const blob = new Blob([Uint8Array.from(atob(j.base64), (c) => c.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = j.name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (e) { setMsg({ ok: false, t: e.message }) }
    setBusy(false)
  }
  async function saveNow() {
    setBusy(true); setMsg(null)
    try { const j = await callApi('/api/backup', { action: 'now' }); setMsg({ ok: true, t: 'Cadangan tersimpan: ' + j.name }); load() }
    catch (e) { setMsg({ ok: false, t: e.message }) }
    setBusy(false)
  }

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <h3>Cadangan data</h3>
      <p className="muted">Berisi daftar siswa (beserta kode), tugas, dan semua nilai dalam satu file Excel. Foto jawaban tidak ikut. Cadangan otomatis dibuat setiap Senin dini hari dan 8 terakhir disimpan.</p>
      <button className="btn" disabled={busy} onClick={download}>{busy ? 'Menyiapkan...' : 'Unduh cadangan sekarang'}</button>
      <button className="link" disabled={busy} onClick={saveNow}>Simpan cadangan ke penyimpanan sekarang</button>
      {msg && <div className={msg.ok ? 'ok' : 'err'} role="status">{msg.t}</div>}
      {files && files.length > 0 && <h3 className="sec">Cadangan tersimpan</h3>}
      {(files || []).map((f) => (
        <div className="line" key={f.name}><span>{f.name.replace('cadangan-', '').replace('.xlsx', '')}</span><a href={f.url}>Unduh</a></div>
      ))}
      {files && !files.length && <p className="muted">Belum ada cadangan tersimpan.</p>}
    </div>
  )
}
