-- STOA/Nostos — Testes do inventário + validades (migration 0017).
-- Valida: apply_inventory_count gera adjustments só para diferenças ≠ 0 com a
-- note dada, acerta saldos, valoriza o desvio ao custo, respeita o tenant; e
-- os defaults de validade têm os valores de referência (limite inferior).
--
-- Correr com: supabase test db (pgTAP). Requer 0001 + 0006 + 0011 + 0016 + 0017.

begin;

select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- 3 ingredientes: acima, abaixo, igual (custo 1000 c/kg para valorizar desvio)
insert into public.ingredients (id, restaurant_id, name, unit, stock_qty, cost_per_unit_cents) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Polvo',    'kg', 10, 1000),
  ('11110002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bacalhau', 'kg', 20, 1000),
  ('11110003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Arroz',    'kg', 30, 500);

-- ── Cenário 1: owner A aplica contagem (1 acima, 1 abaixo, 1 igual) ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

create temp table inv1 on commit drop as
select public.apply_inventory_count(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '[{"ingredient_id":"11110001-0000-0000-0000-000000000001","counted":12},
    {"ingredient_id":"11110002-0000-0000-0000-000000000002","counted":17.5},
    {"ingredient_id":"11110003-0000-0000-0000-000000000003","counted":30}]'::jsonb,
  'Inventário 2026-07') as r;

select is(
  (select r->>'applied' from inv1),
  '2', 'Contagem gera adjustments só para as 2 diferenças');

select is(
  (select count(*)::int from public.stock_movements
    where note = 'Inventário 2026-07' and kind = 'adjustment'),
  2, 'A diferença zero não gera movimento');

select is(
  (select stock_qty from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  12::numeric, 'Saldo acima acertado (10 → 12)');

select is(
  (select stock_qty from public.ingredients where id = '11110002-0000-0000-0000-000000000002'),
  17.5::numeric, 'Saldo abaixo acertado (20 → 17,5)');

select is(
  (select qty from public.stock_movements
    where note = 'Inventário 2026-07'
      and ingredient_id = '11110002-0000-0000-0000-000000000002'),
  -2.5::numeric, 'Adjustment negativo com a diferença exacta');

-- Desvio valorizado ao custo médio: |+2|×1000 + |−2,5|×1000 = 4500 c
select is(
  (select (r->>'total_deviation_cents')::numeric from inv1),
  4500::numeric, 'Desvio total valorizado ao custo (argumento comercial)');

select is(
  (public.apply_inventory_count(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '[]'::jsonb, 'Inventário vazio'))->>'total_deviation_cents',
  '0', 'Contagem vazia devolve desvio 0 e não rebenta');

-- Repetição com os saldos já certos → tudo skipped
select is(
  (public.apply_inventory_count(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '[{"ingredient_id":"11110001-0000-0000-0000-000000000001","counted":12}]'::jsonb,
    'Inventário 2026-07b'))->>'skipped',
  '1', 'Saldo já certo → skipped, sem movimento novo');

-- ── Cenário 2: owner B não acerta inventário do tenant A ────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok($$
  select public.apply_inventory_count(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '[{"ingredient_id":"11110001-0000-0000-0000-000000000001","counted":5}]'::jsonb,
    'Inventário intruso')
$$, 'P0001', 'ingrediente_invalido',
   'Sob RLS, ingrediente de outro tenant é invisível → rejeitado');

-- ── Cenário 3: defaults de validade (limite inferior FoodKeeper+HACCP) ──────
reset role;
select is(
  (select shelf_life_days from public.shelf_life_defaults
    where category = 'peixe-fresco' and storage_mode = 'refrigerado'),
  1, 'Peixe fresco refrigerado: 1 dia');

select is(
  (select shelf_life_days from public.shelf_life_defaults
    where category = 'mercearia' and storage_mode = 'ambiente'),
  180, 'Mercearia ambiente: 180 dias');

select is(
  (select shelf_life_days from public.shelf_life_defaults
    where category = '*' and storage_mode = 'refrigerado'),
  3, 'Fallback refrigerado sem categoria: 3 dias (conservador)');

select * from finish();
rollback;
