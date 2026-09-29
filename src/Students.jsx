import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { loadXlsx } from './util.js'

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

async function downloadTemplate() {
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()
  const data = XLSX.utils.aoa_to_sheet([['Nama', 'Kelas', 'Kode'], ['Contoh: Budi Santoso', '7A', '']])
  data['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, data, 'Data Siswa')
  const help = XLSX.utils.aoa_to_sheet([
    ['Petunjuk'],
    ['1. Isi Nama dan Kelas tiap siswa. Hapus baris contoh (boleh juga dibiarkan, akan diabaikan).'],
    ['2. Kolom Kode boleh kosong. Kalau kosong, aplikasi membuatkan kode acak.'],
    ['3. Kalau kode diisi: 6-12 huruf/angka tanpa spasi, tidak boleh kembar.'],
    ['4. Tulis nama kelas konsisten (7A, bukan kadang 7 A).'],
    ['5. Boleh satu sheet per kelas. Kalau kolom Kelas kosong, nama sheet dipakai sebagai kelas.'],
  ])
  help['!cols'] = [{ wch: 95 }]
  XLSX.utils.book_append_sheet(wb, help, 'Petunjuk')
  XLSX.writeFile(wb, 'template-siswa.xlsx')
}

async function parseFile(file) {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer())
  const rows = []
  for (const name of wb.SheetNames) {
    if (name.toLowerCase() === 'petunjuk') continue
    for (const raw of XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })) {
      const r = {}
      for (const k in raw) r[k.trim().toLowerCase()] = raw[k]
      const nama = clean(r.nama)
      if (!nama && !clean(r.kelas)) continue
      if (nama.toLowerCase().startsWith('contoh:')) continue
      const fallback = name.toLowerCase() === 'data siswa' ? '' : name
      rows.push({ nama, kelas: clean(r.kelas) || clean(fallback),
        kode: clean(r.kode).replace(/\s/g, '').toUpperCase() })
    }
  }
  return rows
}

function localError(r) {
  if (!r.nama) return 'Nama kosong'
  if (!r.kelas) return 'Kelas kosong'
  if (r.kode && !/^[A-Z0-9]{6,12}$/.test(r.kode)) return 'Kode harus 6-12 huruf/angka tanpa spasi'
  return ''
}

async function callApi(rows, dryRun) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify({ rows, dryRun }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Gagal menghubungi server')
  return j.rows
}

function ImportModal({ onClose }) {
  const [view, setView] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [prog, setProg] = useState(null)

  async function onFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setBusy(true); setErr(''); setView(null)
    try {
      const rows = await parseFile(f)
      if (!rows.length) throw new Error('Tidak ada data siswa di file ini.')
      const bad = rows.map(localError)
      const valid = rows.filter((_, i) => !bad[i])
      const checked = valid.length ? await callApi(valid, true) : []
      let j = 0
      setView(rows.map((r, i) => bad[i] ? { ...r, status: 'error', reason: bad[i] } : checked[j++]))
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  async function doImport() {
    setBusy(true); setErr('')
    const okRows = view.filter((r) => r.status === 'ok').map(({ nama, kelas, kode }) => ({ nama, kelas, kode }))
    const all = []
    try {
      for (let i = 0; i < okRows.length; i += 20) {
        setProg({ done: i, total: okRows.length })
        all.push(...await callApi(okRows.slice(i, i + 20), false))
      }
      setProg(null); setResult(all)
    } catch (x) {
      setProg(null)
      setErr(x.message + '. Sebagian akun mungkin sudah terbuat. Tutup jendela ini, cek daftar siswa, lalu impor ulang file yang sama (yang sudah terdaftar otomatis dilewati).')
      if (all.length) setResult(all)
    }
    setBusy(false)
  }

  async function downloadCodes() {
    const XLSX = await loadXlsx()
    const made = result.filter((r) => r.status === 'created')
    const ws = XLSX.utils.aoa_to_sheet([['Nama', 'Kelas', 'Kode'], ...made.map((r) => [r.nama, r.kelas, r.kode])])
    ws['!cols'] = [{ wch: 32 }, { wch: 12 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kode Siswa')
    XLSX.writeFile(wb, 'kode-siswa.xlsx')
  }

  const count = (s) => (view || []).filter((r) => r.status === s).length
  const problems = (view || []).filter((r) => r.status !== 'ok')

  return (
    <div className="modal-bg"><div className="modal">
      <h2>Impor siswa</h2>
      {!result && (<>
        <p className="muted">1. Unduh template, isi, lalu 2. unggah di sini.</p>
        <button className="btn ghost" onClick={downloadTemplate}>Unduh template Excel</button>
        <label htmlFor="f" style={{ marginTop: 16 }}>File Excel yang sudah diisi</label>
        <input id="f" type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} />
        {busy && <p className="muted">Memproses...</p>}
        {view && (<>
          <p><b>{count('ok')}</b> siap diimpor · <b>{count('skip')}</b> dilewati · <b>{count('error')}</b> bermasalah</p>
          {problems.slice(0, 40).map((r, i) => (
            <div key={i} className={'prob ' + r.status}>{r.nama || '(tanpa nama)'} {r.kelas && `(${r.kelas})`}: {r.reason}</div>
          ))}
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || !count('ok')} onClick={doImport}>
            {prog ? `Membuat akun... ${prog.done} dari ${prog.total}` : `Impor ${count('ok')} siswa`}
          </button>
          {prog && <div className="meter" style={{ marginTop: 10 }}><i style={{ width: (prog.done / prog.total) * 100 + '%' }} /></div>}
          {prog && <p className="muted">Jangan tutup halaman ini sampai selesai.</p>}
        </>)}
      </>)}
      {result && (<>
        <p><b>{result.filter((r) => r.status === 'created').length}</b> akun berhasil dibuat.</p>
        {result.filter((r) => r.status === 'error').map((r, i) => (
          <div key={i} className="prob error">{r.nama}: {r.reason}</div>
        ))}
        <p className="muted">Unduh tabel kode sekarang, lalu bagikan ke siswa. Kode juga selalu terlihat di daftar siswa.</p>
        <button className="btn" onClick={downloadCodes}>Unduh Nama, Kelas, Kode (Excel)</button>
      </>)}
      {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      <button className="link" onClick={() => onClose(!!result)}>Tutup</button>
    </div></div>
  )
}

async function studentApi(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/student', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Gagal menghubungi server')
  return j
}

function StudentRow({ s, onChange }) {
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const [nama, setNama] = useState(s.full_name)
  const [kelas, setKelas] = useState(s.classes?.name || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function run(body, ok, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true); setMsg(null)
    try { await studentApi({ id: s.id, ...body }); setMsg({ ok: true, t: ok }); await onChange(); setEdit(false) }
    catch (x) { setMsg({ ok: false, t: x.message }) }
    setBusy(false)
  }

  return (
    <div className="panel" style={{ opacity: s.active ? 1 : 0.6 }}>
      <div className="line" style={{ borderBottom: 0 }} onClick={() => setOpen(!open)}>
        <div><b>{s.full_name}</b><div className="muted">{s.classes?.name} · Kode {s.code}</div></div>
        {!s.active ? <span className="badge">Nonaktif</span>
          : !s.password_changed && <span className="badge">Belum ganti password</span>}
      </div>
      {open && (<>
        {edit ? (<>
          <label htmlFor={'n' + s.id}>Nama</label>
          <input id={'n' + s.id} value={nama} onChange={(e) => setNama(e.target.value)} />
          <label htmlFor={'k' + s.id}>Kelas</label>
          <input id={'k' + s.id} value={kelas} onChange={(e) => setKelas(e.target.value)} />
          <button className="btn" disabled={busy} onClick={() => run({ action: 'update', nama, kelas }, 'Data siswa disimpan.')}>Simpan</button>
          <button className="link" onClick={() => setEdit(false)}>Batal</button>
        </>) : (
          <div className="picks">
            <button className="btn ghost" disabled={busy} onClick={() => setEdit(true)}>Ubah data</button>
            <button className="btn ghost" disabled={busy}
              onClick={() => run({ action: 'reset' }, 'Password dikembalikan ke kode ' + s.code + '.',
                `Kembalikan password ${s.full_name} menjadi kode awal (${s.code})?`)}>Reset password</button>
            <button className="btn ghost" disabled={busy}
              onClick={() => run({ action: 'active', value: !s.active }, s.active ? 'Siswa dinonaktifkan.' : 'Siswa diaktifkan.',
                s.active ? `Nonaktifkan ${s.full_name}? Siswa tidak bisa masuk lagi.` : '')}>
              {s.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
          </div>
        )}
        {msg && <div className={msg.ok ? 'ok' : 'err'} role="status">{msg.t}</div>}
      </>)}
    </div>
  )
}

function printCodes(list) {
  const rows = list.map((s) => `<tr><td>${s.full_name}</td><td>${s.classes?.name || ''}</td><td><b>${s.code || ''}</b></td></tr>`).join('')
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<title>Kode siswa</title><style>body{font-family:sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left}</style><h2>Daftar kode siswa</h2><table><tr><th>Nama</th><th>Kelas</th><th>Kode</th></tr>${rows}</table>`)
  w.document.close(); w.print()
}

export default function Students() {
  const [list, setList] = useState(null)
  const [cls, setCls] = useState('')
  const [open, setOpen] = useState(false)

  async function load() {
    const { data } = await supabase.from('profiles')
      .select('id,full_name,code,active,password_changed,classes(name)')
      .eq('role', 'student').order('full_name')
    setList(data || [])
  }
  useEffect(() => { load() }, [])

  const classes = useMemo(() => [...new Set((list || []).map((s) => s.classes?.name).filter(Boolean))].sort(), [list])
  const shown = (list || []).filter((s) => !cls || s.classes?.name === cls)

  return (<>
    <h2>Siswa & Kelas</h2>
    <button className="btn" onClick={() => setOpen(true)}>Impor siswa</button>
    <div style={{ height: 14 }} />
    <select value={cls} onChange={(e) => setCls(e.target.value)}>
      <option value="">Semua kelas ({(list || []).length} siswa)</option>
      {classes.map((c) => <option key={c}>{c}</option>)}
    </select>
    {list === null && <div className="empty">Memuat...</div>}
    {list && !shown.length && <div className="empty">Belum ada siswa. Klik Impor siswa untuk memulai.</div>}
    {shown.length > 0 && <button className="link" onClick={() => printCodes(shown.filter((x) => x.active))}>Cetak daftar kode</button>}
    {shown.map((s) => <StudentRow key={s.id} s={s} onChange={load} />)}
    {open && <ImportModal onClose={(changed) => { setOpen(false); if (changed) load() }} />}
  </>)
}
