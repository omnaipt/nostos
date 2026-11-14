-- STOA/Nostos - Testes do Stock S1 (migration 0032).
-- Grupos:
--   A) Conversao de unidades no stock_movement_guard (item 1): kg->g, l->ml,
--      un->g com peso medio, un sem peso (rejeitado), kg->ml (rejeitado).
--   B) Artigos de compra e embalagens (item 2): entrada por packs em l e em ml,
--      soma de duas marcas no mesmo ingrediente, qty que nao coincide, guarda
--      de convertibilidade, familias, aliases ligados a artigo, isolamento
--      multi-tenant das tabelas e campos novos.
--
-- Correr com: supabase test db (pgTAP). Requer 0001..0018 + 0032.
-- Normas pgTAP da casa: UUIDs fixos, role authenticated + request.jwt.claims,
-- tudo numa transaccao com rollback.

begin;

select plan(28);

-- ============================================================================
-- SEED (superuser)
-- ============================================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'fmt-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'fmt-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- Ingredientes A (varias unidades) e um ingrediente B.
insert into public.ingredients (id, restaurant_id, name, unit, unit_weight_g) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Farinha A', 'g',  null),
  ('11110002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Leite A',   'ml', null),
  ('11110003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cebola A',  'g',  150),
  ('11110004-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alho A',    'g',  null),
  ('11110005-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Vinho A',   'l',  null),
  ('11110006-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Azeite A',  'ml', null),
  ('22220001-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Polvo B',   'kg', null);

-- Familias (uma por restaurante).
insert into public.ingredient_families (id, restaurant_id, name) values
  ('fa000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Oleos'),
  ('fb000001-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Molhos');

-- Artigos de compra de A: duas marcas de vinho (garrafao 5 L) e um de azeite.
insert into public.purchase_items (id, restaurant_id, ingredient_id, brand, label, pack_qty, pack_unit) values
  ('c1000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 'Marca 1', 'Garrafao 5 L', 5, 'l'),
  ('c1000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 'Marca 2', 'Garrafao 5 L', 5, 'l'),
  ('c1000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110006-0000-0000-0000-000000000006', 'Gallo',   'Garrafao 5 L', 5, 'l');

-- ============================================================================
-- OWNER A
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- A1) 2 kg num ingrediente em g -> normaliza para 2000 g e custo por g.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, cost_per_unit_cents)
  values ('d1000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'purchase', 2, 'kg', 100)
$$, '2 kg entra num ingrediente em g');
select is(
  (select qty from public.stock_movements where id = 'd1000001-0000-0000-0000-000000000001'),
  2000::numeric, '2 kg gravado como 2000 g');
select is(
  (select unit from public.stock_movements where id = 'd1000001-0000-0000-0000-000000000001'),
  'g', 'unidade normalizada para a do ingrediente');
select is(
  (select cost_per_unit_cents from public.stock_movements where id = 'd1000001-0000-0000-0000-000000000001'),
  0.1::numeric, 'custo 100/kg normalizado para 0,1/g');

-- A2) 10 l num ingrediente em ml -> 10000 ml.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit)
  values ('d1000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110002-0000-0000-0000-000000000002', 'purchase', 10, 'l')
$$, '10 l entra num ingrediente em ml');
select is(
  (select qty from public.stock_movements where id = 'd1000002-0000-0000-0000-000000000002'),
  10000::numeric, '10 l gravado como 10000 ml');

-- A3) 2 un num ingrediente em g com peso medio 150 -> 300 g.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit)
  values ('d1000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110003-0000-0000-0000-000000000003', 'purchase', 2, 'un')
$$, '2 un entra num ingrediente em g com peso medio');
select is(
  (select qty from public.stock_movements where id = 'd1000003-0000-0000-0000-000000000003'),
  300::numeric, '2 un a 150 g/un gravado como 300 g');

-- A4) 2 un num ingrediente em g SEM peso medio -> rejeitado.
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110004-0000-0000-0000-000000000004', 'purchase', 2, 'un')
$$, 'P0001', 'grandeza_diferente_do_ingrediente', 'un sem peso medio e rejeitado');

-- A5) 1 kg num ingrediente em ml (massa contra volume) -> rejeitado.
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110002-0000-0000-0000-000000000002', 'purchase', 1, 'kg')
$$, 'P0001', 'grandeza_diferente_do_ingrediente', 'kg num ingrediente em ml e rejeitado');

-- B1) 2 embalagens de 5 l num ingrediente em l -> 10 l, custo por litro.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, cost_per_unit_cents, purchase_item_id, packs)
  values ('d1000004-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 'purchase', 10, 'l', 398, 'c1000001-0000-0000-0000-000000000001', 2)
$$, '2 embalagens de 5 l entram num ingrediente em l');
select is(
  (select qty from public.stock_movements where id = 'd1000004-0000-0000-0000-000000000004'),
  10::numeric, '2 x 5 l gravado como 10 l');
select is(
  (select cost_per_unit_cents from public.stock_movements where id = 'd1000004-0000-0000-0000-000000000004'),
  398::numeric, 'custo por litro preservado');

-- B2) a mesma entrada num ingrediente em ml -> 10000 ml.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, purchase_item_id, packs)
  values ('d1000005-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110006-0000-0000-0000-000000000006', 'purchase', 10000, 'ml', 'c1000003-0000-0000-0000-000000000003', 2)
$$, '2 embalagens de 5 l entram num ingrediente em ml');
select is(
  (select qty from public.stock_movements where id = 'd1000005-0000-0000-0000-000000000005'),
  10000::numeric, '2 x 5 l gravado como 10000 ml');

-- B3) duas marcas (dois artigos) do mesmo ingrediente somam no mesmo stock_qty.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, purchase_item_id, packs)
  values ('d1000006-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 'purchase', 10, 'l', 'c1000002-0000-0000-0000-000000000002', 2)
$$, 'segunda marca entra no mesmo ingrediente');
select is(
  (select stock_qty from public.ingredients where id = '11110005-0000-0000-0000-000000000005'),
  20::numeric, 'duas marcas somam no mesmo stock_qty (10 + 10 = 20 l)');

-- B4) packs com qty que nao coincide -> rejeitado.
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, purchase_item_id, packs)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 'purchase', 9, 'l', 'c1000001-0000-0000-0000-000000000001', 2)
$$, 'P0001', 'qty_nao_coincide_com_embalagens', 'qty que nao bate com packs x pack_qty e rejeitada');

-- B5) familia do mesmo restaurante liga; familia de outro e rejeitada.
select lives_ok($$
  update public.ingredients set family_id = 'fa000001-0000-0000-0000-000000000001'
   where id = '11110001-0000-0000-0000-000000000001'
$$, 'familia do mesmo restaurante liga ao ingrediente');
select throws_ok($$
  update public.ingredients set family_id = 'fb000001-0000-0000-0000-000000000001'
   where id = '11110001-0000-0000-0000-000000000001'
$$, 'P0001', 'familia_de_outro_restaurante', 'familia de outro restaurante e rejeitada');

-- B6) guarda de convertibilidade do artigo: formato incompativel e rejeitado.
select throws_ok($$
  insert into public.purchase_items (restaurant_id, ingredient_id, pack_qty, pack_unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 1, 'un')
$$, 'P0001', 'formato_incompativel_com_ingrediente', 'artigo em un para ingrediente em l (sem peso) e rejeitado');

-- B7) alias ligado a artigo do mesmo ingrediente; alias antigo sem artigo.
select lives_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id, purchase_item_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'adega silva', 'vinho da casa 5l', '11110005-0000-0000-0000-000000000005', 'c1000001-0000-0000-0000-000000000001')
$$, 'alias liga ao artigo do mesmo ingrediente');
select lives_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'moagem lima', 'farinha t65', '11110001-0000-0000-0000-000000000001')
$$, 'alias antigo sem artigo continua valido');

-- B8) alias cujo artigo aponta para outro ingrediente -> rejeitado.
select throws_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id, purchase_item_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'moagem lima', 'farinha com artigo errado', '11110001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001')
$$, 'P0001', 'artigo_de_outro_restaurante_ou_ingrediente', 'artigo de outro ingrediente e rejeitado');

-- ============================================================================
-- OWNER B (isolamento)
-- ============================================================================
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.ingredient_families where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'Owner B nao ve familias do tenant A');
select is(
  (select count(*)::int from public.purchase_items where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'Owner B nao ve artigos do tenant A');

-- Owner B nao cria artigo para ingrediente do tenant A (guarda sob RLS).
select throws_ok($$
  insert into public.purchase_items (restaurant_id, ingredient_id, pack_qty, pack_unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110005-0000-0000-0000-000000000005', 5, 'l')
$$, 'P0001', 'ingrediente_de_outro_restaurante', 'Owner B nao cria artigo no tenant A');

-- Owner B nao liga alias a um artigo do tenant A.
select throws_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id, purchase_item_id)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'intruso', 'x', '22220001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001')
$$, 'P0001', 'artigo_de_outro_restaurante_ou_ingrediente', 'Owner B nao liga alias a artigo do tenant A');

select * from finish();
rollback;
