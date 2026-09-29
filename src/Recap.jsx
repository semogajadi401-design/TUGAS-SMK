import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { fetchAll, loadXlsx } from './util.js'

const avgOf = (list) => {
  const v = list.filter((x) => x != null).map(Number)
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

export default function Recap() {
  const [classes, setClasses] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [cls, setCls] = useState('')
  const [sj, setSj] = useState('')
  const [d, setD] = useState(null)

  useEffect(() => {
    supabase.from('classes').select('id,name').order('name').then((r) => { setClasses(r.data || []); if (r.data?.[0]) setCls(r.data[0].id) })
    supabase.from('subjects').select('id,name').order('name').then((r) => setSubjects(r.data || []))
  }, [])

  useEffect(() => {
    if (!cls) return
    setD(null)
    ;(async () => {
      const [a, st] = await Promise.all([
        supabase.from('assignments').select('id,title,subject_id,assignment_classes(class_id)').order('created_at'),
        supabase.from('profiles').select('id,full_name').eq('role', 'student').eq('active', true).eq('class_id', cls).order('full_name'),
      ])
      const tasks = (a.data || []).filter((t) => t.assignment_classes.some((x) => x.class_id === cls))
      const subs = tasks.length
        ? await fetchAll(() => supabase.from('submissions').select('id,assignment_id,student_id,score,status').in('assignment_id', tasks.map((t) => t.id)).order('id'))
        : []
      setD({ tasks, studs: st.data || [], subs })
    })()
  }, [cls])

  if (classes === null) return <div className="empty">Memuat...</div>
  if (!classes.length) return <><h2>Rekap Nilai</h2><div className="empty">Belum ada kelas. Impor siswa dulu.</div></>

  const tasks = d ? d.tasks.filter((t) => !sj || t.subject_id === sj) : []
  const cell = new Map((d?.subs || []).map((x) => [x.assignment_id + '|' + x.student_id, x]))
  const get = (t, s) => cell.get(t.id + '|' + s.id)
  const rowAvg = (s) => avgOf(tasks.map((t) => get(t, s)?.score))
  const colAvg = (t) => avgOf((d?.studs || []).map((s) => get(t, s)?.score))

  async function exportXlsx() {
    const XLSX = await loadXlsx()
    const name = classes.find((c) => c.id === cls)?.name || 'kelas'
    const rows = [['Nama', ...tasks.map((t) => t.title), 'Rata-rata'],
      ...d.studs.map((s) => [s.full_name, ...tasks.map((t) => get(t, s)?.score ?? ''), rowAvg(s) ?? '']),
      ['Rata-rata tugas', ...tasks.map((t) => colAvg(t) ?? ''), '']]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 32 }, ...tasks.map(() => ({ wch: 16 })), { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap')
    XLSX.writeFile(wb, 'rekap-nilai-' + name.replace(/[^\w-]+/g, '_') + '.xlsx')
  }

  return (<>
    <h2>Rekap Nilai</h2>
    <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Kelas">
      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
    {subjects.length > 1 && (
      <select value={sj} onChange={(e) => setSj(e.target.value)} aria-label="Mapel">
        <option value="">Semua mapel</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    )}
    {d === null && <div className="empty">Memuat...</div>}
    {d && !tasks.length && <div className="empty">Belum ada tugas untuk kelas ini.</div>}
    {d && tasks.length > 0 && (<>
      <button className="btn ghost" style={{ margin: '8px 0 12px' }} onClick={exportXlsx}>Ekspor ke Excel</button>
      <div className="tbl-wrap">
        <table className="recap">
          <thead>
            <tr><th>Nama</th>{tasks.map((t) => <th key={t.id} title={t.title}>{t.title}</th>)}<th>Rata-rata</th></tr>
          </thead>
          <tbody>
            {d.studs.map((s) => (
              <tr key={s.id}>
                <td>{s.full_name}</td>
                {tasks.map((t) => {
                  const x = get(t, s)
                  return <td key={t.id} className={x?.score != null ? '' : 'dim'}>{x?.score != null ? x.score : x?.status === 'submitted' ? 'Dikirim' : '-'}</td>
                })}
                <td><b>{rowAvg(s) ?? '-'}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Rata-rata tugas</td>{tasks.map((t) => <td key={t.id}>{colAvg(t) ?? '-'}</td>)}<td /></tr>
          </tfoot>
        </table>
      </div>
      <p className="muted">Rata-rata dihitung dari tugas yang sudah dinilai saja. "-" berarti belum mengirim, "Dikirim" berarti menunggu dinilai.</p>
    </>)}
  </>)
}
