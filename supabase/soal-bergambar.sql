-- Jalankan sekali di Supabase (SQL Editor -> New query -> Run). Aman diulang.
-- Soal per nomor (teks + gambar) dan jawaban per nomor.

-- Daftar soal: [{ "id": "...", "text": "...", "image_path": "..." | null }]
alter table public.assignments add column if not exists questions jsonb;

-- Jawaban teks per soal: { "<id soal>": "jawaban" }
alter table public.submissions add column if not exists answers jsonb;

-- Foto jawaban milik soal tertentu (null = foto tugas lama tanpa soal)
alter table public.submission_photos add column if not exists question_id text;
