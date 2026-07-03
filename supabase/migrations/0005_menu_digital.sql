-- 0005 — Menu Digital (v0). Camada "ticket" da Spec v2 antecipada: cada
-- restaurante gere categorias e pratos; sai uma página pública /m/{slug}
-- (QR para as mesas). Tenant via RLS (mesmo padrão *_member_all). Leitura
-- anónima só de categorias/itens ACTIVOS, via RPC security definer.

create extension if not exists pgcrypto;

-- ── Tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label         text not null,
  sort_order    int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists menu_categories_restaurant_idx
  on public.menu_categories(restaurant_id);

create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid not null references public.menu_categories(id) on delete cascade,
  name          text not null,
  description   text,
  price_cents   int  check (price_cents is null or price_cents >= 0),
  allergens     text[] not null default '{}',
  sort_order    int  not null default 0,
  active        boolean not null default true,   -- rascunho: escondido do menu público
  available     boolean not null default true,   -- em stock hoje (público vê "esgotado")
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists menu_items_restaurant_idx on public.menu_items(restaurant_id);
create index if not exists menu_items_category_idx on public.menu_items(category_id);

-- Guarda multi-tenant: a categoria de um item tem de pertencer ao mesmo
-- restaurante que o item (evita cruzar menus entre tenants).
create or replace function public.menu_item_category_same_restaurant()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.menu_categories c
     where c.id = new.category_id and c.restaurant_id = new.restaurant_id
  ) then
    raise exception 'categoria_de_outro_restaurante';
  end if;
  return new;
end $$;

create trigger menu_items_category_tenant_guard
  before insert or update on public.menu_items
  for each row execute function public.menu_item_category_same_restaurant();

-- updated_at automático.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

create trigger menu_categories_touch before update on public.menu_categories
  for each row execute function public.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- ── RLS (mesmo padrão *_member_all das outras tabelas de negócio) ────────────
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;

create policy menu_categories_member_all on public.menu_categories
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy menu_items_member_all on public.menu_items
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- ── RPC pública (menu por slug; só activos) ─────────────────────────────────
-- Existência/nome do restaurante reutiliza public_restaurant_by_slug (0004).
-- Aqui devolve-se só o conteúdo do menu. Itens indisponíveis vêm na mesma
-- (available=false) para o público ver "esgotado"; itens/categorias INACTIVOS
-- (rascunho) nunca saem.
create or replace function public.public_menu_by_slug(p_slug text)
returns table (
  category_id      uuid,
  category_label   text,
  category_sort    int,
  item_id          uuid,
  item_name        text,
  item_description text,
  price_cents      int,
  allergens        text[],
  item_sort        int,
  available        boolean
)
language sql security definer stable set search_path = public as $$
  select c.id, c.label, c.sort_order,
         i.id, i.name, i.description, i.price_cents, i.allergens, i.sort_order, i.available
  from public.restaurants r
  join public.menu_categories c on c.restaurant_id = r.id and c.active
  left join public.menu_items i on i.category_id = c.id and i.active
  where r.slug = p_slug
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$$;
