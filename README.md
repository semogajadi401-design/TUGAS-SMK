# Tugas Sekolah

Aplikasi tugas sekolah: guru membuat tugas, menilai, dan mengimpor siswa dari Excel; siswa mengirim jawaban (foto/teks) dan melihat nilai.
Stack: React + Vite, Supabase (Auth, Postgres, Storage), Vercel (hosting + fungsi `/api`).

## Menjalankan
1. `npm install`
2. Salin `.env.example` menjadi `.env` lalu isi.
3. `npm run dev` (fungsi `/api` hanya jalan di Vercel; lokal pakai `vercel dev`).

## Variabel di Vercel
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.

## Endpoint server
- `POST /api/import` : impor siswa (khusus guru).
- `POST /api/reset` : reset data terpilih (nilai, foto, jawaban, tugas, siswa, kelas, mapel) dari Pengaturan.
- `POST /api/student` : reset password, aktif/nonaktif, ubah nama/kelas (khusus guru).

## Database Supabase (yang dipakai kode)
Tabel: `profiles` (id, full_name, role, class_id, code, active, password_changed), `classes`, `assignments`,
`assignment_classes`, `submissions`, `submission_photos`, `app_settings`.
Bucket: `lampiran`, `jawaban`, `logo`. Fungsi RPC: `mark_password_changed`, `storage_usage_bytes`.
Mapel: jalankan `supabase/mapel.sql` sekali di SQL Editor (tabel `subjects` + kolom `assignments.subject_id`).
Simpan skema dan RLS policy Anda sebagai file SQL di `supabase/` supaya bisa dibuat ulang.
