-- Status online & riwayat login siswa. Jalankan sekali di Supabase > SQL Editor.
-- Aman dijalankan berulang kali.

alter table public.profiles
  add column if not exists last_login_at timestamptz,
  add column if not exists last_seen_at  timestamptz;

-- Dipanggil siswa untuk mencatat dirinya sendiri (login = true saat baru masuk, false = tanda masih aktif).
create or replace function public.touch_presence(p_login boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at  = now(),
         last_login_at = case when p_login then now() else last_login_at end
   where id = auth.uid();
$$;

revoke all on function public.touch_presence(boolean) from public;
grant execute on function public.touch_presence(boolean) to authenticated;
