import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Kode siswa -> email palsu di belakang layar. Guru boleh mengetik email lengkap.
export const toEmail = (input) => {
  const v = input.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@sekolah.app`
}
