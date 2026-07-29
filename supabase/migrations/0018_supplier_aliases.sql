-- 0018 — Aliases de produto por fornecedor (parse de faturas, David 29-07:
-- "coentros" vs "molho de coentros"). Fornecedores dão nomes diferentes ao
-- mesmo produto; nomes quase iguais podem ser produtos DIFERENTES. A
-- semelhança de texto sugere; o que DECIDE é o alias aprendido da confirmação
-- do dono no "Registar entrada" (upsert silencioso; reescolher corrige).
-- É o padrão pos_product_map do fecho SAF-T aplicado a nomes de fornecedor.
--
-- Normas (supplier_norm, raw_name_norm): lowercase, sem acentos, espaços
-- colapsados — a MESMA função do matching (supabase/functions/parse-invoice/
-- match.ts, partilhada com o frontend).

create table if not exists public.supplier_product_aliases (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  supplier_norm text not null check (length(supplier_norm) between 1 and 160),
  raw_name_norm text not null check (length(raw_name_norm) between 1 and 200),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists supplier_product_aliases_key
  on public.supplier_product_aliases(restaurant_id, supplier_norm, raw_name_norm);

-- Guarda multi-tenant: o ingrediente tem de pertencer ao mesmo restaurante
-- (mesmo padrão do trigger de menu_item_variants/pos_product_map).
create or replace function public.supplier_alias_tenant_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.ingredients i
     where i.id = new.ingredient_id and i.restaurant_id = new.restaurant_id
  ) then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;
  return new;
end $$;

create trigger supplier_product_aliases_tenant_guard
  before insert or update on public.supplier_product_aliases
  for each row execute function public.supplier_alias_tenant_guard();

create trigger supplier_product_aliases_touch
  before update on public.supplier_product_aliases
  for each row execute function public.touch_updated_at();

alter table public.supplier_product_aliases enable row level security;

create policy supplier_product_aliases_member_all on public.supplier_product_aliases
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
