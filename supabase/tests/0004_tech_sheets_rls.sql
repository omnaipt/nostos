-- Nostos — Testes RLS + guardas da Despensa/Ficha Técnica (migration 0006).
-- Valida: isolamento multi-tenant de ingredients/tech_sheets/tech_sheet_ingredients,
-- guarda prato-de-outro-restaurante, guarda ingrediente-de-outro-restaurante,
-- unique 1:1 ficha por prato.
--
-- Correr com: supabase test db (pgTAP). Requer 0001_init + 0005 + 0006.
-- Já validado ao vivo contra a BD de produção via bloco DO equivalente (07-Jul).

begin;

select plan(10);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA-0006@nostos.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB-0006@nostos.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a-0006', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b-0006', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.menu_categories (id, restaurant_id, label) values
  ('c0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pratos A'),
  ('c0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pratos B');

insert into public.menu_items (id, restaurant_id, category_id, name, price_cents) values
  ('d0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0000000-0000-0000-0000-00000000000a', 'Bacalhau', 1450),
  ('d0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c0000000-0000-0000-0000-00000000000b', 'Prato alheio', 1000);

insert into public.ingredients (id, restaurant_id, name, unit, cost_per_unit_cents) values
  ('e0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bacalhau demolhado', 'kg', 1250),
  ('e0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ingrediente alheio', 'g', 1.0);

-- ── Cenário 1: Owner A no seu tenant ────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.tech_sheets (id, restaurant_id, menu_item_id, servings, steps)
  values ('f0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'd0000000-0000-0000-0000-00000000000a', 1, array['Demolhar','Assar'])
$$, 'Owner A cria ficha para o seu prato');

select lives_ok($$
  insert into public.tech_sheet_ingredients (restaurant_id, tech_sheet_id, ingredient_id, name, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-00000000000a',
          'e0000000-0000-0000-0000-00000000000a', 'Bacalhau demolhado', 300, 'g')
$$, 'Owner A cria linha ligada à despensa');

select lives_ok($$
  insert into public.tech_sheet_ingredients (restaurant_id, tech_sheet_id, name, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-00000000000a', 'Linha livre', 2, 'un')
$$, 'Linha livre (sem ingrediente) é permitida');

select throws_ok($$
  insert into public.tech_sheets (restaurant_id, menu_item_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-00000000000b')
$$, 'prato_de_outro_restaurante', null,
   'Ficha para prato de outro restaurante é rejeitada');

select throws_ok($$
  insert into public.tech_sheet_ingredients (restaurant_id, tech_sheet_id, ingredient_id, name, qty, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'f0000000-0000-0000-0000-00000000000a',
          'e0000000-0000-0000-0000-00000000000b', 'Cruzado', 1, 'g')
$$, 'ingrediente_de_outro_restaurante', null,
   'Linha com ingrediente de outro restaurante é rejeitada');

select throws_ok($$
  insert into public.tech_sheets (restaurant_id, menu_item_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0000000-0000-0000-0000-00000000000a')
$$, 23505, null, 'Segunda ficha para o mesmo prato viola o unique 1:1');

-- ── Cenário 2: Owner B não vê nem escreve no tenant A ───────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.ingredients), 1, 'Owner B só vê o seu ingrediente');
select is((select count(*)::int from public.tech_sheets), 0, 'Owner B não vê fichas do tenant A');
select is((select count(*)::int from public.tech_sheet_ingredients), 0, 'Owner B não vê linhas do tenant A');

select throws_ok($$
  insert into public.ingredients (restaurant_id, name, unit)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Intruso', 'un')
$$, '42501', null, 'Owner B não insere na despensa do tenant A (with check)');

select * from finish();
rollback;
