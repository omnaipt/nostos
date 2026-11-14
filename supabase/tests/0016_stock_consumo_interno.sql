-- STOA/Nostos - Testes do Stock S2 (migration 0033).
-- Grupos:
--   A) Movimentos: tipo internal_use, sinal, motivo, estimado, modo de consumo
--      (contagem) e guarda de perfil, com um caso por perfil (item 1).
--   B) RPC register_dish_consumption: ficha de 3 ingredientes e 6 doses,
--      rascunho (estimado), linha livre e ingrediente em contagem em
--      nao_abatidas, prato sem ficha, perfil balcao rejeitado (item 2).
--   C) Reserva do sprint 04: custo medio por unidade base apos entrada por
--      embalagens (item 5).
--
-- Correr com: supabase test db (pgTAP). Requer 0001..0032 + 0033.
-- Normas pgTAP da casa: UUIDs fixos, role authenticated + request.jwt.claims,
-- tudo numa transaccao com rollback.

begin;

select plan(36);

-- ============================================================================
-- SEED (superuser)
-- ============================================================================
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('a1111111-1111-1111-1111-111111111111', 'gestorA@stoa.test'),
  ('a2222222-2222-2222-2222-222222222222', 'cozinhaA@stoa.test'),
  ('a3333333-3333-3333-3333-333333333333', 'balcaoA@stoa.test'),
  ('a4444444-4444-4444-4444-444444444444', 'consultorA@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 's2-a', '11111111-1111-1111-1111-111111111111');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'gestor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 'cozinha'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', 'balcao'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4444444-4444-4444-4444-444444444444', 'consultor');

-- Ingrediente em modo ficha (defeito) e outro em modo contagem.
insert into public.ingredients (id, restaurant_id, name, unit, depletion_mode) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Frango A', 'g', 'ficha'),
  ('11110002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sal A',    'g', 'contagem');

-- Ingredientes e fichas para a RPC de consumo por prato (item 2).
insert into public.ingredients (id, restaurant_id, name, unit, depletion_mode) values
  ('11110010-0000-0000-0000-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Massa A',       'g',  'ficha'),
  ('11110011-0000-0000-0000-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Molho A',       'ml', 'ficha'),
  ('11110012-0000-0000-0000-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Queijo A',      'g',  'ficha'),
  ('11110013-0000-0000-0000-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Azeite mesa A', 'ml', 'contagem');

insert into public.menu_categories (id, restaurant_id, label) values
  ('ca000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pratos');

insert into public.menu_items (id, restaurant_id, category_id, name) values
  ('b1000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ca000001-0000-0000-0000-000000000001', 'Massada A'),
  ('b1000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ca000001-0000-0000-0000-000000000001', 'Prato rascunho A'),
  ('b1000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ca000001-0000-0000-0000-000000000001', 'Prato misto A'),
  ('b1000004-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ca000001-0000-0000-0000-000000000001', 'Prato sem ficha A');

-- M1: ficha validada, 2 doses, 3 ingredientes (quantidades exactas).
insert into public.tech_sheets (id, restaurant_id, menu_item_id, servings, status) values
  ('70000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000001-0000-0000-0000-000000000001', 2, 'validada');
insert into public.tech_sheet_ingredients (restaurant_id, tech_sheet_id, ingredient_id, name, qty, unit, sort_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000001-0000-0000-0000-000000000001', '11110010-0000-0000-0000-000000000010', 'Massa A',  100, 'g',  1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000001-0000-0000-0000-000000000001', '11110011-0000-0000-0000-000000000011', 'Molho A',   50, 'ml', 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000001-0000-0000-0000-000000000001', '11110012-0000-0000-0000-000000000012', 'Queijo A',  20, 'g',  3);

-- M2: ficha em rascunho, 1 dose, 1 ingrediente (abate estimado).
insert into public.tech_sheets (id, restaurant_id, menu_item_id, servings, status) values
  ('70000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000002-0000-0000-0000-000000000002', 1, 'rascunho');
insert into public.tech_sheet_ingredients (restaurant_id, tech_sheet_id, ingredient_id, name, qty, unit, sort_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000002-0000-0000-0000-000000000002', '11110010-0000-0000-0000-000000000010', 'Massa A', 10, 'g', 1);

-- M3: ficha validada com uma linha livre, um ingrediente em contagem e um normal.
insert into public.tech_sheets (id, restaurant_id, menu_item_id, servings, status) values
  ('70000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000003-0000-0000-0000-000000000003', 1, 'validada');
insert into public.tech_sheet_ingredients (restaurant_id, tech_sheet_id, ingredient_id, name, qty, unit, sort_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000003-0000-0000-0000-000000000003', null,                                    'Sal grosso', 5,  'g',  1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000003-0000-0000-0000-000000000003', '11110013-0000-0000-0000-000000000013', 'Azeite mesa A', 10, 'ml', 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '70000003-0000-0000-0000-000000000003', '11110010-0000-0000-0000-000000000010', 'Massa A',       20, 'g',  3);

-- ============================================================================
-- A) MOVIMENTOS (item 1)
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- A0) depletion_mode por defeito e 'ficha'.
select is(
  (select depletion_mode from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  'ficha', 'depletion_mode por defeito e ficha');

-- A1) internal_use negativo com motivo entra; estimated por defeito false.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('d2000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -100, 'g', 'pessoal')
$$, 'internal_use negativo com motivo entra');
select is(
  (select estimated from public.stock_movements where id = 'd2000001-0000-0000-0000-000000000001'),
  false, 'estimated por defeito e false');

-- A2) internal_use positivo e rejeitado (coerencia de sinal).
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', 100, 'g', 'pessoal')
$$, '23514', 'internal_use positivo viola a coerencia de sinal');

-- A3) internal_use sem motivo e rejeitado (coerencia de motivo).
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -100, 'g')
$$, '23514', 'internal_use sem motivo e rejeitado');

-- A4) motivo invalido e rejeitado (dominio do motivo).
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -100, 'g', 'furto')
$$, '23514', 'motivo fora do dominio e rejeitado');

-- A5) waste com motivo entra.
select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'waste', -50, 'g', 'outro')
$$, 'waste com motivo entra');

-- A6) waste sem motivo entra (motivo permitido, nao obrigatorio).
select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'waste', -50, 'g')
$$, 'waste sem motivo entra');

-- A7) purchase com motivo e rejeitado (motivo nulo nos restantes tipos).
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'purchase', 100, 'g', 'pessoal')
$$, '23514', 'purchase com motivo e rejeitado');

-- A8) estimated true grava-se.
select lives_ok($$
  insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, reason, estimated)
  values ('d2000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -30, 'g', 'oferta', true)
$$, 'internal_use estimado entra');
select is(
  (select estimated from public.stock_movements where id = 'd2000002-0000-0000-0000-000000000002'),
  true, 'estimated true grava-se');

-- A9) sale_depletion num ingrediente em contagem e rejeitado.
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110002-0000-0000-0000-000000000002', 'sale_depletion', -10, 'g')
$$, 'P0001', 'ingrediente_consumido_por_contagem', 'sale_depletion em contagem e rejeitado');

-- A10) internal_use num ingrediente em contagem e rejeitado.
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110002-0000-0000-0000-000000000002', 'internal_use', -10, 'g', 'prova')
$$, 'P0001', 'ingrediente_consumido_por_contagem', 'internal_use em contagem e rejeitado');

-- ---- Guarda de perfil: um caso por perfil --------------------------------
-- gestor: internal_use aceite.
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -10, 'g', 'pessoal')
$$, 'gestor pode registar consumo interno');

-- cozinha: waste aceite.
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'waste', -10, 'g', 'outro')
$$, 'cozinha pode registar quebra');

-- balcao: internal_use rejeitado.
set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -10, 'g', 'pessoal')
$$, 'P0001', 'perfil_sem_permissao', 'balcao nao pode registar consumo interno');

-- consultor: waste rejeitado (guarda de perfil antes da RLS; BEFORE trigger).
set local request.jwt.claims = '{"sub":"a4444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'waste', -10, 'g', 'outro')
$$, 'P0001', 'perfil_sem_permissao', 'consultor nao pode registar quebra');

-- service role (sem utilizador): guarda de perfil nao se aplica.
set local role postgres;
set local request.jwt.claims = '';
select lives_ok($$
  insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, reason)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'internal_use', -10, 'g', 'pessoal')
$$, 'service role (sem auth.uid) nao e travado pela guarda de perfil');

-- ============================================================================
-- B) RPC register_dish_consumption (item 2)
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- B1) ficha de 3 ingredientes e 6 doses: abate os 3 (quantidades exactas).
select is(
  (public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000001-0000-0000-0000-000000000001',
    6, 'internal_use', 'pessoal', 'almoco do pessoal') ->> 'movimentos')::int,
  3, 'ficha de 3 ingredientes gera 3 movimentos');
-- 6 doses / 2 servings = 3x a ficha.
select is(
  (select qty from public.stock_movements
    where ingredient_id = '11110010-0000-0000-0000-000000000010' and kind = 'internal_use'),
  -300::numeric, 'Massa: 6 doses de 100 g/2 servings = 300 g abatidos');
select is(
  (select qty from public.stock_movements
    where ingredient_id = '11110011-0000-0000-0000-000000000011' and kind = 'internal_use'),
  -150::numeric, 'Molho: 50 ml -> 150 ml abatidos');
select is(
  (select qty from public.stock_movements
    where ingredient_id = '11110012-0000-0000-0000-000000000012' and kind = 'internal_use'),
  -60::numeric, 'Queijo: 20 g -> 60 g abatidos');
select is(
  (select bool_or(estimated) from public.stock_movements
    where ingredient_id = '11110010-0000-0000-0000-000000000010' and kind = 'internal_use'),
  false, 'ficha validada gera movimentos nao estimados');

-- B2) ficha em rascunho: movimentos marcados como estimados.
select is(
  (public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000002-0000-0000-0000-000000000002',
    1, 'internal_use', 'oferta', 'cortesia') ->> 'estimated')::boolean,
  true, 'ficha em rascunho devolve estimated true');
select is(
  (select count(*)::int from public.stock_movements
    where kind = 'internal_use' and estimated = true),
  1, 'ficha em rascunho gera 1 movimento estimado');

-- B3) linha livre + ingrediente em contagem: dois em nao_abatidas, um abatido.
select is(
  jsonb_array_length(public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000003-0000-0000-0000-000000000003',
    1, 'internal_use', 'prova', 'prova de cozinha') -> 'nao_abatidas'),
  2, 'linha livre e ingrediente em contagem voltam em nao_abatidas');
-- A chamada acima ja abateu a Massa (20 g); confirma 1 abate so.
select is(
  (select count(*)::int from public.stock_movements
    where ingredient_id = '11110010-0000-0000-0000-000000000010' and reason = 'prova'),
  1, 'so o ingrediente normal da ficha mista abate');
-- O ingrediente em contagem nao gerou movimento.
select is(
  (select count(*)::int from public.stock_movements
    where ingredient_id = '11110013-0000-0000-0000-000000000013'),
  0, 'ingrediente em contagem nao gera movimento pela RPC');

-- B4) prato sem ficha: erro prato_sem_ficha e nada gravado.
create temporary table _cnt_b4 as
  select count(*) as n from public.stock_movements;
select throws_ok($$
  select public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000004-0000-0000-0000-000000000004',
    1, 'internal_use', 'pessoal', null)
$$, 'P0001', 'prato_sem_ficha', 'prato sem ficha devolve prato_sem_ficha');
select is(
  (select count(*) from public.stock_movements),
  (select n from _cnt_b4), 'prato sem ficha nao grava nada');

-- B5) doses invalidas e kind invalido.
select throws_ok($$
  select public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000001-0000-0000-0000-000000000001',
    0, 'internal_use', 'pessoal', null)
$$, 'P0001', 'doses_invalidas', 'doses <= 0 sao rejeitadas');
select throws_ok($$
  select public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000001-0000-0000-0000-000000000001',
    1, 'purchase', null, null)
$$, 'P0001', 'kind_invalido', 'kind fora de internal_use/waste e rejeitado');

-- B6) perfil balcao: a guarda trava o abate pela RPC.
set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok($$
  select public.register_dish_consumption(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b1000001-0000-0000-0000-000000000001',
    1, 'internal_use', 'pessoal', null)
$$, 'P0001', 'perfil_sem_permissao', 'balcao nao pode registar consumo por prato');

-- B7) grants: authenticated executa, anon nao.
select ok(
  has_function_privilege('authenticated',
    'public.register_dish_consumption(uuid,uuid,numeric,text,text,text)', 'execute'),
  'authenticated executa a RPC');
select ok(
  not has_function_privilege('anon',
    'public.register_dish_consumption(uuid,uuid,numeric,text,text,text)', 'execute'),
  'anon nao executa a RPC');

select * from finish();
rollback;
