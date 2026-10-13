-- =========================================================
-- 0003: PANEL ADMIN DE PLATAFORMA (estadísticas de uso)
-- Sin service_role: funciones SECURITY DEFINER que solo responden a platform_admins
-- y devuelven únicamente datos agregados (no productos ni clientes de cada negocio).
-- =========================================================

create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;  -- sin políticas: nadie accede por la API

create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function admin_resumen()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_platform_admin() then raise exception 'No autorizado'; end if;
  select jsonb_build_object(
    'negocios',      (select count(*) from tenants),
    'usuarios',      (select count(*) from profiles),
    'nuevos_7d',     (select count(*) from tenants where created_at > now() - interval '7 days'),
    'activos_7d',    (select count(distinct tenant_id) from ventas where created_at > now() - interval '7 days'),
    'ventas_total',  (select count(*) from ventas where estado = 'completada'),
    'monto_total',   (select coalesce(sum(total), 0) from ventas where estado = 'completada'),
    'ventas_30d',    (select count(*) from ventas where estado = 'completada' and created_at > now() - interval '30 days'),
    'monto_30d',     (select coalesce(sum(total), 0) from ventas where estado = 'completada' and created_at > now() - interval '30 days')
  ) into r;
  return r;
end $$;

create or replace function admin_tenants()
returns table (
  id uuid, nombre text, created_at timestamptz, usuarios bigint, productos bigint,
  ventas bigint, monto numeric, ultima_venta timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'No autorizado'; end if;
  return query
    select t.id, t.nombre, t.created_at,
           (select count(*) from profiles p where p.tenant_id = t.id),
           (select count(*) from productos pr where pr.tenant_id = t.id),
           count(v.id) filter (where v.estado = 'completada'),
           coalesce(sum(v.total) filter (where v.estado = 'completada'), 0),
           max(v.created_at)
      from tenants t left join ventas v on v.tenant_id = t.id
     group by t.id
     order by max(v.created_at) desc nulls last, t.created_at desc;
end $$;

create or replace function admin_actividad_diaria(p_dias int default 30)
returns table (dia date, ventas bigint, monto numeric, nuevos_negocios bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'No autorizado'; end if;
  return query
    with dias as (
      select generate_series(
        (now() at time zone 'America/Argentina/Buenos_Aires')::date - (p_dias - 1),
        (now() at time zone 'America/Argentina/Buenos_Aires')::date, interval '1 day')::date as d
    )
    select d.d,
      (select count(*) from ventas v where v.estado = 'completada'
         and (v.created_at at time zone 'America/Argentina/Buenos_Aires')::date = d.d),
      (select coalesce(sum(v.total), 0) from ventas v where v.estado = 'completada'
         and (v.created_at at time zone 'America/Argentina/Buenos_Aires')::date = d.d),
      (select count(*) from tenants t
         where (t.created_at at time zone 'America/Argentina/Buenos_Aires')::date = d.d)
    from dias d order by d.d;
end $$;

revoke all on function admin_resumen(), admin_tenants(), admin_actividad_diaria(int) from public, anon;
grant execute on function is_platform_admin(), admin_resumen(), admin_tenants(), admin_actividad_diaria(int) to authenticated;

-- Para darte acceso, ejecutá (cambiando el email por el tuyo):
-- insert into platform_admins (user_id) select id from auth.users where email = 'TU_EMAIL';
