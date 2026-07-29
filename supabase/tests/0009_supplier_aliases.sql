-- STOA/Nostos — Testes dos aliases de fornecedor (migration 0018).
-- Valida: RLS multi-tenant, unicidade (restaurant+supplier+raw_name), upsert
-- substitui o ingrediente (reescolher corrige), e a guarda de tenant do
-- ingredient_id.
--
-- Correr com: supabase test db (pgTAP). Requer 0001 + 0006 + 0018.

begin;

select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.ingredients (id, restaurant_id, name, unit) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Coentros (molho)', 'un'),
  ('11110002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Salsa (molho)', 'un'),
  ('22220001-0000-0000-0000-000000000009', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Polvo B', 'kg');

-- ── Owner A aprende um alias ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'frutas silva', 'molho de coentros', '11110001-0000-0000-0000-000000000001')
$$, 'Owner A cria alias do fornecedor');

select throws_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'frutas silva', 'molho de coentros', '11110002-0000-0000-0000-000000000002')
$$, '23505', null,
   'Mesmo fornecedor+raw_name não duplica (unique)');

-- Upsert substitui: reescolher noutra fatura corrige o alias.
select lives_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'frutas silva', 'molho de coentros', '11110002-0000-0000-0000-000000000002')
  on conflict (restaurant_id, supplier_norm, raw_name_norm)
  do update set ingredient_id = excluded.ingredient_id
$$, 'Upsert reescolhe o ingrediente');

select is(
  (select ingredient_id from public.supplier_product_aliases
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and supplier_norm = 'frutas silva' and raw_name_norm = 'molho de coentros'),
  '11110002-0000-0000-0000-000000000002'::uuid,
  'Alias aponta para o ingrediente corrigido');

-- Guarda de tenant: alias para ingrediente de OUTRO restaurante é rejeitado.
select throws_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'frutas silva', 'polvo', '22220001-0000-0000-0000-000000000009')
$$, 'P0001', 'ingrediente_de_outro_restaurante',
   'Alias com ingrediente de outro tenant é rejeitado pela guarda');

-- ── Owner B não vê nem escreve no tenant A ──────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.supplier_product_aliases
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0, 'Owner B não vê aliases do tenant A');

-- NOTA (verificado contra prod 29-07): o trigger de guarda corre ANTES da
-- with-check da policy e sob o INVOKER — owner B não vê os ingredientes do
-- tenant A por RLS, o EXISTS falha, e o P0001 dispara primeiro que o 42501.
-- A escrita é rejeitada na mesma (defesa em profundidade); o código de erro
-- é o da guarda, não o da policy.
select throws_ok($$
  insert into public.supplier_product_aliases (restaurant_id, supplier_norm, raw_name_norm, ingredient_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'intruso', 'x', '11110001-0000-0000-0000-000000000001')
$$, 'P0001', 'ingrediente_de_outro_restaurante',
   'Owner B não escreve alias no tenant A (guarda sob RLS rejeita primeiro)');

select * from finish();
rollback;
