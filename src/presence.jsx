import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import './online.css'

const CHANNEL = 'siswa-online'
const HEARTBEAT = 2 * 60 * 1000

async function touch(login) {
  try { await supabase.rpc('touch_presence', { p_login: login }) } catch { /* abaikan */ }
}

// SISWA: umumkan "saya online" selama aplikasi terbuka + catat waktu login/aktif.
export function useStudentPresence(profile, kelas) {
  const ch = useRef(null)
  const ready = useRef(false)
  const meta = useRef({})
  meta.current = { name: profile.full_name, kelas: kelas || '' }

  useEffect(() => {
    const id = profile.id
    const c = supabase.channel(CHANNEL, { config: { presence: { key: id } } })
    ch.current = c
    c.subscribe((status) => {
      if (status === 'SUBSCRIBED') { ready.current = true; c.track(meta.current) }
    })

    // Login dicatat sekali per kunjungan (bukan setiap muat ulang halaman).
    const flag = 'login-noted-' + id
    let first = true
    try { first = !sessionStorage.getItem(flag); sessionStorage.setItem(flag, '1') } catch { /* abaikan */ }
    touch(first)

    const beat = setInterval(() => { if (!document.hidden) touch(false) }, HEARTBEAT)
    const vis = () => { if (!document.hidden) touch(false) }
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(beat); document.removeEventListener('visibilitychange', vis)
      ready.current = false; supabase.removeChannel(c)
    }
  }, [profile.id])

  // Nama kelas baru tersedia setelah dimuat: perbarui data yang diumumkan.
  useEffect(() => { if (ready.current) ch.current?.track(meta.current) }, [kelas])
}

// GURU: pantau siswa yang online secara realtime. Hasil: { [idSiswa]: { name, kelas } }
export function useOnlineStudents() {
  const [map, setMap] = useState({})
  useEffect(() => {
    const c = supabase.channel(CHANNEL)
    const sync = () => {
      const m = {}
      for (const [id, arr] of Object.entries(c.presenceState())) m[id] = arr[arr.length - 1] || {}
      setMap(m)
    }
    c.on('presence', { event: 'sync' }, sync).subscribe()
    return () => { supabase.removeChannel(c) }
  }, [])
  return map
}

const pad = (n) => String(n).padStart(2, '0')
export function fmtWhen(d) {
  if (!d) return 'Belum pernah'
  const x = new Date(d), now = new Date()
  const day = (v) => { const t = new Date(v); t.setHours(0, 0, 0, 0); return t }
  const diff = Math.round((day(now) - day(x)) / 864e5)
  const jam = `${pad(x.getHours())}.${pad(x.getMinutes())}`
  if (diff === 0) return `Hari ini, ${jam}`
  if (diff === 1) return `Kemarin, ${jam}`
  return x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + `, ${jam}`
}

export const OnlineDot = () => <span className="on-dot" aria-hidden="true" />
