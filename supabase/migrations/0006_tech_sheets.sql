-- 0006 — Despensa + Fichas Técnicas (v0). Bandeira do lançamento 1-Set:
-- cada prato do menu pode ter uma ficha técnica (ingredientes com quantidades,
-- passos, alergénios via menu_items) de onde deriva o food cost e a margem.
-- A despensa (ingredients) guarda o custo por unidade; a ficha referencia
-- ingredientes da despensa OU linhas livres (rascunho IA antes de ligar).
-- Tenant via RLS (padrão *_member_all). Sem RPC pública: fichas são internas.

-- ── Despensa ─────────────────────────────────────────────────────────────────
create table if not exists public.ingredients (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  name                text not null,
  -- Unidade base do ingrediente; a linha da ficha usa a MESMA unidade (v0 sem
  -- conversões). Custo em cêntimos por unidade, numeric para suportar
  -- fracções de cêntimo (ex.: farinha 0.15 cents/g).
  unit                text not null default 'un' check (unit in ('g','kg','ml','l','un')),
  cost_per_unit_cents numeric(12,4) check (cost_per_unit_cents is null or cost_per_unit_cents >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists ingredients_restaurant_name_key
  on public.ingredients(restaurant_id, lower(name));
create index if not exists ingredients_restaurant_idx on public.ingredients(restaurant_id);

-- ── Fichas técnicas (1:1 com prato do menu) ─────────────────────────────────
create table if not exists public.tech_sheets (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id  uuid not null unique references public.menu_items(id) on delete cascade,
  servings      int  not null default 1 check (servings between 1 and 100),
  steps         text[] not null default '{}',
  notes         text,
  status        text not null default 'rascunho' check (status in ('rascunho','validada')),
  ai_generated  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tech_sheets_restaurant_idx on public.tech_sheets(restaurant_id);

-- ── Linhas da ficha ──────────────────────────────────────────────────────────
create table if not exists public.tech_sheet_ingredients (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tech_sheet_id uuid not null references public.tech_sheets(id) on delete cascade,
  -- Opcional: linha ligada à despensa (traz o custo). Linha livre (IA ou
  -- manual) tem ingredient_id null e só nome; custo entra quando se liga.
  ingredient_id uuid references public.ingredients(id) on delete set null,
  name          text not null,
  qty           numeric(12,3) not null check (qty > 0),
  unit          text not null check (unit in ('g','kg','ml','l','un')),
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists tsi_sheet_idx on public.tech_sheet_ingredients(tech_sheet_id);
create index if not exists tsi_restaurant_idx on public.tech_sheet_ingredients(restaurant_id);

-- ── Guardas multi-tenant (mesmo padrão da 0005) ─────────────────────────────
create or replace function public.tech_sheet_item_same_restaurant()
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

create trigger tech_sheets_item_tenant_guard
  before insert or update on public.tech_sheets
  for each row execute function public.tech_sheet_item_same_restaurant();

create or replace function public.tsi_same_restaurant()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.tech_sheets s
     where s.id = new.tech_sheet_id and s.restaurant_id = new.restaurant_id
  ) then
    raise exception 'ficha_de_outro_restaurante';
  end if;
  if new.ingredient_id is not null and not exists (
    select 1 from public.ingredients g
     where g.id = new.ingredient_id and g.restaurant_id = new.restaurant_id
  ) then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;
  return new;
end $$;

create trigger tsi_tenant_guard
  before insert or update on public.tech_sheet_ingredients
  for each row execute function public.tsi_same_restaurant();

-- updated_at automático (touch_updated_at existe desde a 0005).
create trigger ingredients_touch before update on public.ingredients
  for each row execute function public.touch_updated_at();
create trigger tech_sheets_touch before update on public.tech_sheets
  for each row execute function public.touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.ingredients enable row level security;
alter table public.tech_sheets enable row level security;
alter table public.tech_sheet_ingredients enable row level security;

create policy ingredients_member_all on public.ingredients
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy tech_sheets_member_all on public.tech_sheets
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy tsi_member_all on public.tech_sheet_ingredients
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
