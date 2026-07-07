-- STOA/Nostos — Testes RLS + RPC do Menu Digital (migration 0005).
-- Valida: isolamento multi-tenant de menu_categories/menu_items, o trigger que
-- impede cruzar a categoria de outro restaurante, e que public_menu_by_slug só
-- devolve categorias/itens ACTIVOS.
--
-- Correr com: supabase test db (pgTAP). Requer 0001_init + 0005_menu_digital.

begin;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test', '{"full_name":"Owner A"}'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test', '{"full_name":"Owner B"}');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- Setup (como postgres, ignora RLS): categorias e itens por tenant.
insert into public.menu_categories (id, restaurant_id, label, active) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Entradas', true),
  ('c1222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rascunho', false),
  ('c2111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pratos B', true);

insert into public.menu_items (restaurant_id, category_id, name, price_cents, active) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Pão e azeitonas', 350, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Fora de carta', 900, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1222222-2222-2222-2222-222222222222', 'Escondido', 500, true);

-- ── Cenário 1: Owner A no seu tenant ────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.menu_categories (restaurant_id, label)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Sobremesas')
$$, 'Owner A cria categoria no seu tenant');

select lives_ok($$
  insert into public.menu_items (restaurant_id, category_id, name, price_cents)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1111111-1111-1111-1111-111111111111', 'Sopa', 400)
$$, 'Owner A cria prato no seu tenant');

-- Guarda de coerência: categoria de OUTRO restaurante é rejeitada pelo trigger.
select throws_ok($$
  insert into public.menu_items (restaurant_id, category_id, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c2111111-1111-1111-1111-111111111111', 'Cruzado')
$$, 'categoria_de_outro_restaurante', null,
   'Item com categoria de outro restaurante é rejeitado');

select is(
  (select count(*)::int from public.menu_categories),
  3, 'Owner A vê só as suas 3 categorias (Entradas, Rascunho, Sobremesas)');

-- ── Cenário 2: Owner B não vê nem escreve no tenant A ───────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.menu_categories),
  1, 'Owner B só vê a sua categoria');
select is(
  (select count(*)::int from public.menu_items),
  0, 'Owner B não vê itens do tenant A');

select throws_ok($$
  insert into public.menu_categories (restaurant_id, label)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Intruso')
$$, '42501', null,
   'Owner B não insere categoria no tenant A (with check)');

-- ── Cenário 3: RPC pública só devolve activos ───────────────────────────────
reset role;
select is(
  (select count(*)::int from public.public_menu_by_slug('tasca-a') where item_id is not null),
  2, 'RPC pública: 2 itens activos de categoria activa (exclui inactivo e o de categoria inactiva)');
select is(
  (select count(distinct category_id)::int from public.public_menu_by_slug('tasca-a')),
  2, 'RPC pública: só categorias activas (exclui Rascunho)');

select * from finish();
rollback;
