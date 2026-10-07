import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { callApi } from './util.js'

const KINDS = ['tasks', 'materials', 'grades']
const ZERO = { tasks: 0, materials: 0, grades: 0, quiz: 0, announce: 0 }
const POLL_MS = 120000

// Menghitung tugas, materi, dan nilai yang belum dilihat siswa.
// Penanda "terakhir dilihat" disimpan di tabel seen_marks (ikut ke perangkat mana pun).
export function useNotifs() {
  const [counts, setCounts] = useState(ZERO)
  const [popup, setPopup] = useState(null)
  const first = useRef(true)
  const alive = useRef(true)
  const cleared = useRef({}) // kapan tiap jenis terakhir ditandai "sudah dilihat" di layar ini

  async function loadMarks() {
    const uid = (await supabase.auth.getSession()).data.session?.user?.id
    if (!uid) return null
    const read = async () => {
      const { data, error } = await supabase.from('seen_marks').select('kind,seen_at')
      if (error) return null
      return Object.fromEntries((data || []).map((r) => [r.kind, r.seen_at]))
    }
    let m = await read()
    if (!m) return null
    const missing = KINDS.filter((k) => !m[k])
    if (missing.length) {
      // Pertama kali: semua yang sudah ada dianggap sudah dilihat.
      await supabase.from('seen_marks').upsert(missing.map((kind) => ({ user_id: uid, kind })),
        { onConflict: 'user_id,kind', ignoreDuplicates: true })
      m = await read()
    }
    return m
  }

  async function check() {
    const started = Date.now()
    const m = await loadMarks()
    if (!m || !alive.current) return
    const [t, mine, mt, g, qn, an] = await Promise.all([
      // Tanpa limit: daftar difilter di sisi klien agar tugas yang sudah dikerjakan tidak ikut terhitung.
      supabase.from('assignments').select('id,title').eq('status', 'active')
        .gt('created_at', m.tasks).order('created_at', { ascending: false }),
      supabase.from('submissions').select('assignment_id'),
      supabase.from('materials').select('id,title', { count: 'exact' })
        .gt('created_at', m.materials).order('created_at', { ascending: false }).limit(3),
      supabase.from('submissions').select('id,assignments(title)', { count: 'exact' })
        .not('score', 'is', null).gt('graded_at', m.grades).order('graded_at', { ascending: false }).limit(3),
      callApi('/api/quiz', { action: 'news' }).catch(() => ({ count: 0, titles: [] })),
      callApi('/api/announce', { action: 'news' }).catch(() => ({ count: 0, items: [] })),
    ])
    if (!alive.current) return
    // Tugas yang sudah pernah dikerjakan/dikirim/dinilai bukan lagi "tugas baru".
    const done = new Set((mine.data || []).map((x) => x.assignment_id))
    const newTasks = (t.data || []).filter((x) => !done.has(x.id))
    const c = { tasks: newTasks.length, materials: mt.count ?? 0, grades: g.count ?? 0, quiz: qn.count ?? 0, announce: an.count ?? 0 }
    // Hasil pengecekan ini bisa sudah basi kalau siswa membuka menunya selagi pengecekan berjalan.
    for (const k of Object.keys(c)) if ((cleared.current[k] || 0) >= started) c[k] = 0
    setCounts(c)
    if (first.current) {
      first.current = false
      if (c.tasks + c.materials + c.grades + c.quiz + c.announce > 0) {
        setPopup({
          tasks: { n: c.tasks, titles: newTasks.slice(0, 3).map((x) => x.title) },
          materials: { n: c.materials, titles: (mt.data || []).map((x) => x.title) },
          grades: { n: c.grades, titles: (g.data || []).map((x) => x.assignments?.title).filter(Boolean) },
          quiz: { n: c.quiz, titles: qn.titles || [] },
          announce: { n: c.announce, titles: (an.items || []).map((x) => x.title) },
        })
      }
    }
  }

  useEffect(() => {
    alive.current = true
    check()
    const id = setInterval(() => { if (document.visibilityState === 'visible') check() }, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive.current = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  async function markSeen(kind) {
    cleared.current[kind] = Date.now()
    setCounts((c) => (c[kind] ? { ...c, [kind]: 0 } : c))
    if (kind === 'announce') { try { await callApi('/api/announce', { action: 'seen' }) } catch { /* dicoba lagi saat menu dibuka */ } return }
    // Simpan lewat server; kalau gagal, coba fungsi lama di database.
    try { await callApi('/api/quiz', { action: 'seen', kind }) }
    catch { if (kind !== 'quiz') await supabase.rpc('mark_seen', { p_kind: kind }) }
  }

  return { counts, popup, closePopup: () => setPopup(null), markSeen }
}

const ROWS = [
  ['announce', 'pengumuman baru dari guru', 'Baca pengumuman'],
  ['grades', 'nilai baru', 'Lihat nilai'],
  ['quiz', 'quiz baru', 'Lihat quiz'],
  ['tasks', 'tugas baru', 'Lihat tugas'],
  ['materials', 'materi baru', 'Lihat materi'],
]

export function NotifPopup({ data, onClose, onGo }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const rows = ROWS.filter(([k]) => data[k].n > 0)
  return (
    <div className="nf-scrim" onClick={onClose}>
      <div className="nf-box" role="dialog" aria-modal="true" aria-label="Pemberitahuan" onClick={(e) => e.stopPropagation()}>
        <div className="nf-head">
          <h3>Ada yang baru untukmu</h3>
          <button className="nf-x" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        {rows.map(([k, label, go]) => {
          const { n, titles } = data[k]
          return (
            <div className="nf-item" key={k}>
              <div>
                <b>{n} {label}</b>
                <small>{titles.join(', ')}{n > titles.length ? ' dan lainnya' : ''}</small>
              </div>
              <button className="nf-go" onClick={() => onGo(k)}>{go}</button>
            </div>
          )
        })}
        <button className="btn ghost" style={{ marginTop: 14 }} onClick={onClose}>Tutup</button>
      </div>
    </div>
  )
}
