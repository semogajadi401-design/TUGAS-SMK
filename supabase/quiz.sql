-- Jalankan sekali di Supabase (SQL Editor -> New query -> Run). Aman diulang.
-- Syarat: supabase/mapel.sql sudah dijalankan (tabel subjects).
-- Semua tabel quiz dikunci total dari browser: RLS aktif TANPA policy, dan hak akses
-- anon/authenticated dicabut. Hanya fungsi server (/api/quiz) yang bisa membaca/menulis,
-- jadi kunci jawaban dan pilihan siswa tidak bisa diintip lewat tab Network.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  instructions text,
  duration_min int check (duration_min is null or duration_min between 1 and 600),
  open_at timestamptz,
  close_at timestamptz,
  shuffle boolean not null default true,            -- acak urutan soal per siswa
  reveal text not null default 'submit' check (reveal in ('submit', 'close')),
                                                    -- submit: hasil benar/salah tampil begitu selesai
                                                    -- close : tampil setelah waktu tutup (close_at wajib)
  status text not null default 'published' check (status in ('draft', 'published')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_classes (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key (quiz_id, class_id)
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position int not null,
  text text,
  image_path text,                                  -- bucket "lampiran"
  options jsonb not null,                           -- ["opsi A", "opsi B", ...] (2-6 opsi)
  points int not null default 1
);

-- Kunci jawaban dipisah dari soal. Isinya indeks opsi yang benar (0 = A, 1 = B, ...).
create table if not exists public.quiz_keys (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  correct int not null check (correct >= 0)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  "order" jsonb,                                    -- urutan id soal yang dilihat siswa ini
  answers jsonb not null default '{}'::jsonb,       -- { "<id soal>": indeksOpsi } (RAHASIA)
  per_question jsonb,                               -- { "<id soal>": true/false }
  correct_count int,
  total int,
  score numeric(5,2),
  unique (quiz_id, student_id)                      -- satu kali percobaan per siswa
);

create index if not exists quiz_classes_class_idx   on public.quiz_classes (class_id);
create index if not exists quiz_questions_quiz_idx  on public.quiz_questions (quiz_id, position);
create index if not exists quiz_attempts_quiz_idx   on public.quiz_attempts (quiz_id);
create index if not exists quiz_attempts_student_idx on public.quiz_attempts (student_id);

alter table public.quizzes        enable row level security;
alter table public.quiz_classes   enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_keys      enable row level security;
alter table public.quiz_attempts  enable row level security;

revoke all on public.quizzes, public.quiz_classes, public.quiz_questions,
              public.quiz_keys, public.quiz_attempts from anon, authenticated;
