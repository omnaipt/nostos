-- STOA/Nostos — Testes do módulo take-away (migration 0022).
-- Valida: submissão válida com PREÇO SNAPSHOT DO SERVIDOR (o cliente nunca
-- envia preço), rejeições (sem email, market, by_order, takeaway desligado,
-- variante obrigatória/inválida), transições de estado válidas e inválidas,
-- cross-tenant (advance por membro de outro restaurante) e guarda de tenant
-- dos order_items.
--
-- Correr com: supabase test db (pgTAP). Requer 0001 + 0005 + 0010 + 0013 + 0022.

begin;

select plan(15);

-- ── Seed ─────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test');

insert into public.restaurants (id, name, slug, owner_id, takeaway_enabled) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'ta-a', '11111111-1111-1111-1111-111111111111', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'ta-b', '22222222-2222-2222-2222-222222222222', false);

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.menu_categories (id, restaurant_id, label) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pratos'),
  ('c2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pratos B');

insert into public.menu_items (id, restaurant_id, category_id, name, price_cents, price_type, by_order) values
  ('f1111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Bitoque', 1000, 'fixed', false),
  ('f1111111-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Arroz de marisco', null, 'variants', false),
  ('f1111111-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Peixe da lota', null, 'market', false),
  ('f1111111-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Cabrito', 800, 'fixed', true),
  ('f2222222-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2222222-2222-2222-2222-222222222222', 'Prato B', 900, 'fixed', false);

insert into public.menu_item_variants (id, restaurant_id, item_id, label, price_cents, unit, sort_order, is_default) values
  ('0aaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1111111-0000-0000-0000-000000000002', '2 pax', 3200, 'person', 0, true),
  ('0aaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f1111111-0000-0000-0000-000000000002', '1 pax', 1800, 'person', 1, false);

-- ── Submissão válida (fixed + variante); preço é snapshot do SERVIDOR ─────────
create temp table _ord as select public.submit_takeaway_order(
  'ta-a', 'Cliente', '912345678', 'cliente@x.pt', now() + interval '2 hours', 'sem picante',
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000001","variant_id":null,"qty":1},
    {"menu_item_id":"f1111111-0000-0000-0000-000000000002","variant_id":"0aaaaaaa-0000-0000-0000-000000000001","qty":1}]'::jsonb
) as id;

select isnt((select id from _ord), null, 'submissão válida devolve order_id');
select is((select count(*)::int from public.order_items where order_id = (select id from _ord)), 2,
  'encomenda tem 2 linhas');
select is((select total_cents from public.orders where id = (select id from _ord)), 4200,
  'total = snapshot do servidor (1000 fixed + 3200 variante), não do cliente');
select is(
  (select price_cents from public.order_items where order_id = (select id from _ord) and variant_id = '0aaaaaaa-0000-0000-0000-000000000001'),
  3200, 'linha da variante fixa o preço do servidor (3200)');
select is((select status from public.orders where id = (select id from _ord)), 'recebida',
  'encomenda entra em recebida');

-- ── Rejeições ────────────────────────────────────────────────────────────────
select throws_ok($$ select public.submit_takeaway_order('ta-a','Cliente','912345678','', now(), null,
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000001","variant_id":null,"qty":1}]'::jsonb) $$,
  'P0001', 'email_invalido', 'encomenda sem email é rejeitada');

select throws_ok($$ select public.submit_takeaway_order('ta-a','Cliente','912345678','c@x.pt', now(), null,
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000003","variant_id":null,"qty":1}]'::jsonb) $$,
  'P0001', 'item_nao_encomendavel', 'item market é rejeitado');

select throws_ok($$ select public.submit_takeaway_order('ta-a','Cliente','912345678','c@x.pt', now(), null,
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000004","variant_id":null,"qty":1}]'::jsonb) $$,
  'P0001', 'item_nao_encomendavel', 'item by_order é rejeitado');

select throws_ok($$ select public.submit_takeaway_order('ta-b','Cliente','912345678','c@x.pt', now(), null,
  '[{"menu_item_id":"f2222222-0000-0000-0000-000000000001","variant_id":null,"qty":1}]'::jsonb) $$,
  'P0001', 'takeaway_desligado', 'takeaway_enabled=false rejeita');

select throws_ok($$ select public.submit_takeaway_order('ta-a','Cliente','912345678','c@x.pt', now(), null,
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000002","variant_id":null,"qty":1}]'::jsonb) $$,
  'P0001', 'variante_obrigatoria', 'variante sem variant_id é rejeitada');

select throws_ok($$ select public.submit_takeaway_order('ta-a','Cliente','912345678','c@x.pt', now(), null,
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000002","variant_id":"0aaaaaaa-0000-0000-0000-000000000009","qty":1}]'::jsonb) $$,
  'P0001', 'variante_invalida', 'variant_id inexistente/de outro item é rejeitado');

-- ── Transições de estado (staff, invoker sob RLS) ────────────────────────────
create temp table _ord2 as select public.submit_takeaway_order(
  'ta-a', 'Cliente 2', '913333333', 'c2@x.pt', now() + interval '3 hours', null,
  '[{"menu_item_id":"f1111111-0000-0000-0000-000000000001","variant_id":null,"qty":2}]'::jsonb
) as id;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  format($$ select public.advance_order(%L, 'aceite') $$, (select id from _ord)),
  'owner avança recebida→aceite');

select throws_ok(
  format($$ select public.advance_order(%L, 'levantada') $$, (select id from _ord2)),
  'P0001', 'transicao_invalida', 'recebida→levantada é transição inválida');

-- Cross-tenant: owner B não avança encomenda de A (RLS esconde-a).
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select throws_ok(
  format($$ select public.advance_order(%L, 'aceite') $$, (select id from _ord)),
  'P0001', 'encomenda_invalida', 'membro de outro tenant não avança a encomenda');

-- Guarda de tenant dos order_items: coser linha com item de outro restaurante.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  format($$ insert into public.order_items (order_id, restaurant_id, menu_item_id, qty, price_cents, name)
            values (%L, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f2222222-0000-0000-0000-000000000001', 1, 900, 'x') $$,
    (select id from _ord)),
  'P0001', 'item_de_outro_restaurante', 'order_item com item de outro tenant é rejeitado pela guarda');

select * from finish();
rollback;
