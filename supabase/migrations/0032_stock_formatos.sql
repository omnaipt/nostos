-- 0032 - Stock S1: conversao de unidades, peso medio por unidade, familias e
-- artigos de compra. Primeiro de tres sprints de stock (S1 formatos; S2 consumo
-- interno; S3 inventario). Origem: spec "Nostos Rest: camada de stock" (David,
-- decisoes fechadas a 13-11-2026).
--
-- Objectivo: uma fatura "Azeite Gallo VE 5L, 2 un, 39,80" passa a entrar como
-- 10 l de azeite a 3,98/l, sem contas a mao. O azeite de qualquer marca soma no
-- mesmo ingrediente; o formato de mesa e outro ingrediente ligado pela familia.
-- Uma linha "1 cebola" liga-se a um ingrediente ao quilo quando o ingrediente
-- tem peso medio por unidade.
--
-- NOTA: a coluna density_g_per_ml NAO entra neste sprint (fica para o S3).

-- == 1) Peso medio por unidade no ingrediente ================================
alter table public.ingredients
  add column if not exists unit_weight_g numeric(10,3)
    check (unit_weight_g is null or unit_weight_g > 0);
comment on column public.ingredients.unit_weight_g is
  'Peso medio em gramas de uma unidade (cebola, limao, alho). Quando preenchido permite converter linhas em un contra ingredientes ao peso. Null significa sem conversao un contra peso.';

-- == 2) Conversao de unidades ================================================
-- Devolve o multiplicador para passar p_from a p_to dentro da mesma grandeza
-- (g e kg; ml e l; un e un). Entre un e g/kg usa o peso medio por unidade.
-- Devolve null quando a conversao nao e possivel (massa contra volume, ou un
-- sem peso medio). Imutavel: depende so dos argumentos.
create or replace function public.unit_factor(
  p_from text,
  p_to text,
  p_unit_weight_g numeric default null
) returns numeric
language sql immutable set search_path = public as $$
  select case
    when p_from = p_to then 1::numeric
    when p_from = 'g'  and p_to = 'kg' then 0.001
    when p_from = 'kg' and p_to = 'g'  then 1000
    when p_from = 'ml' and p_to = 'l'  then 0.001
    when p_from = 'l'  and p_to = 'ml' then 1000
    -- un contra peso: so com peso medio por unidade valido
    when p_unit_weight_g is null or p_unit_weight_g <= 0 then null
    when p_from = 'un' and p_to = 'g'  then p_unit_weight_g
    when p_from = 'un' and p_to = 'kg' then p_unit_weight_g * 0.001
    when p_from = 'g'  and p_to = 'un' then 1 / p_unit_weight_g
    when p_from = 'kg' and p_to = 'un' then 1000 / p_unit_weight_g
    else null
  end;
$$;
comment on function public.unit_factor(text, text, numeric) is
  'Multiplicador de conversao de p_from para p_to na mesma grandeza; entre un e g/kg usa o peso medio por unidade; null quando impossivel.';

revoke all on function public.unit_factor(text, text, numeric) from public, anon;
grant execute on function public.unit_factor(text, text, numeric) to authenticated;

-- == 3) Familias de ingredientes =============================================
-- Agrupam ingredientes relacionados (ex.: azeite a granel e azeite de mesa) que
-- devem aparecer juntos na despensa. Nome unico por restaurante sem distincao
-- de maiusculas.
create table if not exists public.ingredient_families (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.ingredient_families is
  'Familias que agrupam ingredientes relacionados do mesmo restaurante (ex.: formato a granel e formato de mesa).';
create unique index if not exists ingredient_families_restaurant_name_key
  on public.ingredient_families(restaurant_id, lower(name));
create index if not exists ingredient_families_restaurant_idx
  on public.ingredient_families(restaurant_id);

create trigger ingredient_families_touch before update on public.ingredient_families
  for each row execute function public.touch_updated_at();

alter table public.ingredient_families enable row level security;
create policy ingredient_families_member_all on public.ingredient_families
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- Familia no ingrediente (opcional), com guarda de tenant.
alter table public.ingredients
  add column if not exists family_id uuid
    references public.ingredient_families(id) on delete set null;
comment on column public.ingredients.family_id is
  'Familia do ingrediente (opcional). A familia tem de ser do mesmo restaurante (guarda ingredients_family_guard).';

create or replace function public.ingredient_family_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.family_id is not null and not exists (
    select 1 from public.ingredient_families f
     where f.id = new.family_id and f.restaurant_id = new.restaurant_id
  ) then
    raise exception 'familia_de_outro_restaurante';
  end if;
  return new;
end $$;
comment on function public.ingredient_family_guard() is
  'Guarda de tenant: a familia atribuida a um ingrediente tem de ser do mesmo restaurante.';

create trigger ingredients_family_guard
  before insert or update on public.ingredients
  for each row execute function public.ingredient_family_guard();

-- == 4) Artigos de compra ====================================================
-- Formatos concretos em que um ingrediente e comprado (marca, embalagem,
-- conteudo). O conteudo (pack_qty + pack_unit) tem de ser convertivel para a
-- unidade do ingrediente. catalog_item_id fica reservado a fase 2 (catalogo
-- partilhado), sem FK por agora.
create table if not exists public.purchase_items (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  ingredient_id   uuid not null references public.ingredients(id) on delete cascade,
  supplier_norm   text check (supplier_norm is null or length(supplier_norm) between 1 and 160),
  brand           text,
  label           text,
  pack_qty        numeric(12,3) not null check (pack_qty > 0),
  pack_unit       text not null check (pack_unit in ('g','kg','ml','l','un')),
  tare_g          numeric(10,3) check (tare_g is null or tare_g >= 0),
  ean             text,
  supplier_code   text,
  catalog_item_id uuid,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.purchase_items is
  'Artigos de compra: formatos concretos (marca, embalagem, conteudo) de um ingrediente. catalog_item_id reservado a fase 2, sem FK.';
comment on column public.purchase_items.label is
  'Texto livre do formato lido da fatura, por exemplo "Garrafao 5 L".';
comment on column public.purchase_items.catalog_item_id is
  'Reservado ao catalogo partilhado da fase 2. Sempre null neste sprint, sem FK.';
create index if not exists purchase_items_restaurant_idx on public.purchase_items(restaurant_id);
create index if not exists purchase_items_ingredient_idx on public.purchase_items(ingredient_id);
create index if not exists purchase_items_supplier_idx
  on public.purchase_items(restaurant_id, supplier_norm);

-- Guarda: o ingrediente e do mesmo restaurante e o formato e convertivel para
-- a unidade do ingrediente (unit_factor nao null).
create or replace function public.purchase_item_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_unit text; v_uwg numeric;
begin
  select unit, unit_weight_g into v_unit, v_uwg from public.ingredients g
   where g.id = new.ingredient_id and g.restaurant_id = new.restaurant_id;
  if v_unit is null then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;
  if public.unit_factor(new.pack_unit, v_unit, v_uwg) is null then
    raise exception 'formato_incompativel_com_ingrediente';
  end if;
  return new;
end $$;
comment on function public.purchase_item_guard() is
  'Guarda de tenant e de conversao do artigo de compra: ingrediente do mesmo restaurante e formato convertivel para a unidade do ingrediente.';

create trigger purchase_items_tenant_guard
  before insert or update on public.purchase_items
  for each row execute function public.purchase_item_guard();
create trigger purchase_items_touch before update on public.purchase_items
  for each row execute function public.touch_updated_at();

alter table public.purchase_items enable row level security;
create policy purchase_items_member_all on public.purchase_items
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- == 5) Alias de fornecedor liga ao artigo de compra =========================
alter table public.supplier_product_aliases
  add column if not exists purchase_item_id uuid
    references public.purchase_items(id) on delete set null;
comment on column public.supplier_product_aliases.purchase_item_id is
  'Artigo de compra aprendido para este alias (opcional). Aliases antigos sem artigo continuam validos.';

-- Recria a guarda da 0018 acrescentando a verificacao do artigo: tem de ser do
-- mesmo restaurante e apontar para o mesmo ingrediente do alias.
create or replace function public.supplier_alias_tenant_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.ingredients i
     where i.id = new.ingredient_id and i.restaurant_id = new.restaurant_id
  ) then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;
  if new.purchase_item_id is not null and not exists (
    select 1 from public.purchase_items p
     where p.id = new.purchase_item_id
       and p.restaurant_id = new.restaurant_id
       and p.ingredient_id = new.ingredient_id
  ) then
    raise exception 'artigo_de_outro_restaurante_ou_ingrediente';
  end if;
  return new;
end $$;

-- == 6) Movimentos por embalagens ============================================
alter table public.stock_movements
  add column if not exists purchase_item_id uuid
    references public.purchase_items(id) on delete set null,
  add column if not exists packs numeric(12,3)
    check (packs is null or packs > 0);
comment on column public.stock_movements.purchase_item_id is
  'Artigo de compra da entrada (opcional). Obrigatorio quando packs vem preenchido.';
comment on column public.stock_movements.packs is
  'Numero de embalagens da entrada (opcional). Quando preenchido a qty gravada e packs x pack_qty convertida para a unidade do ingrediente.';

-- Recria a guarda da 0011/0016: aceita unidade diferente da do ingrediente
-- quando ha conversao (normaliza qty, unit e custo por unidade na proporcao
-- inversa) e trata a entrada por embalagens. Rejeita grandezas incompativeis.
create or replace function public.stock_movement_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_unit      text;
  v_uwg       numeric;
  v_factor    numeric;
  v_pack_qty  numeric;
  v_pack_unit text;
  v_pf        numeric;
  v_expected  numeric;
  v_given     numeric;
begin
  select unit, unit_weight_g into v_unit, v_uwg from public.ingredients g
   where g.id = new.ingredient_id and g.restaurant_id = new.restaurant_id;
  if v_unit is null then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;

  -- Entrada por embalagens: packs x pack_qty do artigo, convertido ao ingrediente.
  if new.packs is not null then
    if new.kind <> 'purchase' then
      raise exception 'packs_so_em_purchase';
    end if;
    if new.purchase_item_id is null then
      raise exception 'packs_exige_artigo';
    end if;
    select pack_qty, pack_unit into v_pack_qty, v_pack_unit
      from public.purchase_items p
     where p.id = new.purchase_item_id
       and p.restaurant_id = new.restaurant_id
       and p.ingredient_id = new.ingredient_id;
    if v_pack_qty is null then
      raise exception 'artigo_de_outro_restaurante_ou_ingrediente';
    end if;
    v_pf := public.unit_factor(v_pack_unit, v_unit, v_uwg);
    if v_pf is null then
      raise exception 'grandeza_diferente_do_ingrediente';
    end if;
    v_expected := new.packs * v_pack_qty * v_pf;
    -- Confere a qty enviada pelo cliente (na sua unidade) contra o esperado.
    v_factor := public.unit_factor(new.unit, v_unit, v_uwg);
    if v_factor is null then
      raise exception 'grandeza_diferente_do_ingrediente';
    end if;
    v_given := new.qty * v_factor;
    if abs(v_given - v_expected) > 0.001 then
      raise exception 'qty_nao_coincide_com_embalagens';
    end if;
    if new.cost_per_unit_cents is not null and v_factor <> 1 then
      new.cost_per_unit_cents := new.cost_per_unit_cents / v_factor;
    end if;
    new.qty := v_expected;
    new.unit := v_unit;
    return new;
  end if;

  -- Sem embalagens: aceita unidade diferente quando ha conversao.
  if v_unit <> new.unit then
    v_factor := public.unit_factor(new.unit, v_unit, v_uwg);
    if v_factor is null then
      raise exception 'grandeza_diferente_do_ingrediente';
    end if;
    new.qty := new.qty * v_factor;
    if new.cost_per_unit_cents is not null then
      new.cost_per_unit_cents := new.cost_per_unit_cents / v_factor;
    end if;
    new.unit := v_unit;
  end if;
  return new;
end $$;
