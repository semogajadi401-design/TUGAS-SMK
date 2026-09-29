import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const greet = () => {
  const h = new Date().getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
}
const dateText = new Date().toLocaleDateString('id-ID',
  { weekday: 'long', day: 'numeric', month: 'long' })
const cnt = (q) => q.then((r) => r.count ?? 0)

export default function Dashboard({ profile }) {
  const [d, setD] = useState(null)

  useEffect(() => {
    (async () => {
      const [studs, tasks, waiting, storage] = await Promise.all([
        supabase.from('profiles').select('password_changed,classes(name)').eq('role', 'student').eq('active', true),
        cnt(supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('status', 'active')),
        cnt(supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted').is('score', null)),
        supabase.rpc('storage_usage_bytes'),
      ])
      const list = studs.data || []
      const byClass = {}
      list.forEach((x) => { const n = x.classes?.name || 'Tanpa kelas'; byClass[n] = (byClass[n] || 0) + 1 })
      setD({
        students: list.length, tasks, waiting,
        unchanged: list.filter((x) => !x.password_changed).length,
        byClass: Object.entries(byClass).sort(),
        mb: (Number(storage.data) || 0) / 1048576,
      })
    })()
  }, [])

  if (!d) return <div className="empty">Memuat statistik...</div>
  const max = Math.max(1, ...d.byClass.map(([, n]) => n))
  const pwPct = d.students ? Math.round(((d.students - d.unchanged) / d.students) * 100) : 0
  const stPct = Math.min(100, (d.mb / 1024) * 100)

  return (<>
    <div className="greet"><small>{dateText}</small><h2>{greet()}, {profile.full_name.split(' ')[0]}</h2></div>

    <div className="stats">
      <div className="stat"><b>{d.students}</b><span>Siswa aktif</span></div>
      <div className="stat"><b>{d.byClass.filter(([n]) => n !== 'Tanpa kelas').length}</b><span>Kelas</span></div>
      <div className="stat"><b>{d.tasks}</b><span>Tugas aktif</span></div>
      <div className={'stat' + (d.waiting ? ' hot' : '')}><b>{d.waiting}</b><span>Menunggu dinilai</span></div>
    </div>

    <div className="panel">
      <h3>Siswa per kelas</h3>
      {!d.byClass.length && <p className="muted">Belum ada siswa. Impor dulu di tab Siswa & Kelas.</p>}
      {d.byClass.map(([n, c]) => (
        <div className="bar" key={n}>
          <span>{n}</span>
          <div><i style={{ width: (c / max) * 100 + '%' }} /></div>
          <b>{c}</b>
        </div>
      ))}
    </div>

    <div className="panel">
      <h3>Keamanan akun</h3>
      <div className="meter"><i style={{ width: pwPct + '%' }} /></div>
      <p className="muted">
        {d.students ? `${pwPct}% siswa sudah mengganti password.` : 'Belum ada siswa.'}
        {d.unchanged > 0 && ` ${d.unchanged} siswa masih memakai kode awal.`}
      </p>
    </div>

    <div className="panel">
      <h3>Penyimpanan foto</h3>
      <div className={'meter' + (stPct > 80 ? ' warn' : '')}><i style={{ width: Math.max(2, stPct) + '%' }} /></div>
      <p className="muted">
        Terpakai {d.mb.toFixed(1)} MB dari sekitar 1 GB.
        {stPct > 80 && ' Hampir penuh, bersihkan foto tugas yang sudah dinilai.'}
      </p>
    </div>
  </>)
}
