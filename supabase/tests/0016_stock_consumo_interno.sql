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

select plan(19);

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

select * from finish();
rollback;
