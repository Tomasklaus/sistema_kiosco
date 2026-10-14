-- =========================================================
-- 0006: Permisos de equipo — proteger owner, perfil propio, admin limita cajeros
-- =========================================================
-- Un usuario desactivado (o sin tenant vía RLS) debe poder leer su propio perfil
-- para que la app muestre "acceso desactivado" en lugar de un shell vacío.
drop policy if exists "ver mi propio perfil" on profiles;
create policy "ver mi propio perfil" on profiles for
select using (id = auth.uid());
-- Solo el dueño modifica roles/activo. Nunca se puede alterar a otro owner.
create or replace function actualizar_miembro(p_user uuid, p_rol rol_usuario, p_activo boolean) returns void language plpgsql security definer
set search_path = public as $$
declare v_target profiles;
begin if coalesce(rol_actual()::text, '') <> 'owner' then raise exception 'Solo el dueño puede modificar el equipo';
end if;
if p_user = auth.uid() then raise exception 'No podés modificarte a vos mismo';
end if;
if p_rol not in ('admin', 'cajero') then raise exception 'Rol inválido';
end if;
select * into v_target
from profiles
where id = p_user
  and tenant_id = current_tenant_id();
if not found then raise exception 'Miembro no encontrado';
end if;
if v_target.rol = 'owner' then raise exception 'No se puede modificar al dueño del negocio';
end if;
update profiles
set rol = p_rol,
  activo = p_activo
where id = p_user
  and tenant_id = current_tenant_id();
end $$;
revoke all on function actualizar_miembro(uuid, rol_usuario, boolean)
from public,
  anon;
grant execute on function actualizar_miembro(uuid, rol_usuario, boolean) to authenticated;