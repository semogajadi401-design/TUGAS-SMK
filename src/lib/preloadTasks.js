// src/lib/preloadTasks.js
// SESUAIKAN nama tabel & kolom dengan database Supabase Anda.
import { supabase } from './supabase' // <- sesuaikan path client Supabase Anda

const table = (name, build) => async () => {
  const q = supabase.from(name).select('*')
  const { data, error } = await (build ? build(q) : q)
  if (error) throw error
  return data
}

// Modul halaman diunduh lebih awal (Vite memecah tiap halaman jadi file terpisah)
const warmPage = (loader) => () => loader().then(() => true)

export function buildTasks({ role, userId }) {
  const common = [
    { id: 'kelas', label: 'Data kelas', run: table('kelas') },
    { id: 'mapel', label: 'Mata pelajaran', run: table('mapel') },
    { id: 'halaman', label: 'Halaman aplikasi', run: warmPage(() => import('../pages/Index')) },
  ]

  if (role === 'guru') {
    return [
      ...common,
      { id: 'tugas', label: 'Daftar tugas', run: table('tugas', (q) => q.order('created_at', { ascending: false })) },
      { id: 'siswa', label: 'Data siswa', run: table('siswa') },
      { id: 'jawaban', label: 'Jawaban masuk', run: table('jawaban', (q) => q.order('created_at', { ascending: false }).limit(200)) },
    ]
  }

  // siswa
  return [
    ...common,
    { id: 'tugas', label: 'Tugas untuk kamu', run: table('tugas', (q) => q.order('created_at', { ascending: false })) },
    { id: 'jawaban', label: 'Jawaban kamu', run: table('jawaban', (q) => q.eq('siswa_id', userId)) },
  ]
}
