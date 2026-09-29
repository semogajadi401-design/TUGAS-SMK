-- Jalankan sekali di Supabase (SQL Editor -> New query -> Run).
-- Syarat: supabase/mapel.sql sudah dijalankan lebih dulu.

-- Minta perbaikan: catatan dari guru saat jawaban dikembalikan ke siswa
alter table public.submissions add column if not exists return_note text;

-- Tugas kelompok
alter table public.assignments add column if not exists is_group boolean not null default false;

create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  name text not null,
  leader_id uuid references public.profiles(id) on delete set null
);
create table if not exists public.task_group_members (
  group_id uuid not null references public.task_groups(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  primary key (assignment_id, student_id)
);
-- RLS aktif tanpa policy: tabel ini hanya diakses lewat fungsi server (/api/group).
alter table public.task_groups enable row level security;
alter table public.task_group_members enable row level security;
