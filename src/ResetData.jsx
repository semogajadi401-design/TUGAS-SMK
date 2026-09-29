import { useState } from 'react'
import { supabase } from './supabase.js'

const OPTS = [
  { k: 'scores', t: 'Nilai dan komentar', d: 'Nilai dan komentar dikosongkan. Jawaban siswa tetap ada.' },
  { k: 'photos', t: 'Foto jawaban siswa', d: 'Foto dihapus dari penyimpanan. Nilai dan jawaban teks tetap ada.' },
  { k: 'submissions', t: 'Semua jawaban siswa', d: 'Jawaban, foto, dan nilai dihapus. Tugas tetap ada.', needs: ['photos', 'scores'] },
  { k: 'assignments', t: 'Semua tugas', d: 'Tugas beserta lampiran, jawaban, foto, dan nilai dihapus.', needs: ['submissions'] },
  { k: 'passwords', t: 'Password semua siswa ke kode awal', d: 'Semua siswa aktif kembali memakai kodenya sebagai password.' },
  { k: 'students', t: 'Semua akun siswa', d: 'Akun siswa dihapus permanen beserta jawabannya. Akun guru aman.', needs: ['submissions'] },
  { k: 'classes', t: 'Daftar kelas', d: 'Kelas dihapus. Siswa yang tersisa menjadi tanpa kelas.' },
  { k: 'subjects', t: 'Daftar mata pelajaran', d: 'Mapel dihapus. Tugas yang tersisa menjadi tanpa mapel.' },
]
const NAME = Object.fromEntries(OPTS.map((o) => [o.k, o.t]))

function expand(sel) {
  const s = new Set(sel)
  for (let ch = true; ch;) {
    ch = false
    for (const k of [...s]) for (const n of OPTS.find((o) => o.k === k).needs || []) if (!s.has(n)) { s.add(n); ch = true }
  }
  return s
}

export default function ResetData() {
  const [sel, setSel] = useState([])
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const eff = expand(sel)
  const toggle = (k) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k])

  async function run() {
    const list = OPTS.filter((o) => eff.has(o.k) && !(o.k === 'passwords' && eff.has('students'))).map((o) => o.t)
    if (!window.confirm('Data berikut akan dihapus/direset PERMANEN dan tidak bisa dikembalikan:\n\n- ' + list.join('\n- ') + '\n\nLanjutkan?')) return
    setBusy(true); setMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ items: [...eff], confirm: word.trim() }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status !== 200 && r.status !== 207) throw new Error(j.error || 'Gagal menghubungi server')
      const lines = Object.entries(j.done || {}).map(([k, n]) => `${NAME[k]}: ${n}`).join(' · ')
      setMsg({ ok: !j.errors?.length, t: (lines ? 'Selesai. ' + lines + '. ' : '') + (j.errors?.length ? 'Ada yang gagal: ' + j.errors.join('; ') : '') })
      setSel([]); setWord('')
    } catch (e) { setMsg({ ok: false, t: e.message }) }
    setBusy(false)
  }

  return (
    <div className="panel" style={{ marginTop: 24 }}>
      <h3>Reset data</h3>
      <p className="muted">Centang data yang ingin direset. Tindakan ini permanen. Akun guru dan pengaturan sekolah tidak ikut terhapus.</p>
      {OPTS.map((o) => {
        const forced = eff.has(o.k) && !sel.includes(o.k)
        const off = o.k === 'passwords' && eff.has('students')
        return (
          <label key={o.k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '10px 0', opacity: off ? 0.5 : 1 }}>
            <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={eff.has(o.k)} disabled={forced || off}
              onChange={() => toggle(o.k)} />
            <span><b>{o.t}</b>{forced && ' (ikut terpilih)'}<br /><span className="muted">{o.d}</span></span>
          </label>
        )
      })}
      <label htmlFor="rw">Ketik <b>RESET</b> untuk mengonfirmasi</label>
      <input id="rw" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
      {msg && <div className={msg.ok ? 'ok' : 'err'} role="status">{msg.t}</div>}
      <button className="btn" style={{ background: 'var(--danger)' }} disabled={busy || !sel.length || word.trim() !== 'RESET'} onClick={run}>
        {busy ? 'Memproses...' : 'Reset data terpilih'}
      </button>
    </div>
  )
}
