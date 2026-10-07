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

## Fitur tambahan
Jalankan `supabase/mapel.sql` lalu `supabase/fitur-baru.sql` (jawaban dikembalikan, tugas kelompok).
Variabel Vercel tambahan: `CRON_SECRET` (bebas, untuk cadangan mingguan otomatis; jadwal ada di `vercel.json`).
Endpoint: `/api/task` (ubah/hapus tugas), `/api/group` (kelompok), `/api/backup` (cadangan Excel).

Quiz: jalankan `supabase/quiz.sql` lalu `supabase/durasi-per-soal.sql` (waktu per soal dalam detik, hitung mundur per soal, pindah otomatis).

## Mode offline dan notifikasi (siswa)

**Offline.** Aplikasi memasang service worker (`/sw.js`, dibuat otomatis saat build) dan bisa dipasang ke layar utama.
Halaman tugas yang pernah dibuka saat online (soal, gambar soal, lampiran, foto jawaban) tersimpan di perangkat
(IndexedDB) dan tetap bisa dibuka dan dikerjakan saat offline. Saat offline hanya ada tombol **Simpan di perangkat**
(isian juga tersimpan otomatis). Setelah internet kembali muncul toast pengingat dan tombol **Kirim jawaban**.
Jawaban tidak dikirim otomatis dan batas waktu tetap dicek saat dikirim, jadi tidak ada celah mengumpulkan terlambat.
Halaman lain (Beranda, Materi, Quiz, Nilai) tetap butuh internet.

**Notifikasi push.** Tugas, materi, quiz, dan nilai baru, plus pengingat tenggat harian (tugas yang berakhir hari ini
atau besok dan belum dikirim). Langkah pengaturan, sekali saja:
1. `npm install` (menambah paket `web-push`).
2. Buat kunci: `npx web-push generate-vapid-keys`.
3. Variabel di Vercel: `VITE_VAPID_PUBLIC_KEY` (kunci publik), `VAPID_PUBLIC_KEY` (sama), `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (mis. `mailto:guru@sekolah.sch.id`), `PUSH_HOOK_SECRET` (kata acak panjang), dan opsional
   `REMINDER_TZ_OFFSET` (8 = WITA, bawaan; 7 = WIB; 9 = WIT). `CRON_SECRET` sudah ada.
4. Buka `supabase/push.sql`, ganti `v_url` (alamat aplikasi + `/api/push`) dan `v_secret` (sama dengan `PUSH_HOOK_SECRET`), lalu jalankan di SQL Editor.
5. Deploy ulang (variabel `VITE_...` hanya terbaca saat build).
6. Di HP siswa: tab Akun, **Aktifkan pemberitahuan**, lalu **Kirim percobaan**.

Pengingat tenggat berjalan lewat cron harian `0 10 * * *` (UTC) di `vercel.json`, yaitu pukul 18.00 WITA.
Endpoint baru: `/api/push` (pendaftaran perangkat, kejadian dari database, pengingat).
Batas: iPhone/iPad hanya bisa menerima notifikasi bila aplikasi sudah ditambahkan ke Layar Utama; browser di dalam
aplikasi lain (WhatsApp, Instagram) tidak mendukungnya; beberapa HP (Xiaomi, Oppo, Vivo) bisa menunda notifikasi
bila penghemat baterai membatasi browser.
