-- =========================================================
-- 0007: Emoji por producto — identificación visual rápida en POS e inventario
-- =========================================================
-- Nullable a propósito: `null` significa "usar el emoji de la categoría"
-- (fallback que ya existe en src/lib/producto-ui.ts). Así los productos
-- actuales conservan el ícono que venían mostrando.
alter table productos add column if not exists emoji text;

-- Backfill: deja persistido el emoji que hoy se calcula por categoría,
-- sin pisar los emojis ya elegidos manualmente.
update productos p
   set emoji = case c.nombre
                 when 'Golosinas'   then '🍬'
                 when 'Bebidas'     then '🥤'
                 when 'Snacks'      then '🍟'
                 when 'Cigarrillos' then '🚬'
               end
  from categorias c
 where c.id = p.categoria_id
   and p.emoji is null
   and c.nombre in ('Golosinas', 'Bebidas', 'Snacks', 'Cigarrillos');
