-- STOA/Nostos — Testes da publicação do import de menu (migration 0019).
-- Valida: publicação transaccional (categorias novas + reutilizadas, itens,
-- variants com default na 1ª, alergénios sugeridos filtrados e por confirmar),
-- rollback total quando uma linha é inválida (aceitação 5), estado do import,
-- e isolamento multi-tenant.
--
-- Correr com: supabase test db (pgTAP). Requer 0001 + 0005 + 0010 + 0019.

begin;

select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- Categoria pré-existente para o caso "reimportar acrescenta".
insert into public.menu_categories (id, restaurant_id, label, active, sort_order) values
  ('c1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Peixe', true, 0);

insert into public.menu_imports (id, restaurant_id, source_kind, status) values
  ('99990001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo', 'review'),
  ('99990002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'photo', 'review');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- ── Publicação feliz: categoria reutilizada + nova, item variants + market ──
create temp table pub1 on commit drop as
select public.publish_menu_import(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '99990001-0000-0000-0000-000000000001',
  '{"categories":[
     {"name":"peixe","items":[
       {"name":"Robalo grelhado","price_type":"per_kg","price_cents":4500,
        "allergens_suggested":["peixe","invencao_nao_ue"],"needs_review":false},
       {"name":"Arroz de marisco","price_type":"variants","price_cents":null,
        "variants":[{"label":"2 pax","price_cents":3400,"serves":2},
                    {"label":"1 pax","price_cents":1800,"serves":1}]}
     ]},
     {"name":"Sugestões","items":[
       {"name":"Peixe do dia","price_type":"market","price_cents":999,
        "note":"preço do dia no quadro"}
     ]}
   ]}'::jsonb) as r;

select is((select r->>'categories_reused' from pub1), '1', 'Categoria "peixe" reutilizada (case-insensitive)');
select is((select r->>'categories_created' from pub1), '1', 'Categoria nova criada');
select is((select r->>'items_created' from pub1), '3', '3 itens publicados');
select is((select r->>'variants_created' from pub1), '2', '2 variantes publicadas');

select is(
  (select allergens from public.menu_items where name = 'Robalo grelhado'),
  array['peixe']::text[], 'Alergénio sugerido fora da lista UE é descartado');

select is(
  (select allergens_confirmed from public.menu_items where name = 'Robalo grelhado'),
  false, 'Alergénios ficam POR CONFIRMAR (sugestão, nunca decisão)');

select is(
  (select price_cents from public.menu_items where name = 'Peixe do dia'),
  null, 'market normaliza price_cents a null (coerência 0010)');

select is(
  (select is_default from public.menu_item_variants where label = '2 pax'),
  true, '1ª variante marcada como dose principal (default)');

select is(
  (select status from public.menu_imports where id = '99990001-0000-0000-0000-000000000001'),
  'published', 'Import marcado como published');

-- ── Aceitação 5: falha a meio = NADA publicado, draft intacto ───────────────
select throws_ok($$
  select public.publish_menu_import(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '99990002-0000-0000-0000-000000000002',
    '{"categories":[
       {"name":"Carnes","items":[
         {"name":"Bife OK","price_type":"fixed","price_cents":1500},
         {"name":"Bife sem preço","price_type":"fixed","price_cents":null}
       ]}
     ]}'::jsonb)
$$, 'P0001', 'preco_em_falta: Bife sem preço',
   'Linha inválida aborta com erro legível');

select is(
  (select count(*)::int from public.menu_items where name = 'Bife OK'),
  0, 'Rollback total: nem o item válido anterior ficou publicado');

-- ── Multi-tenant: owner B não publica import do tenant A ────────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok($$
  select public.publish_menu_import(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '99990002-0000-0000-0000-000000000002',
    '{"categories":[]}'::jsonb)
$$, 'P0001', 'import_invalido',
   'Sob RLS, import de outro tenant é invisível → rejeitado');

select * from finish();
rollback;
