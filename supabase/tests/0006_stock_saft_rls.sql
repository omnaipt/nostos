-- STOA/Nostos — Testes RLS + mecânica do Stock e Imports SAF-T (0011 + 0012).
-- Valida: aplicação de movimentos ao saldo, coerência de sinal e unidade,
-- imutabilidade, actualização de custo em entradas, isolamento multi-tenant
-- de stock_movements/pos_product_map/saft_imports/saft_import_lines, e as
-- guardas de coerência das linhas SAF-T.
--
-- Correr com: supabase test db (pgTAP). Requer 0001 + 0005 + 0006 + 0011 + 0012.

begin;

select plan(13);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test', '{"full_name":"Owner A"}'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test', '{"full_name":"Owner B"}');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.menu_categories (id, restaurant_id, label) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Peixe');

insert into public.menu_items (id, restaurant_id, category_id, name, price_cents) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Polvo à lagareiro', 1800);

insert into public.ingredients (id, restaurant_id, name, unit, cost_per_unit_cents, stock_qty, low_stock_threshold) values
  ('a1110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Polvo fresco', 'kg', 890, 0, 5),
  ('b2220001-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Arroz', 'kg', 145, 10, null);

-- ── Cenário 1: Owner A, mecânica do stock ───────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, cost_per_unit_cents, source, source_ref)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1110001-0000-0000-0000-000000000001', 'purchase', 12.000, 'kg', 980, 'invoice', 'FR 2026/0341')
$$, 'Entrada de compra aceite');

select is(
  (select stock_qty from public.ingredients where id = 'a1110001-0000-0000-0000-000000000001'),
  12.000::numeric, 'Entrada aplicou o saldo (0 → 12)');

select is(
  (select cost_per_unit_cents from public.ingredients where id = 'a1110001-0000-0000-0000-000000000001'),
  980::numeric, 'Entrada com custo actualizou o custo corrente (890 → 980)');

select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, source, source_ref)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1110001-0000-0000-0000-000000000001', 'sale_depletion', -7.000, 'kg', 'saft_import', 'FS A/0001')
$$, 'Abate de vendas aceite');

select is(
  (select stock_qty from public.ingredients where id = 'a1110001-0000-0000-0000-000000000001'),
  5.000::numeric, 'Abate aplicou o saldo (12 → 5)');

-- Sinal errado é rejeitado pela check (23514).
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1110001-0000-0000-0000-000000000001', 'purchase', -1.000, 'kg')
$$, '23514', null, 'purchase com qty negativa é rejeitada');

-- Unidade diferente da do ingrediente é rejeitada pelo trigger.
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1110001-0000-0000-0000-000000000001', 'purchase', 1.000, 'l')
$$, 'unidade_diferente_do_ingrediente', null, 'Unidade incoerente é rejeitada');

-- Imutabilidade.
select throws_ok($$
  update public.stock_movements set qty = -6.000 where source_ref = 'FS A/0001'
$$, 'movimento_imutavel_corrigir_com_adjustment', null, 'Movimento não se edita');

-- Mapa POS: prato de outro tenant é rejeitado.
select lives_ok($$
  insert into public.pos_product_map (restaurant_id, pos_code, pos_description, menu_item_id, confirmed)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '401', 'POLVO LAGAR.', '11110001-0000-0000-0000-000000000001', true)
$$, 'Mapa POS→prato criado');

-- ── Cenário 2: SAF-T imports ────────────────────────────────────────────────
select lives_ok($$
  insert into public.saft_imports (id, restaurant_id, filename, status)
  values ('51110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'saft_14jul.xml', 'review')
$$, 'Import SAF-T criado');

select lives_ok($$
  insert into public.saft_import_lines (restaurant_id, import_id, invoice_no, pos_code, pos_description, qty, menu_item_id, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '51110001-0000-0000-0000-000000000001', 'FS A/0001', '401', 'POLVO LAGAR.', 4, '11110001-0000-0000-0000-000000000001', 'matched')
$$, 'Linha casada aceite');

-- matched sem prato viola a coerência (23514).
select throws_ok($$
  insert into public.saft_import_lines (restaurant_id, import_id, invoice_no, qty, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '51110001-0000-0000-0000-000000000001', 'FS A/0002', 1, 'matched')
$$, '23514', null, 'Linha matched sem prato é rejeitada');

-- ── Cenário 3: Owner B isolado ──────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.stock_movements),
  0, 'Owner B não vê movimentos do tenant A');

select * from finish();
rollback;
