-- 0017 — Inventário físico (Gap F) + validades por categoria (Gap G, fundação).
-- Decisões David 29-07 (Auditoria_Backoffice_Gaps_29-07).
--
-- Inventário: contagem física periódica → adjustments em bulk pela RPC
-- apply_inventory_count (transaccional, security invoker: RLS + guards da 0011
-- aplicam-se). Histórico = movements agrupados pela note; sem tabela nova.
--
-- Validades: as faturas não trazem validade; estima-se por categoria com base
-- USDA FSIS FoodKeeper (Data.gov) + overlay conservador HACCP/AHRESP — em
-- conflito vence o valor MAIS curto; usa-se sempre o limite INFERIOR do
-- intervalo. Validade ESTIMADA, não legal: o rótulo prevalece (copy na UI).

-- ── 1) Validades: tabela de referência global ───────────────────────────────
-- Sem restaurant_id: é dado de referência partilhado. category '*' = fallback
-- conservador por storage_mode quando o ingrediente não tem categoria.
create table if not exists public.shelf_life_defaults (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
  storage_mode    text not null check (storage_mode in ('refrigerado','congelado','ambiente')),
  shelf_life_days int  not null check (shelf_life_days > 0),
  source          text not null,
  note            text
);
create unique index if not exists shelf_life_defaults_key
  on public.shelf_life_defaults(category, storage_mode);

alter table public.shelf_life_defaults enable row level security;
create policy shelf_life_defaults_read on public.shelf_life_defaults
  for select to authenticated using (true);

insert into public.shelf_life_defaults (category, storage_mode, shelf_life_days, source, note) values
  ('peixe-fresco',      'refrigerado', 1,   'FoodKeeper + HACCP', 'intervalo 1-2 dias; limite inferior'),
  ('marisco-fresco',    'refrigerado', 1,   'FoodKeeper + HACCP', 'intervalo 1-2 dias; limite inferior'),
  ('carne-picada',      'refrigerado', 1,   'FoodKeeper + HACCP', 'intervalo 1-2 dias; limite inferior'),
  ('carne-pecas',       'refrigerado', 3,   'FoodKeeper + HACCP', 'intervalo 3-5 dias; limite inferior'),
  ('lacticinios',       'refrigerado', 3,   'FoodKeeper + HACCP', 'abertos, 3-7 dias; limite inferior'),
  ('legumes-folha',     'refrigerado', 3,   'FoodKeeper + HACCP', 'intervalo 3-5 dias; limite inferior'),
  ('legumes-raiz',      'refrigerado', 14,  'FoodKeeper',         'intervalo 2-4 semanas; limite inferior'),
  ('congelado-peixe',   'congelado',   90,  'FoodKeeper',         'intervalo 3-6 meses; limite inferior'),
  ('congelado-carne',   'congelado',   120, 'FoodKeeper',         'intervalo 4-12 meses; limite inferior'),
  ('congelado-legumes', 'congelado',   240, 'FoodKeeper',         'intervalo 8-12 meses; limite inferior'),
  ('mercearia',         'ambiente',    180, 'FoodKeeper',         'intervalo 6-24 meses; limite inferior'),
  ('*',                 'refrigerado', 3,   'fallback conservador HACCP', 'sem categoria: pior caso razoável de fresco'),
  ('*',                 'congelado',   90,  'fallback conservador',       'sem categoria'),
  ('*',                 'ambiente',    180, 'fallback conservador',       'sem categoria')
on conflict (category, storage_mode) do nothing;

-- ── 2) Validades: campos no ingrediente e no movimento ──────────────────────
-- NOTA: ingredients NÃO tinha coluna category (a auditoria assumia que sim);
-- entra aqui, opcional, com os slugs da tabela acima. O catálogo (UI Zé)
-- passa a poder defini-la; sem categoria vale o fallback por storage_mode.
alter table public.ingredients
  add column if not exists category text,
  add column if not exists storage_mode text not null default 'ambiente'
    check (storage_mode in ('refrigerado','congelado','ambiente')),
  add column if not exists shelf_life_override_days int
    check (shelf_life_override_days is null or shelf_life_override_days > 0);

-- Validade estimada gravada na entrada de compra (Gap A); null nos restantes
-- kinds. Editável no acto do registo; resolução override > categoria > '*'.
alter table public.stock_movements
  add column if not exists expires_at date;

-- ── 3) Inventário: RPC de acerto em bulk ────────────────────────────────────
-- p_counts: [{"ingredient_id": uuid, "counted": numeric}, ...]. Só as linhas
-- presentes contam; diferença zero não gera movimento. Devolve resumo com o
-- desvio valorizado ao custo médio (0016) por ingrediente e total.
create or replace function public.apply_inventory_count(
  p_restaurant_id uuid,
  p_counts jsonb,
  p_note text
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_elem jsonb;
  v_ing public.ingredients%rowtype;
  v_ingredient_id uuid;
  v_counted numeric;
  v_diff numeric;
  v_applied int := 0;
  v_skipped int := 0;
  v_total_dev_cents numeric := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if p_note is null or length(trim(p_note)) < 3 then
    raise exception 'nota_invalida';
  end if;
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' then
    raise exception 'contagens_invalidas';
  end if;

  for v_elem in select * from jsonb_array_elements(p_counts) loop
    v_ingredient_id := (v_elem->>'ingredient_id')::uuid;
    v_counted := (v_elem->>'counted')::numeric;
    if v_ingredient_id is null or v_counted is null or v_counted < 0 then
      raise exception 'linha_invalida';
    end if;

    -- security invoker: sob RLS, ingrediente de outro tenant é invisível.
    select * into v_ing from public.ingredients
     where id = v_ingredient_id and restaurant_id = p_restaurant_id;
    if not found then
      raise exception 'ingrediente_invalido';
    end if;

    v_diff := v_counted - v_ing.stock_qty;
    if v_diff = 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.stock_movements
      (restaurant_id, ingredient_id, kind, qty, unit, source, note)
    values
      (p_restaurant_id, v_ingredient_id, 'adjustment', v_diff, v_ing.unit, 'manual', p_note);

    v_applied := v_applied + 1;
    v_total_dev_cents := v_total_dev_cents
      + abs(v_diff) * coalesce(v_ing.cost_per_unit_cents, 0);
    v_items := v_items || jsonb_build_object(
      'ingredient_id', v_ingredient_id,
      'name', v_ing.name,
      'unit', v_ing.unit,
      'diff', v_diff,
      'deviation_cents', v_diff * coalesce(v_ing.cost_per_unit_cents, 0));
  end loop;

  return jsonb_build_object(
    'applied', v_applied,
    'skipped', v_skipped,
    'total_deviation_cents', v_total_dev_cents,
    'items', v_items);
end $$;

revoke execute on function public.apply_inventory_count(uuid, jsonb, text) from anon;
grant execute on function public.apply_inventory_count(uuid, jsonb, text) to authenticated;
