import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import Missing from './Missing.jsx'
import { Icon, I } from './Shell.jsx'
import { OnlineDot } from './presence.jsx'

const greet = () => {
  const h = new Date().getHours()
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
}
const dateText = new Date().toLocaleDateString('id-ID',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const cnt = (q) => q.then((r) => r.count ?? 0)

const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function dueInfo(due) {
  if (new Date(due) < new Date()) return { t: 'Lewat', c: 'late' }
  const n = Math.round((dayStart(due) - dayStart(new Date())) / 864e5)
  if (n === 0) return { t: 'Hari ini', c: 'soon' }
  if (n === 1) return { t: 'Besok', c: 'soon' }
  return { t: `${n} hari lagi`, c: '' }
}
const ago = (d) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(d)) / 60000))
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} mnt lalu`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.round(h / 24)} hari lalu`
}

export default function Dashboard({ profile, go, online = {} }) {
  const [d, setD] = useState(null)

  useEffect(() => {
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
      const [studs, tasks, waiting, graded, due, recent] = await Promise.all([
        supabase.from('profiles').select('password_changed,class_id,classes(name)').eq('role', 'student').eq('active', true),
        cnt(supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('status', 'active')),
        cnt(supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'submitted').is('score', null)),
        cnt(supabase.from('submissions').select('id', { count: 'exact', head: true }).not('score', 'is', null).gte('graded_at', weekAgo)),
        supabase.from('assignments').select('id,title,due_at,subjects(name),assignment_classes(class_id)')
          .eq('status', 'active').not('due_at', 'is', null).order('due_at').limit(30),
        supabase.from('submissions').select('id,submitted_at,score,profiles(full_name,classes(name)),assignments(title)')
          .eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(5),
      ])
      const list = studs.data || []

      // Data kelas: nama + jumlah siswa (kelas kosong tetap tampil)
      const byClass = new Map()
      list.forEach((x) => {
        const n = x.classes?.name || 'Tanpa kelas'
        byClass.set(n, (byClass.get(n) || 0) + 1)
      })
      const classes = [...byClass.entries()]
        .sort(([a], [b]) => (a === 'Tanpa kelas') - (b === 'Tanpa kelas') || a.localeCompare(b, 'id', { numeric: true }))

      // Tenggat terdekat + jumlah siswa sasaran + yang sudah kirim
      const now = Date.now()
      const upcoming = (due.data || [])
        .filter((t) => new Date(t.due_at) > now - 864e5)
        .slice(0, 4)
      let sentBy = new Map()
      if (upcoming.length) {
        const s = await supabase.from('submissions').select('assignment_id')
          .eq('status', 'submitted').in('assignment_id', upcoming.map((t) => t.id)).limit(5000)
        ;(s.data || []).forEach((x) => sentBy.set(x.assignment_id, (sentBy.get(x.assignment_id) || 0) + 1))
      }
      const deadlines = upcoming.map((t) => {
        const ids = new Set(t.assignment_classes.map((x) => x.class_id))
        return { ...t, target: list.filter((x) => ids.has(x.class_id)).length, sent: sentBy.get(t.id) || 0 }
      })

      setD({
        students: list.length, tasks, waiting, graded, classes, deadlines,
        recent: recent.data || [],
        unchanged: list.filter((x) => !x.password_changed).length,
        mb: null,
      })
      // Hitung pemakaian penyimpanan terpisah: beranda tampil dulu, angkanya menyusul.
      supabase.rpc('storage_usage_bytes').then((r) => setD((x) => x && { ...x, mb: (Number(r.data) || 0) / 1048576 }), () => {})
    })().catch(() => setD({ students: 0, tasks: 0, waiting: 0, graded: 0, classes: [], deadlines: [], recent: [], unchanged: 0, mb: 0 }))
  }, [])

  if (!d) return <div className="empty">Memuat beranda...</div>

  const onList = Object.values(online)
  const realClasses = d.classes.filter(([n]) => n !== 'Tanpa kelas').length
  const pwPct = d.students ? Math.round(((d.students - d.unchanged) / d.students) * 100) : 0
  const stPct = d.mb == null ? 0 : Math.min(100, (d.mb / 1024) * 100)

  return (
    <div className="home">
      <header className="hi">
        <small>{dateText}</small>
        <h2>{greet()}, {profile.full_name.split(' ')[0]}</h2>
      </header>

      <section className="sum" aria-label="Ringkasan">
        <p className="sum-main">
          {d.waiting ? `${d.waiting} jawaban menunggu dinilai` : 'Semua jawaban sudah dinilai'}
        </p>
        <p className="sum-cap">
          {d.graded > 0 ? `${d.graded} jawaban dinilai dalam 7 hari terakhir` : 'Belum ada penilaian dalam 7 hari terakhir'}
        </p>
        {d.waiting > 0 && go && (
          <button className="sum-btn" onClick={() => go('grading')}>Mulai menilai</button>
        )}
        <dl className="facts">
          <div><dt>Siswa aktif</dt><dd>{d.students}</dd></div>
          <div><dt>Kelas</dt><dd>{realClasses}</dd></div>
          <div><dt>Tugas aktif</dt><dd>{d.tasks}</dd></div>
        </dl>
      </section>

      <section className="onl" aria-live="polite" aria-label="Siswa online">
        <div className="onl-h">
          <OnlineDot /><b>{onList.length}</b> siswa sedang online <small>dari {d.students} siswa aktif</small>
        </div>
        {onList.length > 0 && (
          <div className="onl-list">
            {onList.slice(0, 8).map((x, i) => <span key={i}>{x.name}{x.kelas && ` · ${x.kelas}`}</span>)}
            {onList.length > 8 && <span className="more">+{onList.length - 8} lainnya</span>}
          </div>
        )}
        {go && <button className="link" onClick={() => go('students')}>Lihat riwayat login</button>}
      </section>

      {go && (
        <nav className="quick" aria-label="Pintasan">
          <button onClick={() => go('tasks')}><Icon d={I.tasks} size={20} />Buat tugas</button>
          <button onClick={() => go('materials')}><Icon d={I.book} size={20} />Materi</button>
          <button onClick={() => go('recap')}><Icon d={I.table} size={20} />Rekap nilai</button>
          <button onClick={() => go('students')}><Icon d={I.users} size={20} />Siswa</button>
        </nav>
      )}

      <div className="sec-head"><h3>Kelas</h3>{go && <button className="inline soft" onClick={() => go('students')}>Kelola</button>}</div>
      {!d.classes.length ? (
        <div className="empty-card">Belum ada siswa. Impor dulu di tab Siswa &amp; Kelas.</div>
      ) : (
        <div className="list">
          {d.classes.map(([n, c]) => (
            <div className="item static" key={n}>
              <span className="item-t"><b>{n}</b></span>
              <span className="count">{c} <small>siswa</small></span>
            </div>
          ))}
          <div className="item static total">
            <span className="item-t"><b>Total</b></span>
            <span className="count">{d.students} <small>siswa</small></span>
          </div>
        </div>
      )}

      {d.deadlines.length > 0 && (<>
        <div className="sec-head"><h3>Tenggat terdekat</h3></div>
        <div className="list">
          {d.deadlines.map((t) => {
            const di = dueInfo(t.due_at)
            const pct = t.target ? Math.min(100, Math.round((t.sent / t.target) * 100)) : 0
            return (
              <button className={'item ' + di.c} key={t.id} onClick={() => go?.('tasks')}>
                <span className="item-t">
                  <b>{t.title}</b>
                  <small>{t.subjects?.name && t.subjects.name + ' · '}{t.sent}{t.target ? ` dari ${t.target}` : ''} siswa sudah kirim</small>
                  {t.target > 0 && <span className="mini"><i style={{ width: pct + '%' }} /></span>}
                </span>
                <span className={'chip ' + di.c}>{di.t}</span>
              </button>
            )
          })}
        </div>
      </>)}

      <Missing />

      {d.recent.length > 0 && (<>
        <div className="sec-head"><h3>Pengumpulan terbaru</h3></div>
        <div className="list">
          {d.recent.map((r) => (
            <button className="item" key={r.id} onClick={() => go?.('grading')}>
              <span className="item-t">
                <b>{r.profiles?.full_name || 'Siswa'}</b>
                <small>{r.assignments?.title}{r.profiles?.classes?.name && ` · ${r.profiles.classes.name}`}</small>
              </span>
              <span className={'chip ' + (r.score != null ? 'graded' : 'soon')}>
                {r.score != null ? r.score : ago(r.submitted_at)}
              </span>
            </button>
          ))}
        </div>
      </>)}

      <div className="sec-head"><h3>Sistem</h3></div>
      <div className="list sys">
        <div className="sys-row">
          <div className="sys-h"><span>Keamanan akun</span><b>{d.students ? pwPct + '%' : '-'}</b></div>
          <div className="meter"><i style={{ width: pwPct + '%' }} /></div>
          <p className="muted">
            {d.students ? 'Siswa sudah mengganti password.' : 'Belum ada siswa.'}
            {d.unchanged > 0 && ` ${d.unchanged} siswa masih memakai kode awal.`}
          </p>
        </div>
        <div className="sys-row">
          <div className="sys-h"><span>Penyimpanan foto</span><b>{d.mb == null ? '...' : d.mb.toFixed(1) + ' MB'}</b></div>
          <div className={'meter' + (stPct > 80 ? ' warn' : '')}><i style={{ width: Math.max(2, stPct) + '%' }} /></div>
          <p className="muted">
            Dari sekitar 1 GB.{stPct > 80 && ' Hampir penuh, bersihkan foto tugas yang sudah dinilai.'}
          </p>
        </div>
      </div>
    </div>
  )
}
