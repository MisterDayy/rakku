-- =========================================================
-- FONDASI ROLE / LEVEL / EXP / BAN buat Rakku
-- Jalankan file ini di Supabase Dashboard -> SQL Editor -> Run
-- Aman dijalankan berkali-kali (idempotent).
-- =========================================================

-- 1. Tabel profiles ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

-- Kalau tabel profiles udah ada sebelumnya (dari percobaan lain / project lama),
-- CREATE TABLE IF NOT EXISTS di atas bakal di-skip dan kolom di bawah ini
-- bisa jadi belum ada. Makanya ditambahin manual satu-satu biar aman:
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists level int not null default 1;
alter table public.profiles add column if not exists exp int not null default 0;
alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists banned_reason text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- pastiin constraint validasi role ada (aman dijalankan berkali-kali)
do $$
begin
  alter table public.profiles add constraint profiles_role_check check (role in ('user', 'moderator', 'admin'));
exception when duplicate_object then null;
end $$;

-- 2. Auto-buat row profile begitu ada user baru daftar --------------
-- CATATAN: function handle_new_user() + trigger on_auth_user_created
-- udah ada duluan di project ini (bikinan kamu sendiri, ada fallback
-- username dari email). SENGAJA GAK DISENTUH biar behavior lama gak berubah.

-- 3. Backfill: jaga-jaga kalau ada user lama yang somehow belum punya profile
insert into public.profiles (id, username)
select id, raw_user_meta_data->>'username'
from auth.users
on conflict (id) do nothing;

-- 4. Row Level Security -----------------------------------------------
alter table public.profiles enable row level security;

-- helper: cek apakah user yang login sekarang admin/moderator
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.is_staff());

-- Catatan: sengaja TIDAK ada policy insert/update/delete buat client.
-- Semua perubahan role/level/exp/ban HARUS lewat function RPC di bawah,
-- biar user biasa gak bisa modif role/exp/level dirinya sendiri lewat table langsung.

-- 5. Function RPC buat admin panel (dipakai fase 2 nanti) -------------

-- ganti role user (cuma admin)
create or replace function public.admin_set_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_role not in ('user', 'moderator', 'admin') then
    raise exception 'Role tidak valid';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Hanya admin yang bisa ganti role user';
  end if;

  update public.profiles set role = new_role where id = target_id;
end;
$$;

-- ban user (admin & moderator)
create or replace function public.admin_ban_user(target_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'moderator')) then
    raise exception 'Tidak punya akses buat ban user';
  end if;

  update public.profiles set is_banned = true, banned_reason = reason where id = target_id;
end;
$$;

-- unban user (admin & moderator)
create or replace function public.admin_unban_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'moderator')) then
    raise exception 'Tidak punya akses buat unban user';
  end if;

  update public.profiles set is_banned = false, banned_reason = null where id = target_id;
end;
$$;

-- set/reset level user (cuma admin) - reset level tinggal panggil dengan new_level = 1
create or replace function public.admin_set_level(target_id uuid, new_level int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Hanya admin yang bisa ubah level user';
  end if;

  if new_level < 1 then
    raise exception 'Level minimal 1';
  end if;

  update public.profiles set level = new_level where id = target_id;
end;
$$;

-- tambah exp user (cuma admin)
-- Catatan: ini terpisah dari function award_exp_once() yang udah ada
-- (yang jalan otomatis pas user baca/nonton). Ini khusus buat admin
-- kasih exp manual dari panel, gak nyatet ke exp_events.
create or replace function public.admin_add_exp(target_id uuid, amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Hanya admin yang bisa nambah exp user';
  end if;

  update public.profiles set exp = exp + amount where id = target_id;
end;
$$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_ban_user(uuid, text) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;
grant execute on function public.admin_set_level(uuid, int) to authenticated;
grant execute on function public.admin_add_exp(uuid, int) to authenticated;
