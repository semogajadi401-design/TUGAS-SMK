-- Jalankan sekali di Supabase (SQL Editor -> New query -> Run). Aman diulang.
-- Syarat: supabase/quiz.sql sudah dijalankan.
-- Waktu per soal (detik). Kosong (null) = tanpa batas waktu per soal.
alter table public.quizzes add column if not exists question_seconds int
  check (question_seconds is null or question_seconds between 5 and 600);
