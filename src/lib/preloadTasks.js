// src/lib/preloadTasks.js
// Nama tabel diambil dari README repo TUGAS-SMK.
// Cek 3 hal bertanda (CEK) sebelum dipakai.
import { supabase } from './supabase' // (CEK) path client Supabase Anda, mis. ./supabaseClient

const table = (name, build) => async () => {
  const q = supabase.from(name).select('*')
  const { data, error } = await (build ? build(q) : q)
  if (error) throw error
  return data
}

// Unduh kode halaman lebih awal (Vite memecah tiap halaman jadi file terpisah)
const warmPage = (loader) => () => loader().then(() => true)

export function buildTasks({ role }) {
  // (CEK) nilai kolom profiles.role untuk guru; sesuaikan bila berbeda
  const isTeacher = ['guru', 'teacher', 'admin'].includes(role)

  const common = [
    { id: 'classes', label: 'Data kelas', run: table('classes') },
    { id: 'subjects', label: 'Mata pelajaran', run: table('subjects') },
    { id: 'assignments', label: 'Daftar tugas', run: table('assignments') },
    { id: 'assignment_classes', label: 'Tugas per kelas', run: table('assignment_classes') },
    { id: 'submissions', label: isTeacher ? 'Jawaban masuk' : 'Jawaban kamu', run: table('submissions') },
    { id: 'app_settings', label: 'Pengaturan aplikasi', run: table('app_settings') },
    // (CEK) ganti dengan file halaman utama Anda di src/, boleh ditambah beberapa baris
    // { id: 'page-home', label: 'Halaman aplikasi', run: warmPage(() => import('../pages/Home')) },
  ]

  if (isTeacher) {
    return [
      { id: 'profiles', label: 'Data siswa', run: table('profiles') },
      ...common,
    ]
  }
  return common
}
