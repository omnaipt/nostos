-- STOA/Nostos — Testes RLS + coerência do Menu v2 (migration 0010).
-- Valida: isolamento multi-tenant de menu_item_variants e menu_imports, o
-- trigger que impede variante com item de outro restaurante, a coerência
-- price_type x price_cents, e que public_menu_by_slug devolve as variantes.
--
-- Correr com: supabase test db (pgTAP). Requer 0001_init + 0005_menu_digital + 0010.

begin;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test', '{"full_name":"Owner A"}'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test', '{"full_name":"Owner B"}');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.menu_categories (id, restaurant_id, label, active) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Peixe', true),
  ('c2111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pratos B', true);

-- Item A com preço por variantes (sem preço no item); Item B fixo noutro tenant.
insert into public.menu_items (id, restaurant_id, category_id, name, price_type, price_cents, active) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Bacalhau à casa', 'variants', null, true),
  ('22220002-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2111111-1111-1111-1111-111111111111', 'Polvo à lagareiro', 'fixed', 1800, true);

-- ── Cenário 1: Owner A no seu tenant ────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.menu_item_variants (restaurant_id, item_id, label, price_cents, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', '½ dose', 1550, 'dose')
$$, 'Owner A cria variante no seu item');

select throws_ok($$
  insert into public.menu_item_variants (restaurant_id, item_id, label, price_cents)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22220002-0000-0000-0000-000000000002', 'dose', 3100)
$$, 'variante_de_outro_restaurante', null,
   'Variante com item de outro restaurante é rejeitada pelo trigger');

select throws_ok($$
  insert into public.menu_items (restaurant_id, category_id, name, price_type, price_cents)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Sem preço mas fixo', 'fixed', null)
$$, '23514', null,
   'price_type=fixed sem price_cents é rejeitado');

select throws_ok($$
  insert into public.menu_items (restaurant_id, category_id, name, price_type, price_cents)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Mercado com preço', 'market', 500)
$$, '23514', null,
   'price_type=market com price_cents é rejeitado');

select lives_ok($$
  insert into public.menu_imports (restaurant_id, source_kind, status, unparsed_note)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo', 'review', '1 linha ilegível (tapada)')
$$, 'Owner A cria import no seu tenant');

select is(
  (select count(*)::int from public.menu_imports),
  1, 'Owner A vê o seu import');

-- ── Cenário 2: Owner B não escreve nem vê no tenant A ───────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok($$
  insert into public.menu_item_variants (restaurant_id, item_id, label, price_cents)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'intrusa', 999)
$$, '42501', null,
   'Owner B não insere variante no tenant A (with check)');

select is(
  (select count(*)::int from public.menu_imports),
  0, 'Owner B não vê imports do tenant A');

select throws_ok($$
  insert into public.menu_imports (restaurant_id, source_kind)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pdf')
$$, '42501', null,
   'Owner B não cria import no tenant A (with check)');

-- ── Cenário 3: RPC pública devolve variantes agregadas ──────────────────────
reset role;
select is(
  (select jsonb_array_length(variants)
     from public.public_menu_by_slug('tasca-a')
    where item_name = 'Bacalhau à casa'),
  1, 'RPC pública devolve 1 variante para o item por variantes');

select is(
  (select price_type
     from public.public_menu_by_slug('tasca-a')
    where item_name = 'Bacalhau à casa'),
  'variants', 'RPC pública devolve o price_type do item');

select * from finish();
rollback;
