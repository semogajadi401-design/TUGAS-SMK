-- Jalankan sekali di Supabase (SQL Editor -> New query -> Run). Aman diulang.
-- Fitur Pengumuman: guru menulis pengumuman untuk 1 kelas, beberapa kelas, atau semua kelas.
-- Seperti tabel quiz, semua tabel dikunci dari browser (RLS aktif TANPA policy, hak anon/authenticated
-- dicabut). Hanya fungsi server /api/announce yang membaca/menulis, jadi siswa hanya bisa melihat
-- pengumuman untuk kelasnya sendiri.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  all_classes boolean not null default false,       -- true = semua kelas, termasuk kelas yang dibuat nanti
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcement_classes (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key (announcement_id, class_id)
);

-- Penanda "sudah dibaca" per siswa (dipakai angka kecil di menu dan popup saat masuk).
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, student_id)
);

create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists announcement_classes_class_idx on public.announcement_classes (class_id);
create index if not exists announcement_reads_student_idx on public.announcement_reads (student_id);

alter table public.announcements        enable row level security;
alter table public.announcement_classes enable row level security;
alter table public.announcement_reads   enable row level security;

revoke all on public.announcements, public.announcement_classes, public.announcement_reads
  from anon, authenticated;
