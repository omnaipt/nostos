-- STOA/Nostos — Testes do custo médio ponderado a 6 meses (migration 0016).
-- Valida: 1ª compra = último custo; 2ª compra a preço diferente = média
-- ponderada pela quantidade; compra fora da janela de 6m ignorada; delete de
-- compra recalcula a média e reverte o saldo.
--
-- Correr com: supabase test db (pgTAP). Requer 0001_init + 0006 + 0011 + 0016.

begin;

select plan(8);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner');

insert into public.ingredients (id, restaurant_id, name, unit) values
  ('11110001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Polvo', 'kg');

-- ── 1ª compra: 10 kg a 10,00 €/kg → custo = último = 1000 c ─────────────────
insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, cost_per_unit_cents, source, note)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'purchase', 10, 'kg', 1000, 'invoice', 'Fatura Peixaria 1');

select is(
  (select cost_per_unit_cents from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  1000::numeric, 'Com uma só compra, média = último custo');

select is(
  (select stock_qty from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  10::numeric, 'Saldo sobe com a compra');

-- ── 2ª compra: 30 kg a 20,00 €/kg → média = (10×1000 + 30×2000)/40 = 1750 ───
insert into public.stock_movements (id, restaurant_id, ingredient_id, kind, qty, unit, cost_per_unit_cents, source, note)
values ('99990002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'purchase', 30, 'kg', 2000, 'invoice', 'Fatura Peixaria 2');

select is(
  (select cost_per_unit_cents from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  1750::numeric, 'Duas compras a preços diferentes → média ponderada pela quantidade');

-- ── Compra ANTIGA (7 meses): fora da janela, não mexe na média ──────────────
insert into public.stock_movements (restaurant_id, ingredient_id, kind, qty, unit, cost_per_unit_cents, source, note, created_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11110001-0000-0000-0000-000000000001', 'purchase', 100, 'kg', 9000, 'invoice', 'Fatura antiga', now() - interval '7 months');

select is(
  (select cost_per_unit_cents from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  1750::numeric, 'Compra fora da janela de 6 meses é ignorada na média');

select is(
  (select stock_qty from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  140::numeric, 'Saldo conta todas as compras (a janela é só do custo)');

-- ── Função exposta devolve o mesmo valor ────────────────────────────────────
select is(
  (select public.ingredient_avg_cost('11110001-0000-0000-0000-000000000001')),
  1750::numeric, 'ingredient_avg_cost devolve a média da janela');

-- ── Delete de compra recalcula a média e reverte o saldo ────────────────────
delete from public.stock_movements where id = '99990002-0000-0000-0000-000000000002';

select is(
  (select cost_per_unit_cents from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  1000::numeric, 'Delete da 2ª compra devolve a média à 1ª (recalculada, não dormente)');

select is(
  (select stock_qty from public.ingredients where id = '11110001-0000-0000-0000-000000000001'),
  110::numeric, 'Delete reverte o saldo');

select * from finish();
rollback;
