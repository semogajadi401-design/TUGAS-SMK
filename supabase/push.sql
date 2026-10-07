-- Notifikasi push. Jalankan sekali di Supabase (SQL Editor -> New query -> Run). Aman diulang.
-- SEBELUM dijalankan, ganti dua nilai di fungsi push_notify di bawah:
--   v_url    -> alamat aplikasi Anda di Vercel + /api/push
--   v_secret -> kata acak panjang; isi sama persis dengan variabel PUSH_HOOK_SECRET di Vercel

-- Perangkat siswa yang mengaktifkan notifikasi. Hanya diakses lewat server (/api/push).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- Catatan pemberitahuan yang sudah terkirim, supaya tidak terkirim dua kali.
create table if not exists public.push_log (
  key text primary key,
  at timestamptz not null default now()
);
create index if not exists push_log_at_idx on public.push_log(at);

alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_log from anon, authenticated;

-- Mengirim kejadian ke /api/push lewat pg_net (asinkron: tidak memperlambat guru saat menyimpan).
create extension if not exists pg_net with schema extensions;

create or replace function public.push_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url    text := 'https://GANTI-DENGAN-DOMAIN-ANDA.vercel.app/api/push';
  v_secret text := 'GANTI-DENGAN-RAHASIA-PANJANG';
begin
  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA,
                   'record', to_jsonb(new),
                   'old_record', case when TG_OP = 'UPDATE' then to_jsonb(old) else null end),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret)
    );
  exception when others then
    null; -- pemberitahuan tidak boleh menggagalkan penyimpanan data guru
  end;
  return null;
end $$;
revoke all on function public.push_notify() from public, anon, authenticated;

-- Tugas, materi, dan quiz baru: dikirim saat tautan kelasnya dibuat (kelas tujuannya baru diketahui saat itu).
drop trigger if exists push_assignment_classes on public.assignment_classes;
create trigger push_assignment_classes after insert on public.assignment_classes
  for each row execute function public.push_notify();

drop trigger if exists push_material_classes on public.material_classes;
create trigger push_material_classes after insert on public.material_classes
  for each row execute function public.push_notify();

drop trigger if exists push_quiz_classes on public.quiz_classes;
create trigger push_quiz_classes after insert on public.quiz_classes
  for each row execute function public.push_notify();

-- Nilai tugas keluar pertama kali.
drop trigger if exists push_submission_grade on public.submissions;
create trigger push_submission_grade after update of score on public.submissions
  for each row when (old.score is null and new.score is not null)
  execute function public.push_notify();
