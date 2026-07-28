-- 0011 — Stock (v0). A despensa (0006) ganha saldo e rasto: quantidade em mão
-- por ingrediente, movimentos imutáveis (entradas de faturas, abates de vendas,
-- quebras, ajustes) e o mapa POS→prato que a conciliação do SAF-T usa (0012).
-- Desenho no Plano_Demo_Nostos_Completa + Plano_Demo_Primeiro_Cliente (28-07).
-- Independente da 0010: só toca em ingredients/menu_items base (0005/0006).

-- ── 1) Saldo e mínimo no ingrediente ─────────────────────────────────────────
alter table public.ingredients
  add column if not exists stock_qty numeric(14,3) not null default 0,
  add column if not exists low_stock_threshold numeric(14,3)
    check (low_stock_threshold is null or low_stock_threshold >= 0);

-- ── 2) Movimentos de stock (imutáveis) ───────────────────────────────────────
-- Convenção de sinal: positivo entra, negativo sai. O kind fixa o sinal para o
-- rasto não ter ambiguidade: purchase>0; sale_depletion/waste<0; adjustment≠0.
create table if not exists public.stock_movements (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id       uuid not null references public.ingredients(id) on delete cascade,
  kind                text not null
    check (kind in ('purchase','sale_depletion','adjustment','waste')),
  qty                 numeric(14,3) not null,
  unit                text not null check (unit in ('g','kg','ml','l','un')),
  cost_per_unit_cents numeric(12,4)
    check (cost_per_unit_cents is null or cost_per_unit_cents >= 0),
  source              text not null default 'manual'
    check (source in ('manual','invoice','saft_import')),
  source_ref          text,          -- nº da fatura de fornecedor ou do doc SAF-T
  note                text,
  created_at          timestamptz not null default now(),
  constraint stock_movements_sign_coherent check (
    (kind = 'purchase'       and qty > 0) or
    (kind in ('sale_depletion','waste') and qty < 0) or
    (kind = 'adjustment'     and qty <> 0)
  )
);
create index if not exists stock_movements_ingredient_idx
  on public.stock_movements(ingredient_id, created_at);
create index if not exists stock_movements_restaurant_idx
  on public.stock_movements(restaurant_id);

-- Guarda multi-tenant + coerência de unidade: o movimento usa a MESMA unidade
-- do ingrediente (v0 sem conversões, como nas fichas 0006).
create or replace function public.stock_movement_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_unit text;
begin
  select unit into v_unit from public.ingredients g
   where g.id = new.ingredient_id and g.restaurant_id = new.restaurant_id;
  if v_unit is null then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;
  if v_unit <> new.unit then
    raise exception 'unidade_diferente_do_ingrediente';
  end if;
  return new;
end $$;

create trigger stock_movements_guard
  before insert on public.stock_movements
  for each row execute function public.stock_movement_guard();

-- Aplicação ao saldo. Entradas com custo actualizam também o custo corrente do
-- ingrediente (último custo, não média ponderada — decisão v0, simples e
-- suficiente para food cost; média fica para depois se fizer falta).
create or replace function public.stock_movement_apply()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.ingredients
     set stock_qty = stock_qty + new.qty,
         cost_per_unit_cents = case
           when new.kind = 'purchase' and new.cost_per_unit_cents is not null
             then new.cost_per_unit_cents
           else cost_per_unit_cents end
   where id = new.ingredient_id;
  return new;
end $$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function public.stock_movement_apply();

-- Imutabilidade: movimentos não se editam; corrige-se com um adjustment novo.
-- Delete reverte o saldo (para limpezas administrativas não deixarem o saldo
-- errado); em operação normal não se apaga.
create or replace function public.stock_movement_block_update()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'movimento_imutavel_corrigir_com_adjustment';
end $$;

create trigger stock_movements_no_update
  before update on public.stock_movements
  for each row execute function public.stock_movement_block_update();

create or replace function public.stock_movement_revert()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.ingredients set stock_qty = stock_qty - old.qty
   where id = old.ingredient_id;
  return old;
end $$;

create trigger stock_movements_revert
  after delete on public.stock_movements
  for each row execute function public.stock_movement_revert();

-- ── 3) Mapa POS→prato (a memória da conciliação) ─────────────────────────────
-- O SAF-T traz códigos/descrições do POS que não coincidem com os nomes no
-- nostos. O dono concilia UMA vez; imports seguintes casam sozinhos.
create table if not exists public.pos_product_map (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  pos_code        text not null,
  pos_description text,
  menu_item_id    uuid not null references public.menu_items(id) on delete cascade,
  confirmed       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists pos_product_map_code_key
  on public.pos_product_map(restaurant_id, pos_code);

create or replace function public.pos_map_item_same_restaurant()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.menu_items i
     where i.id = new.menu_item_id and i.restaurant_id = new.restaurant_id
  ) then
    raise exception 'prato_de_outro_restaurante';
  end if;
  return new;
end $$;

create trigger pos_product_map_tenant_guard
  before insert or update on public.pos_product_map
  for each row execute function public.pos_map_item_same_restaurant();

create trigger pos_product_map_touch before update on public.pos_product_map
  for each row execute function public.touch_updated_at();

-- ── 4) RLS (padrão *_member_all) ─────────────────────────────────────────────
alter table public.stock_movements enable row level security;
alter table public.pos_product_map enable row level security;

create policy stock_movements_member_all on public.stock_movements
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy pos_product_map_member_all on public.pos_product_map
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
