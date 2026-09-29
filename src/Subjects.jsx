import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Kelola daftar mata pelajaran (guru).
export default function Subjects({ onChanged }) {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    const { data, error } = await supabase.from('subjects').select('id,name').order('name')
    if (error) setErr('Gagal memuat mapel: ' + error.message)
    setList(data || [])
  }
  useEffect(() => { load() }, [])

  async function run(p) {
    setErr('')
    const { error } = await p
    if (error) return setErr(error.code === '23505' ? 'Mapel itu sudah ada.' : 'Gagal: ' + error.message)
    await load(); onChanged?.()
  }
  const add = () => {
    const n = name.replace(/\s+/g, ' ').trim()
    if (!n) return
    setName(''); run(supabase.from('subjects').insert({ name: n }))
  }
  const rename = (s) => {
    const n = (window.prompt('Nama baru untuk mapel ini:', s.name) || '').replace(/\s+/g, ' ').trim()
    if (n && n !== s.name) run(supabase.from('subjects').update({ name: n }).eq('id', s.id))
  }
  const remove = (s) => {
    if (window.confirm(`Hapus mapel ${s.name}? Tugasnya tidak ikut terhapus, hanya menjadi tanpa mapel.`))
      run(supabase.from('subjects').delete().eq('id', s.id))
  }

  return (
    <div className="panel">
      <h3>Mata pelajaran</h3>
      {list === null && <p className="muted">Memuat...</p>}
      {list && !list.length && <p className="muted">Belum ada mapel. Tambahkan di bawah.</p>}
      {(list || []).map((s) => (
        <div className="line" key={s.id}>
          <span>{s.name}</span>
          <span>
            <button className="link" style={{ marginTop: 0 }} onClick={() => rename(s)}>Ubah</button>{' '}
            <button className="link" style={{ marginTop: 0 }} onClick={() => remove(s)}>Hapus</button>
          </span>
        </div>
      ))}
      <label htmlFor="ns">Tambah mapel</label>
      <input id="ns" value={name} placeholder="Contoh: Matematika" onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()} />
      <button className="btn ghost" onClick={add}>Tambah</button>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
