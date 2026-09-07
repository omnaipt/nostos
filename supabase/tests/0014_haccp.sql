-- STOA/Nostos — Testes do modulo HACCP v1 (migration 0029).
-- Grupos: roles, pontos, registos, nc, recepcao, estado, retencao/purga, RLS.
--
-- Relogio controlado: substituimos public.haccp_now() por constantes dentro da
-- transaccao (o unico create or replace permitido). Isolamento por restaurante:
--   A = roles, pontos, registos, nao conformidades, recepcao
--   B = purga (fixtures fora e dentro da retencao, semeados)
--   C = estado por turno, sumario e anti-metrica (2 pontos, 2 turnos, contas exactas)
-- Dados probatorios sao semeados com haccp.seed='on' (so por superuser), que
-- respeita carimbos e salta a validacao de janela.
--
-- Correr com: supabase test db (pgTAP). Requer 0001..0028 + 0029.

begin;

select plan(85);

-- ════════════════════════════════════════════════════════════════════════════
-- SEED (superuser)
-- ════════════════════════════════════════════════════════════════════════════
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('33333333-3333-3333-3333-333333333333', 'gestorA@stoa.test'),
  ('44444444-4444-4444-4444-444444444444', 'cozinhaA@stoa.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'consultorA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test'),
  ('77777777-7777-7777-7777-777777777777', 'ownerC@stoa.test'),
  ('88888888-8888-8888-8888-888888888888', 'cozinhaC@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'h-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'h-b', '22222222-2222-2222-2222-222222222222'),
  ('99999999-9999-9999-9999-999999999999', 'Tasca C', 'h-c', '77777777-7777-7777-7777-777777777777');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'gestor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'cozinha'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'consultor'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner'),
  ('99999999-9999-9999-9999-999999999999', '77777777-7777-7777-7777-777777777777', 'owner'),
  ('99999999-9999-9999-9999-999999999999', '88888888-8888-8888-8888-888888888888', 'cozinha');

-- Turnos A: Almoco 12:30, Jantar 19:30 (todos os dias) + um turno so ao sabado.
insert into public.turns (id, restaurant_id, label, start_time, weekdays) values
  ('aa000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Almoco A', '12:30', array[1,2,3,4,5,6,7]),
  ('aa000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Jantar A', '19:30', array[1,2,3,4,5,6,7]),
  ('aa000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sabado A', '12:30', array[6]);
-- Turno B e turnos C.
insert into public.turns (id, restaurant_id, label, start_time, weekdays) values
  ('bb000001-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Almoco B', '12:30', array[1,2,3,4,5,6,7]),
  ('cc000001-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'Almoco C', '12:30', array[1,2,3,4,5,6,7]),
  ('cc000002-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', 'Jantar C', '19:30', array[1,2,3,4,5,6,7]);

-- Linhas de negocio em A que o consultor NAO deve ler.
insert into public.reservations (id, restaurant_id, customer_name, party_size, reserved_at, service_date) values
  ('ee000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente', 2, now(), current_date);
insert into public.menu_categories (id, restaurant_id, label) values
  ('ac000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pratos');
insert into public.menu_items (id, restaurant_id, category_id, name, price_cents) values
  ('a1000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ac000001-0000-0000-0000-000000000001', 'Bitoque', 1000);
insert into public.ingredients (id, restaurant_id, name, unit) values
  ('1a000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Batata', 'kg');

-- Relogio inicial: segunda-feira 2026-09-07 13:00 (Almoco aberto, Jantar futuro).
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-07 13:00:00+01'::timestamptz $$;

-- Pontos de controlo de C (estado): created_at antigo para contarem no dia D.
insert into public.haccp_control_points (id, restaurant_id, name, kind, all_turns, created_at) values
  ('c9000001-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'Frio C1', 'frio_positivo', true,  '2026-01-01 00:00:00+00'),
  ('c9000002-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999', 'Frio C2', 'frio_positivo', false, '2026-01-01 00:00:00+00');
insert into public.haccp_control_point_turns (control_point_id, turn_id, restaurant_id) values
  ('c9000002-0000-0000-0000-000000000002', 'cc000002-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999');

-- Ponto de controlo de B (para readings de purga e teste cross-tenant).
insert into public.haccp_control_points (id, restaurant_id, name, kind, all_turns, created_at) values
  ('9b000000-0000-0000-0000-0000000000bb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Frio B1', 'frio_positivo', true, '2026-01-01 00:00:00+00');

-- Fornecedor B (para recepcao/recusa de purga e teste cross-tenant de recepcao).
insert into public.suppliers (id, restaurant_id, name, name_norm) values
  ('5b000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fornecedor B', 'fornecedor b');

-- ── Fixtures semeados (haccp.seed='on') ─────────────────────────────────────
set local haccp.seed = 'on';

-- B: reading dentro da retencao (sobrevive) e fora (purgado).
insert into public.haccp_temperature_readings
  (id, restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_by, recorded_at) values
  ('bb000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '9b000000-0000-0000-0000-0000000000bb', 'bb000001-0000-0000-0000-000000000001',
     (current_date - interval '1 month')::date, 3.0, 'online',
     '22222222-2222-2222-2222-222222222222', now());
insert into public.haccp_temperature_readings
  (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_by, recorded_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '9b000000-0000-0000-0000-0000000000bb',
     'bb000001-0000-0000-0000-000000000001', (current_date - interval '25 months')::date, 3.0, 'online',
     '22222222-2222-2222-2222-222222222222', now());

-- B: recepcao fora da retencao + recusa.
insert into public.haccp_receptions
  (id, restaurant_id, supplier_id, delivered_on, service_date, expiry_ok, packaging_ok, conforming, recorded_by, recorded_at) values
  ('6b000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '5b000000-0000-0000-0000-0000000000b1', (current_date - interval '25 months')::date,
     (current_date - interval '25 months')::date, true, false, false,
     '22222222-2222-2222-2222-222222222222', now());
insert into public.haccp_rejections
  (restaurant_id, reception_id, cause, recorded_by, recorded_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '6b000000-0000-0000-0000-0000000000b1',
     'temperatura_insuficiente', '22222222-2222-2222-2222-222222222222', now());

-- B: nao conformidade fora da retencao + verificacao.
insert into public.haccp_nonconformities
  (id, restaurant_id, source, service_date, description, product_disposition, immediate_action, root_cause_action, executed_by_name, recorded_by, recorded_at) values
  ('9b000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     'manual', (current_date - interval '25 months')::date, 'Desvio antigo', 'Descartado',
     'Accao imediata', 'Accao de fundo', 'Chefe B', '22222222-2222-2222-2222-222222222222', now());
insert into public.haccp_nc_verifications
  (restaurant_id, nonconformity_id, effective, verified_by, verified_at) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '9b000000-0000-0000-0000-0000000000b1', true,
     '33333333-3333-3333-3333-333333333333', now());

-- B: objecto de storage fora da retencao (prefixo do restaurante B).
insert into storage.objects (bucket_id, name, metadata, created_at) values
  ('haccp-evidence', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/antigo.jpg',
     '{"size": 1000}'::jsonb, (current_date - interval '25 months')::timestamptz);

-- C: fixture de registos em bloco (anti-metrica), dia 2026-09-04, fora do dia D.
insert into public.haccp_temperature_readings
  (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_by, recorded_at) values
  ('99999999-9999-9999-9999-999999999999', 'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', '2026-09-04', 3.0, 'online', '88888888-8888-8888-8888-888888888888', '2026-09-04 13:00:00+01'),
  ('99999999-9999-9999-9999-999999999999', 'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', '2026-09-04', 3.0, 'online', '88888888-8888-8888-8888-888888888888', '2026-09-04 13:00:30+01'),
  ('99999999-9999-9999-9999-999999999999', 'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', '2026-09-04', 3.0, 'online', '88888888-8888-8888-8888-888888888888', '2026-09-04 13:01:00+01'),
  ('99999999-9999-9999-9999-999999999999', 'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', '2026-09-04', 3.0, 'online', '77777777-7777-7777-7777-777777777777', '2026-09-04 13:00:00+01'),
  ('99999999-9999-9999-9999-999999999999', 'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', '2026-09-04', 3.0, 'online', '77777777-7777-7777-7777-777777777777', '2026-09-04 13:00:30+01');

set local haccp.seed = 'off';

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO roles (8)
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select is(public.member_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'consultor',
  'roles: member_role devolve consultor');                                                        -- 1
select is((select count(*)::int from public.restaurants where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1,
  'roles: consultor le restaurants do seu restaurante');                                          -- 2
select is((select count(*)::int from public.turns where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 3,
  'roles: consultor le turns do seu restaurante');                                                -- 3
select is((select count(*)::int from public.restaurant_members where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 4,
  'roles: consultor le restaurant_members do seu restaurante');                                   -- 4
select is((select count(*)::int from public.reservations where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'roles: consultor NAO le reservations');                                                        -- 5
select is((select count(*)::int from public.menu_items where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'roles: consultor NAO le menu_items');                                                          -- 6
select is((select count(*)::int from public.ingredients where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'roles: consultor NAO le ingredients');                                                         -- 7

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.reservations where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1,
  'roles: owner continua a ler reservations');                                                    -- 8

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO pontos (7)   [owner A cria; defaults; guardas]
-- ════════════════════════════════════════════════════════════════════════════
insert into public.haccp_control_points (id, restaurant_id, name, kind)
  values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Frigorifico 1', 'frio_positivo');
select is((select min_c from public.haccp_control_points where id = 'a1000000-0000-0000-0000-000000000001'), 0::numeric(5,1),
  'pontos: min_c herdado do tipo (0)');                                                           -- 9
select is((select max_c from public.haccp_control_points where id = 'a1000000-0000-0000-0000-000000000001'), 5::numeric(5,1),
  'pontos: max_c herdado do tipo (5)');                                                           -- 10

-- Pontos extra de A para registos (nao asseridos aqui).
insert into public.haccp_control_points (id, restaurant_id, name, kind, all_turns)
  values ('a2000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Frigorifico 2', 'frio_positivo', false);
insert into public.haccp_control_point_turns (control_point_id, turn_id, restaurant_id)
  values ('a2000000-0000-0000-0000-000000000002', 'aa000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.haccp_control_points (id, restaurant_id, name, kind)
  values ('a3000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Frigorifico 3', 'frio_positivo');
insert into public.haccp_control_points (id, restaurant_id, name, kind)
  values ('a4000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Inactivo', 'frio_positivo');
update public.haccp_control_points set active = false where id = 'a4000000-0000-0000-0000-000000000004';

-- Cozinha nao cria ponto (RLS: escrita e owner/gestor).
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$
  insert into public.haccp_control_points (restaurant_id, name, kind)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nao devia', 'frio_positivo')
$$, '42501', null, 'pontos: cozinha nao cria ponto (RLS)');                                       -- 11

-- Cross-tenant: owner B nao le pontos de A.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.haccp_control_points where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0,
  'pontos: cross-tenant nao le pontos de outro restaurante');                                     -- 12

-- Delete bloqueado (bypass RLS como superuser para chegar ao gatilho).
reset role;
select throws_ok($$
  delete from public.haccp_control_points where id = 'a1000000-0000-0000-0000-000000000001'
$$, 'P0001', 'haccp_ponto_nao_apagavel', 'pontos: delete levanta haccp_ponto_nao_apagavel');      -- 13

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$
  insert into public.haccp_control_points (restaurant_id, name, kind, min_c, max_c)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Limites maus', 'frio_positivo', 5, 5)
$$, '23514', null, 'pontos: min_c >= max_c rejeitado');                                            -- 14

select throws_ok($$
  insert into public.haccp_control_point_turns (control_point_id, turn_id, restaurant_id)
  values ('a2000000-0000-0000-0000-000000000002', 'bb000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
$$, 'P0001', 'turno_de_outro_restaurante', 'pontos: associacao a turno de outro restaurante rejeitada'); -- 15

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO registos (16)   [cozinha A, relogio 13:00]
-- ════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

-- Registo directo com recorded_at forjado pelo cliente: o servidor sobrepoe.
insert into public.haccp_temperature_readings
  (restaurant_id, control_point_id, turn_id, value_c, recorded_at, note) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1000000-0000-0000-0000-000000000001',
     'aa000001-0000-0000-0000-000000000001', 2.0, '2000-01-01 00:00:00+00', 'bogustest');
select is((select recorded_at from public.haccp_temperature_readings where note = 'bogustest'),
  '2026-09-07 13:00:00+01'::timestamptz, 'registos: recorded_at e do servidor, ignora o cliente'); -- 16

-- within_limits calculado.
select is((select within_limits from public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 5.0)), true,
  'registos: 5,0 em frio positivo (0..5) e conforme');                                            -- 17
select is((select within_limits from public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 5.1)), false,
  'registos: 5,1 nao e conforme');                                                                -- 18

-- Original para rectificacao e imutabilidade.
create temp table _rimm as
  select id from public.haccp_record_temperature(
    'a3000000-0000-0000-0000-000000000003', 'aa000001-0000-0000-0000-000000000001', 3.0);
-- Registo com desvio para a nao conformidade.
create temp table _rncdev as
  select id from public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 8.0);

-- Rectificacao valida.
select isnt((select id from public.haccp_record_temperature(
    'a3000000-0000-0000-0000-000000000003', 'aa000001-0000-0000-0000-000000000001', 3.5,
    null, 'correccao', (select id from _rimm))), null,
  'registos: rectificacao valida aceite');                                                        -- 19
-- Segunda rectificacao do mesmo original rejeitada.
select throws_ok(
  format($$ select public.haccp_record_temperature(
    'a3000000-0000-0000-0000-000000000003', 'aa000001-0000-0000-0000-000000000001', 3.6,
    null, 'segunda', %L) $$, (select id from _rimm)),
  'P0001', 'haccp_rectificacao_invalida', 'registos: segunda rectificacao do mesmo original rejeitada'); -- 20

-- Turno que nao corre nesse weekday (Sabado numa segunda).
select throws_ok($$ select public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000003-0000-0000-0000-000000000003', 4.0) $$,
  'P0001', 'haccp_turno_nao_corre_hoje', 'registos: turno que nao corre nesse dia rejeitado');    -- 21
-- Ponto inactivo.
select throws_ok($$ select public.haccp_record_temperature(
    'a4000000-0000-0000-0000-000000000004', 'aa000001-0000-0000-0000-000000000001', 4.0) $$,
  'P0001', 'haccp_ponto_inactivo', 'registos: ponto inactivo rejeitado');                         -- 22
-- Ponto de outro restaurante (RLS esconde-o -> ponto inexistente).
-- A RLS esconde o ponto de B antes do gatilho, por isso a RPC devolve haccp_ponto_inexistente.
select throws_ok($$ select public.haccp_record_temperature(
    '9b000000-0000-0000-0000-0000000000bb', 'aa000001-0000-0000-0000-000000000001', 4.0) $$,
  'P0001', 'haccp_ponto_inexistente', 'pontos de outro restaurante rejeitados');                  -- 23

-- Antes de opens_at (11:00 < 11:30).
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-07 11:00:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 4.0) $$,
  'P0001', 'haccp_fora_da_janela', 'registos: antes de opens_at rejeitado');                      -- 24

-- Depois de closes_at (20:00 > 19:30 do Almoco).
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-07 20:00:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 4.0) $$,
  'P0001', 'haccp_fora_da_janela', 'registos: depois de closes_at rejeitado');                    -- 25

-- Diferido dentro da janela e antes do cutoff (now 15:00, captura 13:00).
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-07 15:00:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is((select sync_mode from public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 4.0,
    '2026-09-07 13:00:00+01')), 'deferred',
  'registos: diferido na janela antes do cutoff aceite como deferred');                           -- 26

-- Diferido depois do cutoff (now 2026-09-08 07:00 > cutoff 06:00).
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-08 07:00:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 4.0,
    '2026-09-07 13:00:00+01') $$,
  'P0001', 'haccp_fora_da_janela', 'registos: diferido depois do cutoff rejeitado');              -- 27

-- captured_at no futuro (now 13:00, captura 14:00).
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-07 13:00:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 4.0,
    '2026-09-07 14:00:00+01') $$,
  'P0001', 'haccp_fora_da_janela', 'registos: captured_at no futuro rejeitado');                  -- 28

-- Consultor nao insere.
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
-- A RLS rejeita o INSERT do consultor com 42501 antes de o gatilho correr.
select throws_ok($$ select public.haccp_record_temperature(
    'a1000000-0000-0000-0000-000000000001', 'aa000001-0000-0000-0000-000000000001', 4.0) $$,
  '42501', null, 'registos: consultor nao insere registo');                                       -- 29

-- Imutabilidade absoluta (bypass RLS como superuser para chegar ao gatilho).
reset role;
select throws_ok(
  format($$ update public.haccp_temperature_readings set value_c = 9.0 where id = %L $$, (select id from _rimm)),
  'P0001', 'haccp_registo_imutavel', 'registos: UPDATE levanta haccp_registo_imutavel');          -- 30
select throws_ok(
  format($$ delete from public.haccp_temperature_readings where id = %L $$, (select id from _rimm)),
  'P0001', 'haccp_registo_imutavel', 'registos: DELETE levanta haccp_registo_imutavel');          -- 31

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO nc (8)   [A, relogio 13:00]
-- ════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

create temp table _ncok as
  with x as (
    insert into public.haccp_nonconformities
      (restaurant_id, source, reading_id, description, product_disposition, immediate_action, root_cause_action, executed_by_name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'temperature', (select id from _rncdev),
      'Temperatura acima do limite', 'Produto descartado', 'Reposto no frio', 'Chamado tecnico', 'Chefe A')
    returning id
  ) select id from x;
select isnt((select id from _ncok), null, 'nc: NC de temperatura com reading valido criada');     -- 32

-- reading_id de outro restaurante rejeitado.
select throws_ok($$
  insert into public.haccp_nonconformities
    (restaurant_id, source, reading_id, description, product_disposition, immediate_action, root_cause_action, executed_by_name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'temperature', 'bb000000-0000-0000-0000-0000000000b1',
    'x', 'xx', 'xx', 'xx', 'xx')
$$, 'P0001', 'haccp_registo_de_outro_restaurante', 'nc: reading_id de outro restaurante rejeitado'); -- 33

-- Verificacao pelo mesmo utilizador rejeitada.
select throws_ok(
  format($$ insert into public.haccp_nc_verifications (restaurant_id, nonconformity_id, effective)
            values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, true) $$, (select id from _ncok)),
  'P0001', 'haccp_verificacao_mesmo_utilizador', 'nc: verificacao pelo mesmo utilizador rejeitada'); -- 34

-- Verificacao por outro utilizador aceite.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select lives_ok(
  format($$ insert into public.haccp_nc_verifications (restaurant_id, nonconformity_id, effective)
            values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, true) $$, (select id from _ncok)),
  'nc: verificacao por outro utilizador aceite');                                                 -- 35

-- Segunda verificacao da mesma NC rejeitada (unico por NC).
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  format($$ insert into public.haccp_nc_verifications (restaurant_id, nonconformity_id, effective)
            values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, true) $$, (select id from _ncok)),
  '23505', null, 'nc: segunda verificacao da mesma NC rejeitada');                                 -- 36

-- NC manual para o consultor verificar.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
create temp table _nc2 as
  with x as (
    insert into public.haccp_nonconformities
      (restaurant_id, source, description, product_disposition, immediate_action, root_cause_action, executed_by_name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manual',
      'Desvio manual', 'Descartado', 'Accao', 'Accao fundo', 'Chefe A')
    returning id
  ) select id from x;

set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select lives_ok(
  format($$ insert into public.haccp_nc_verifications (restaurant_id, nonconformity_id, effective)
            values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, true) $$, (select id from _nc2)),
  'nc: consultor verifica eficacia');                                                             -- 37
select throws_ok($$
  insert into public.haccp_nonconformities
    (restaurant_id, source, description, product_disposition, immediate_action, root_cause_action, executed_by_name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manual', 'x', 'xx', 'xx', 'xx', 'xx')
$$, '42501', null, 'nc: consultor nao cria NC');                                                  -- 38

-- overdue: NC aberta ha 49 h.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
create temp table _nc3 as
  with x as (
    insert into public.haccp_nonconformities
      (restaurant_id, source, occurred_at, description, product_disposition, immediate_action, root_cause_action, executed_by_name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'manual', '2026-09-05 12:00:00+01',
      'Desvio ha muito', 'Descartado', 'Accao', 'Accao fundo', 'Chefe A')
    returning id
  ) select id from x;
select is((select overdue from public.haccp_nc_status where nonconformity_id = (select id from _nc3)), true,
  'nc: NC aberta ha 49 h esta overdue');                                                          -- 39

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO recepcao (12)   [A, relogio 13:00]
-- ════════════════════════════════════════════════════════════════════════════
create temp table _sup as
  with x as (
    insert into public.suppliers (restaurant_id, name) values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Peixaria Central') returning id
  ) select id from x;

-- Duplicado por nome normalizado.
select throws_ok($$
  insert into public.suppliers (restaurant_id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Peixaria  Central')
$$, '23505', null, 'recepcao: fornecedor duplicado por nome normalizado rejeitado');              -- 40

-- temperature_applicable sem valor.
select throws_ok(
  format($$ insert into public.haccp_receptions
    (restaurant_id, supplier_id, delivered_on, service_date, temperature_applicable, expiry_ok, packaging_ok, conforming)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, '2026-09-07', '2026-09-07', true, true, true, true) $$,
    (select id from _sup)),
  '23514', null, 'recepcao: temperature_applicable sem valor rejeitada');                         -- 41

-- Recepcao nao conforme + recusa valida.
create temp table _recnc as
  with x as (
    insert into public.haccp_receptions
      (restaurant_id, supplier_id, delivered_on, service_date, expiry_ok, packaging_ok, conforming)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from _sup), '2026-09-07', '2026-09-07', true, false, false)
    returning id
  ) select id from x;
select lives_ok(
  format($$ insert into public.haccp_rejections (restaurant_id, reception_id, cause)
            values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, 'temperatura_insuficiente') $$, (select id from _recnc)),
  'recepcao: recusa sobre recepcao nao conforme aceite');                                         -- 42

-- Recepcao conforme (para stats e para recusa invalida).
create temp table _recconf as
  with x as (
    insert into public.haccp_receptions
      (restaurant_id, supplier_id, delivered_on, service_date, expiry_ok, packaging_ok, conforming)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (select id from _sup), '2026-09-07', '2026-09-07', true, true, true)
    returning id
  ) select id from x;

select is((select rejections_count from public.haccp_supplier_stats where supplier_id = (select id from _sup)), 1::bigint,
  'recepcao: haccp_supplier_stats conta 1 recusa');                                               -- 43
select is((select receptions_count from public.haccp_supplier_stats where supplier_id = (select id from _sup)), 2::bigint,
  'recepcao: haccp_supplier_stats conta 2 recepcoes');                                            -- 44

-- Recusa sobre recepcao conforme rejeitada.
select throws_ok(
  format($$ insert into public.haccp_rejections (restaurant_id, reception_id, cause)
            values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, 'higiene_deficiente') $$, (select id from _recconf)),
  'P0001', 'haccp_recusa_exige_nao_conforme', 'recepcao: recusa sobre recepcao conforme rejeitada'); -- 45

-- delivered_on no futuro.
select throws_ok(
  format($$ insert into public.haccp_receptions
    (restaurant_id, supplier_id, delivered_on, service_date, expiry_ok, packaging_ok, conforming)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', %L, '2026-09-20', '2026-09-07', true, true, true) $$,
    (select id from _sup)),
  'P0001', 'haccp_data_entrega_invalida', 'recepcao: delivered_on no futuro rejeitado');          -- 46

-- Cross-tenant: recepcao em A com fornecedor de B.
select throws_ok($$
  insert into public.haccp_receptions
    (restaurant_id, supplier_id, delivered_on, service_date, expiry_ok, packaging_ok, conforming)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5b000000-0000-0000-0000-0000000000b1', '2026-09-07', '2026-09-07', true, true, true)
$$, 'P0001', 'haccp_fornecedor_invalido', 'recepcao: fornecedor de outro restaurante rejeitado'); -- 47

-- Consultor le stats e nao insere.
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select ok((select count(*) from public.haccp_supplier_stats where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') >= 1,
  'recepcao: consultor le haccp_supplier_stats');                                                 -- 48
select throws_ok($$
  insert into public.suppliers (restaurant_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Consultor Nao')
$$, '42501', null, 'recepcao: consultor nao insere fornecedor');                                  -- 49

-- storage_usage_bytes.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.haccp_storage_usage_bytes('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 0::bigint,
  'recepcao: usage 0 para restaurante sem objectos');                                             -- 50
select throws_ok($$ select public.haccp_storage_usage_bytes('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'P0001', 'nao_autorizado', 'recepcao: usage de nao membro devolve nao_autorizado');             -- 51

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO estado (12 + burst 3)   [C]
-- ════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';

-- 13:00: Almoco por verificar, Jantar futuro, P2c ausente do Almoco.
select is((select status from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000001-0000-0000-0000-000000000001' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'por_verificar', 'estado: Almoco/P1c por_verificar as 13:00');                                  -- 52
select is((select status from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000002-0000-0000-0000-000000000002' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'futuro', 'estado: Jantar/P1c futuro as 13:00');                                                -- 53
select is((select count(*)::int from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000001-0000-0000-0000-000000000001' and control_point_id = 'c9000002-0000-0000-0000-000000000002'),
  0, 'estado: P2c (so Jantar) nao aparece no Almoco');                                            -- 54

-- Regista 4,0 no Almoco/P1c -> conforme.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
create temp table _crec4 as select * from public.haccp_record_temperature(
  'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', 4.0);
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select is((select status from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000001-0000-0000-0000-000000000001' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'conforme', 'estado: Almoco/P1c conforme apos 4,0');                                            -- 55

-- 13:01: regista 7,0 -> desvio_sem_resposta.
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-07 13:01:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
create temp table _cdev as
  select id from public.haccp_record_temperature(
    'c9000001-0000-0000-0000-000000000001', 'cc000001-0000-0000-0000-000000000001', 7.0);
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select is((select status from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000001-0000-0000-0000-000000000001' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'desvio_sem_resposta', 'estado: Almoco/P1c desvio_sem_resposta apos 7,0');                      -- 56

-- NC sobre o registo -> desvio_aberto.
create temp table _cnc as
  with x as (
    insert into public.haccp_nonconformities
      (restaurant_id, source, reading_id, description, product_disposition, immediate_action, root_cause_action, executed_by_name)
    values ('99999999-9999-9999-9999-999999999999', 'temperature', (select id from _cdev),
      'Acima do limite', 'Descartado', 'Reposto', 'Tecnico', 'Chefe C')
    returning id
  ) select id from x;
select is((select status from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000001-0000-0000-0000-000000000001' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'desvio_aberto', 'estado: Almoco/P1c desvio_aberto com NC');                                    -- 57

-- Verificacao por outro utilizador -> desvio_resolvido.
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
insert into public.haccp_nc_verifications (restaurant_id, nonconformity_id, effective)
  values ('99999999-9999-9999-9999-999999999999', (select id from _cnc), true);
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select is((select status from public.haccp_turn_status('99999999-9999-9999-9999-999999999999')
           where turn_id = 'cc000001-0000-0000-0000-000000000001' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'desvio_resolvido', 'estado: Almoco/P1c desvio_resolvido com verificacao');                     -- 58

-- 06:30 do dia seguinte: Jantar sem registos em_falta.
reset role;
create or replace function public.haccp_now() returns timestamptz language sql stable as $$
  select '2026-09-08 06:30:00+01'::timestamptz $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select is((select status from public.haccp_expected_readings('99999999-9999-9999-9999-999999999999', '2026-09-07', '2026-09-07')
           where turn_id = 'cc000002-0000-0000-0000-000000000002' and control_point_id = 'c9000001-0000-0000-0000-000000000001'),
  'em_falta', 'estado: Jantar/P1c em_falta as 06:30 do dia seguinte');                            -- 59
select is((select status from public.haccp_expected_readings('99999999-9999-9999-9999-999999999999', '2026-09-07', '2026-09-07')
           where turn_id = 'cc000002-0000-0000-0000-000000000002' and control_point_id = 'c9000002-0000-0000-0000-000000000002'),
  'em_falta', 'estado: Jantar/P2c em_falta as 06:30 do dia seguinte');                            -- 60

-- Sumario do periodo.
select is(((public.haccp_period_summary('99999999-9999-9999-9999-999999999999', '2026-09-07', '2026-09-07'))->>'expected')::int, 3,
  'estado: period_summary expected = 3');                                                         -- 61
select is(((public.haccp_period_summary('99999999-9999-9999-9999-999999999999', '2026-09-07', '2026-09-07'))->>'recorded')::int, 1,
  'estado: period_summary recorded = 1');                                                         -- 62
select is(((public.haccp_period_summary('99999999-9999-9999-9999-999999999999', '2026-09-07', '2026-09-07'))->>'missing')::int, 2,
  'estado: period_summary missing = 2');                                                          -- 63

-- Anti-metrica: 3 registos em 90 s detectados, 2 nao.
select is((select readings from public.haccp_burst_check('99999999-9999-9999-9999-999999999999', '2026-09-04', '2026-09-04')
           where recorded_by = '88888888-8888-8888-8888-888888888888'), 3,
  'estado: burst detecta 3 registos em 90 s');                                                    -- 64
select is((select count(*)::int from public.haccp_burst_check('99999999-9999-9999-9999-999999999999', '2026-09-04', '2026-09-04')
           where recorded_by = '77777777-7777-7777-7777-777777777777'), 0,
  'estado: burst nao detecta 2 registos');                                                        -- 65
select throws_ok($$ select public.haccp_expected_readings('99999999-9999-9999-9999-999999999999', '2026-09-07', '2026-12-16') $$,
  'P0001', 'intervalo_demasiado_longo', 'estado: intervalo de 100 dias rejeitado');               -- 66

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO retencao / purga (10)
-- ════════════════════════════════════════════════════════════════════════════
-- Ler o default como postgres: o role activo ainda era o consultor/owner de C,
-- cuja RLS esconde o restaurante A e devolveria NULL.
reset role;
reset request.jwt.claims;
select is((select haccp_retention_months from public.restaurants where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 24,
  'retencao: default de 24 meses');                                                               -- 67

-- Cozinha nao altera retencao (RLS: update e owner/gestor).
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
update public.restaurants set haccp_retention_months = 36 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is((select haccp_retention_months from public.restaurants where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 24,
  'retencao: cozinha nao altera retencao (RLS bloqueia)');                                        -- 68

-- Cozinha (nao owner de A) nao purga.
select throws_ok($$ select public.haccp_purge_expired('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P0001', 'nao_autorizado', 'retencao: purga por nao owner devolve nao_autorizado');             -- 69

-- Owner de B purga: conta o que estava fora da retencao.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
create temp table _pg as select public.haccp_purge_expired('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') as r;
set local haccp.purge = 'off';
select is(((select r from _pg)->>'readings')::int, 1,        'retencao: purga apaga 1 reading fora da retencao');        -- 70
select is(((select r from _pg)->>'receptions')::int, 1,      'retencao: purga apaga 1 recepcao fora da retencao');       -- 71
select is(((select r from _pg)->>'rejections')::int, 1,      'retencao: purga apaga 1 recusa fora da retencao');         -- 72
select is(((select r from _pg)->>'nonconformities')::int, 1, 'retencao: purga apaga 1 nao conformidade fora da retencao'); -- 73
select is(((select r from _pg)->>'verifications')::int, 1,   'retencao: purga apaga 1 verificacao fora da retencao');    -- 74
select is(((select r from _pg)->>'photos')::int, 1,          'retencao: purga apaga 1 fotografia fora da retencao');     -- 75
select is((select count(*)::int from public.haccp_temperature_readings where restaurant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1,
  'retencao: reading dentro da retencao sobrevive');                                              -- 76

-- ════════════════════════════════════════════════════════════════════════════
-- GRUPO RLS activa (9)
-- ════════════════════════════════════════════════════════════════════════════
reset role;
select ok((select relrowsecurity from pg_class where relname = 'haccp_kind_defaults'      and relnamespace = 'public'::regnamespace), 'rls: haccp_kind_defaults');       -- 77
select ok((select relrowsecurity from pg_class where relname = 'haccp_control_points'     and relnamespace = 'public'::regnamespace), 'rls: haccp_control_points');      -- 78
select ok((select relrowsecurity from pg_class where relname = 'haccp_control_point_turns' and relnamespace = 'public'::regnamespace), 'rls: haccp_control_point_turns'); -- 79
select ok((select relrowsecurity from pg_class where relname = 'haccp_temperature_readings' and relnamespace = 'public'::regnamespace), 'rls: haccp_temperature_readings'); -- 80
select ok((select relrowsecurity from pg_class where relname = 'suppliers'                and relnamespace = 'public'::regnamespace), 'rls: suppliers');                 -- 81
select ok((select relrowsecurity from pg_class where relname = 'haccp_receptions'         and relnamespace = 'public'::regnamespace), 'rls: haccp_receptions');          -- 82
select ok((select relrowsecurity from pg_class where relname = 'haccp_rejections'         and relnamespace = 'public'::regnamespace), 'rls: haccp_rejections');          -- 83
select ok((select relrowsecurity from pg_class where relname = 'haccp_nonconformities'    and relnamespace = 'public'::regnamespace), 'rls: haccp_nonconformities');     -- 84
select ok((select relrowsecurity from pg_class where relname = 'haccp_nc_verifications'   and relnamespace = 'public'::regnamespace), 'rls: haccp_nc_verifications');    -- 85

select * from finish();
rollback;
