import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { fetchAll, copyText, listText } from './util.js'

const fmt = (d) => d ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Tanpa tenggat'

export default function Missing() {
  const [rows, setRows] = useState(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    (async () => {
      const [a, st] = await Promise.all([
        supabase.from('assignments').select('id,title,due_at,subjects(name),assignment_classes(class_id)').eq('status', 'active'),
        supabase.from('profiles').select('id,full_name,class_id').eq('role', 'student').eq('active', true).order('full_name'),
      ])
      const tasks = (a.data || []).sort((x, y) => (x.due_at || '9') < (y.due_at || '9') ? -1 : 1).slice(0, 8)
      const subs = tasks.length
        ? await fetchAll(() => supabase.from('submissions').select('id,assignment_id,student_id').eq('status', 'submitted').in('assignment_id', tasks.map((t) => t.id)).order('id'))
        : []
      const sent = new Set(subs.map((x) => x.assignment_id + '|' + x.student_id))
      setRows(tasks.map((t) => {
        const cids = t.assignment_classes.map((x) => x.class_id)
        return { ...t, miss: (st.data || []).filter((s) => cids.includes(s.class_id) && !sent.has(t.id + '|' + s.id)) }
      }).filter((t) => t.miss.length).slice(0, 5))
    })().catch(() => setRows([]))
  }, [])

  if (!rows?.length) return null
  async function copy(t) {
    const ok = await copyText(listText(`Belum mengumpulkan "${t.title}":`, t.miss.map((s) => s.full_name)))
    setNote(ok ? `Daftar "${t.title}" disalin. Tinggal tempel di WhatsApp.` : 'Browser menolak menyalin.')
  }

  return (
    <div className="panel">
      <h3>Belum mengumpulkan</h3>
      {rows.map((t) => (
        <div className="line" key={t.id}>
          <span>
            <b>{t.title}</b>
            <span className="muted" style={{ display: 'block' }}>{t.subjects?.name && t.subjects.name + ' · '}{fmt(t.due_at)} · {t.miss.length} siswa</span>
          </span>
          <button className="link" style={{ marginTop: 0 }} onClick={() => copy(t)}>Salin nama</button>
        </div>
      ))}
      {note && <div className="ok" role="status" style={{ marginTop: 8 }}>{note}</div>}
    </div>
  )
}
