-- 0010 — Menu v2: variantes, unidades, metadados de revisão e importações.
-- Evolui o 0005. Modelo HÍBRIDO (decisão David, 08-07-2026): o item simples
-- mantém o preço em menu_items.price_cents; só o caso com doses/porções usa
-- menu_item_variants. Acrescenta:
--   • price_type (fixed|per_kg|market|variants), serves, external_ref;
--   • rasto de revisão do enrollment: source, needs_review, review_note,
--     allergens_confirmed;
--   • menu_imports: um lote de importação (foto/pdf/manual) com estado e nota
--     de linhas ilegíveis; menu_items.import_id liga o item ao lote.
-- Aditivo e retrocompatível com o menu público.

-- ── 1) Importações (lote de enrollment) ─────────────────────────────────────
create table if not exists public.menu_imports (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source_kind   text not null default 'photo'
    check (source_kind in ('photo','pdf','manual')),
  source_ref    text,                           -- nome do ficheiro / ref de storage
  status        text not null default 'parsing'
    check (status in ('parsing','review','published','failed')),
  items_count   int  not null default 0,
  flagged_count int  not null default 0,
  unparsed_note text,                            -- linhas ilegíveis, para o dono ver
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists menu_imports_restaurant_idx
  on public.menu_imports(restaurant_id);

-- ── 2) Campos novos no item ─────────────────────────────────────────────────
alter table public.menu_items
  add column if not exists price_type text not null default 'fixed'
    check (price_type in ('fixed','per_kg','market','variants')),
  add column if not exists serves int check (serves is null or serves > 0),
  add column if not exists external_ref text,                 -- código do menu do dono
  add column if not exists source text not null default 'manual'
    check (source in ('manual','parsed')),
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_note text,                  -- porquê do aviso (ecrã de revisão)
  add column if not exists allergens_confirmed boolean not null default false,
  add column if not exists import_id uuid references public.menu_imports(id) on delete set null;
-- Nota: import_id não é tenant-guarded por trigger (é definido pela app sob RLS).
-- Para o mesmo rigor da guarda de categoria, acrescenta-se um trigger análogo.

-- Itens legados sem preço passam a 'market' (no 0005 price_cents podia ser null).
update public.menu_items set price_type = 'market' where price_cents is null;

-- Coerência preço x tipo. fixed/per_kg exigem preço; market/variants não têm
-- preço no item (variants guarda-o nas variantes). NOT VALID + validate para
-- falhar cedo se houver dado legado inesperado, sem bloquear o lock de escrita.
alter table public.menu_items
  add constraint menu_items_price_type_coherent check (
    (price_type in ('fixed','per_kg') and price_cents is not null) or
    (price_type in ('market','variants') and price_cents is null)
  ) not valid;
alter table public.menu_items validate constraint menu_items_price_type_coherent;

-- ── 3) Variantes de preço (½ dose/dose, 2 pax/½ dose, etc.) ──────────────────
create table if not exists public.menu_item_variants (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  label         text not null,                     -- "½ dose","dose","2 pax"
  price_cents   int  check (price_cents is null or price_cents >= 0),
  unit          text not null default 'dose'
    check (unit in ('dose','kg','unit','person')),
  serves        int  check (serves is null or serves > 0),
  sort_order    int  not null default 0,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists menu_item_variants_item_idx
  on public.menu_item_variants(item_id);
create index if not exists menu_item_variants_restaurant_idx
  on public.menu_item_variants(restaurant_id);

-- Guarda multi-tenant: a variante e o item têm de ser do mesmo restaurante.
create or replace function public.menu_variant_item_same_restaurant()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.menu_items i
     where i.id = new.item_id and i.restaurant_id = new.restaurant_id
  ) then
    raise exception 'variante_de_outro_restaurante';
  end if;
  return new;
end $$;

create trigger menu_item_variants_tenant_guard
  before insert or update on public.menu_item_variants
  for each row execute function public.menu_variant_item_same_restaurant();

create trigger menu_item_variants_touch before update on public.menu_item_variants
  for each row execute function public.touch_updated_at();

-- ── 4) RLS e touch (mesmo padrão *_member_all das outras tabelas) ────────────
create trigger menu_imports_touch before update on public.menu_imports
  for each row execute function public.touch_updated_at();

alter table public.menu_imports enable row level security;
create policy menu_imports_member_all on public.menu_imports
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

alter table public.menu_item_variants enable row level security;
create policy menu_item_variants_member_all on public.menu_item_variants
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- ── 5) RPC pública: tipo de preço, serve e variantes agregadas ──────────────
-- A assinatura de saída muda, logo DROP + CREATE (CREATE OR REPLACE não deixa
-- alterar as colunas de retorno). Re-concede EXECUTE ao público anónimo do
-- menu por QR para não partir com o drop. review_note/import_id são internos,
-- não saem na RPC pública.
drop function if exists public.public_menu_by_slug(text);
create function public.public_menu_by_slug(p_slug text)
returns table (
  category_id      uuid,
  category_label   text,
  category_sort    int,
  item_id          uuid,
  item_name        text,
  item_description text,
  price_cents      int,
  price_type       text,
  serves           int,
  allergens        text[],
  variants         jsonb,
  item_sort        int,
  available        boolean
)
language sql security definer stable set search_path = public as $$
  select c.id, c.label, c.sort_order,
         i.id, i.name, i.description,
         i.price_cents, i.price_type, i.serves, i.allergens,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'label',       v.label,
                    'price_cents', v.price_cents,
                    'unit',        v.unit,
                    'serves',      v.serves)
                    order by v.sort_order)
           from public.menu_item_variants v where v.item_id = i.id
         ), '[]'::jsonb),
         i.sort_order, i.available
  from public.restaurants r
  join public.menu_categories c on c.restaurant_id = r.id and c.active
  left join public.menu_items i on i.category_id = c.id and i.active
  where r.slug = p_slug
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$$;

grant execute on function public.public_menu_by_slug(text) to anon, authenticated;
