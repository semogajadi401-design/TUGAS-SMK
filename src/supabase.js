import { createClient } from '@supabase/supabase-js'
import { isNetError } from './lib/net.js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Kode siswa -> email palsu di belakang layar. Guru boleh mengetik email lengkap.
export const toEmail = (input) => {
  const v = input.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@sekolah.app`
}

// Kegagalan karena jaringan/server (BUKAN karena password salah).
export const isAuthDown = (e) => !!e && (isNetError(e) || e.status === 0 || e.status >= 500 ||
  e.name === 'AuthRetryableFetchError')

// Masuk dengan password apa adanya, lalu versi huruf besar (password awal = kode siswa, huruf besar).
// Server yang tidak merespons dalam `ms` dianggap gangguan jaringan supaya layar tidak menggantung.
// Mengembalikan { error, password } dengan `password` = versi yang berhasil dipakai.
export async function signIn(email, password, ms = 15000) {
  const attempt = (pw) => Promise.race([
    supabase.auth.signInWithPassword({ email, password: pw }).catch((e) => ({ error: e })),
    new Promise((r) => setTimeout(() => r({ error: { name: 'AuthRetryableFetchError', status: 0, message: 'timeout' } }), ms)),
  ])
  let pw = password
  let { error } = await attempt(pw)
  if (error && !isAuthDown(error) && pw !== pw.toUpperCase()) {
    pw = pw.toUpperCase()
    ;({ error } = await attempt(pw))
  }
  return { error, password: pw }
}
