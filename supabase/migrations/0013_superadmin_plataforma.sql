-- =========================================================
-- 0013: SUPERADMIN DE PLATAFORMA PARA tomasklaus17@gmail.com
-- =========================================================

-- Asegurar que la tabla platform_admins exista
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- Vincular a tomasklaus17@gmail.com si ya existe el usuario en auth.users
insert into platform_admins (user_id)
select id from auth.users where lower(email) = 'tomasklaus17@gmail.com'
on conflict (user_id) do nothing;

-- Actualizar is_platform_admin() para verificar tanto por ID en platform_admins
-- como por email verificado de SuperAdmin principal
create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid()
  ) or exists (
    select 1 from auth.users where id = auth.uid() and lower(email) = 'tomasklaus17@gmail.com'
  );
$$;

