-- =========================================================
-- EXTENSIONES Y TIPOS
-- =========================================================
create extension if not exists "pgcrypto";

create type rol_usuario      as enum ('owner', 'admin', 'cajero');
create type metodo_pago      as enum ('efectivo', 'mercadopago', 'tarjeta', 'cuenta_corriente');
create type estado_turno     as enum ('abierto', 'cerrado');
create type estado_venta     as enum ('completada', 'anulada');
create type tipo_mov_caja    as enum ('ingreso_venta', 'ingreso_cobro_deuda', 'ingreso_manual', 'egreso_proveedor', 'egreso_manual');
create type tipo_mov_cuenta  as enum ('cargo', 'pago');

-- =========================================================
-- TENANTS Y PERFILES (usuarios ligados a un tenant)
-- =========================================================
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  nombre      text,
  rol         rol_usuario not null default 'cajero',
  created_at  timestamptz not null default now()
);
create index on profiles(tenant_id);

-- Helper: tenant del usuario logueado (SECURITY DEFINER evita recursión de RLS)
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- =========================================================
-- CATÁLOGO
-- =========================================================
create table categorias (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  nombre     text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);

create table productos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  categoria_id  uuid references categorias(id) on delete set null,
  codigo_barras text,
  nombre        text not null,
  precio_costo  numeric(12,2) not null default 0 check (precio_costo >= 0),
  precio_venta  numeric(12,2) not null check (precio_venta >= 0),
  stock         numeric(12,3) not null default 0,
  stock_minimo  numeric(12,3) not null default 0,
  acceso_rapido boolean not null default false,   -- botones de productos frecuentes
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, codigo_barras)
);
create index on productos(tenant_id, categoria_id);
create index on productos(tenant_id, nombre);
create index on productos(tenant_id) where stock <= stock_minimo;  -- alertas de stock

-- =========================================================
-- CLIENTES / CUENTA CORRIENTE
-- =========================================================
create table clientes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  nombre     text not null,
  telefono   text,
  limite_credito numeric(12,2),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create index on clientes(tenant_id);

-- =========================================================
-- CAJA: TURNOS
-- =========================================================
create table turnos_caja (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  usuario_apertura uuid not null default auth.uid() references profiles(id),
  usuario_cierre   uuid references profiles(id),
  estado           estado_turno not null default 'abierto',
  monto_inicial    numeric(12,2) not null default 0,
  efectivo_esperado numeric(12,2),   -- calculado al cierre
  efectivo_contado  numeric(12,2),   -- declarado por el cajero
  diferencia        numeric(12,2),
  abierto_at       timestamptz not null default now(),
  cerrado_at       timestamptz
);
create index on turnos_caja(tenant_id, estado);
-- Un solo turno abierto por tenant
create unique index un_turno_abierto_por_tenant on turnos_caja(tenant_id) where estado = 'abierto';

-- =========================================================
-- VENTAS
-- =========================================================
create table ventas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  turno_id    uuid not null references turnos_caja(id),
  cliente_id  uuid references clientes(id),        -- obligatorio si es a cuenta
  usuario_id  uuid not null default auth.uid() references profiles(id),
  total       numeric(12,2) not null check (total >= 0),
  metodo_pago metodo_pago not null,
  monto_recibido numeric(12,2),                    -- para calcular vuelto (efectivo)
  vuelto      numeric(12,2),
  estado      estado_venta not null default 'completada',
  created_at  timestamptz not null default now(),
  check (metodo_pago <> 'cuenta_corriente' or cliente_id is not null)
);
create index on ventas(tenant_id, created_at desc);
create index on ventas(turno_id);

create table venta_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  venta_id        uuid not null references ventas(id) on delete cascade,
  producto_id     uuid not null references productos(id),
  nombre_producto text not null,                   -- snapshot histórico
  cantidad        numeric(12,3) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  precio_costo    numeric(12,2) not null default 0, -- snapshot para ganancia
  subtotal        numeric(12,2) not null
);
create index on venta_items(venta_id);
create index on venta_items(tenant_id, producto_id);

-- =========================================================
-- MOVIMIENTOS DE CAJA (ingresos / egresos)
-- =========================================================
create table movimientos_caja (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  turno_id    uuid not null references turnos_caja(id),
  tipo        tipo_mov_caja not null,
  metodo_pago metodo_pago not null check (metodo_pago <> 'cuenta_corriente'),
  monto       numeric(12,2) not null check (monto > 0),  -- signo implícito por 'tipo'
  descripcion text,                                      -- ej: "Pago proveedor Coca-Cola"
  venta_id    uuid references ventas(id),
  usuario_id  uuid not null default auth.uid() references profiles(id),
  created_at  timestamptz not null default now()
);
create index on movimientos_caja(tenant_id, turno_id);

-- =========================================================
-- CUENTA CORRIENTE (libro mayor del fiado)
-- saldo del cliente = sum(cargo) - sum(pago)
-- =========================================================
create table movimientos_cuenta (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  tipo        tipo_mov_cuenta not null,
  monto       numeric(12,2) not null check (monto > 0),
  venta_id    uuid references ventas(id),
  metodo_pago metodo_pago check (metodo_pago <> 'cuenta_corriente'), -- solo en pagos
  notas       text,
  created_at  timestamptz not null default now()
);
create index on movimientos_cuenta(tenant_id, cliente_id);

create view clientes_saldo with (security_invoker = true) as
select c.*, coalesce(sum(case m.tipo when 'cargo' then m.monto else -m.monto end), 0) as saldo
from clientes c left join movimientos_cuenta m on m.cliente_id = c.id
group by c.id;

-- =========================================================
-- AUMENTO MASIVO DE PRECIOS POR CATEGORÍA
-- =========================================================
create or replace function aplicar_aumento_categoria(p_categoria uuid, p_porcentaje numeric)
returns int language plpgsql security invoker as $$
declare filas int;
begin
  update productos
     set precio_venta = round(precio_venta * (1 + p_porcentaje / 100), 2),
         updated_at = now()
   where categoria_id = p_categoria;      -- RLS limita al tenant actual
  get diagnostics filas = row_count;
  return filas;
end $$;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table tenants  enable row level security;
alter table profiles enable row level security;

create policy "ver mi tenant" on tenants for select using (id = current_tenant_id());
create policy "ver perfiles de mi tenant" on profiles for select using (tenant_id = current_tenant_id());
create policy "editar mi perfil" on profiles for update using (id = auth.uid()) with check (tenant_id = current_tenant_id());

-- Políticas idénticas para todas las tablas con tenant_id
do $$
declare t text;
begin
  foreach t in array array['categorias','productos','clientes','turnos_caja','ventas',
                           'venta_items','movimientos_caja','movimientos_cuenta']
  loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy "tenant_select" on %I for select using (tenant_id = current_tenant_id())$p$, t);
    execute format($p$create policy "tenant_insert" on %I for insert with check (tenant_id = current_tenant_id())$p$, t);
    execute format($p$create policy "tenant_update" on %I for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id())$p$, t);
    execute format($p$create policy "tenant_delete" on %I for delete using (tenant_id = current_tenant_id())$p$, t);
  end loop;
end $$;

-- =========================================================
-- ONBOARDING: al registrarse, crear tenant + perfil owner
-- =========================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare nuevo_tenant uuid;
begin
  insert into tenants(nombre) values (coalesce(new.raw_user_meta_data->>'negocio', 'Mi negocio'))
  returning id into nuevo_tenant;
  insert into profiles(id, tenant_id, nombre, rol)
  values (new.id, nuevo_tenant, new.raw_user_meta_data->>'nombre', 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();
