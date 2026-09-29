-- Jalankan sekali di Supabase: SQL Editor -> New query -> Run
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists subjects_name_key on public.subjects (lower(name));

alter table public.subjects enable row level security;

drop policy if exists subjects_read on public.subjects;
create policy subjects_read on public.subjects
  for select to authenticated using (true);

drop policy if exists subjects_teacher_write on public.subjects;
create policy subjects_teacher_write on public.subjects
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.active))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.active));

alter table public.assignments
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;
