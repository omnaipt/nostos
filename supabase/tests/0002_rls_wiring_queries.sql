-- STOA · Testes RLS das queries do wiring (#4)
-- Valida as policies sobre as escritas/leituras que o wiring introduz:
--   - upsert de customer por telefone (C6) é tenant-scoped;
--   - insert/select de reservas só dentro do tenant do membro;
--   - um outsider NÃO consegue inserir reserva no tenant alheio (with check);
--   - CRUD de tables/turns só pelo membro.
--
-- Correr com: supabase test db   (usa pgTAP). Requer 0001_init.sql aplicada.
-- Não toca em is_restaurant_member nem nas policies existentes.

begin;

select plan(12);

-- ── Setup: dois tenants, cada um com o seu owner ──────────────────────────
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test', '{"full_name":"Owner A"}'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test', '{"full_name":"Owner B"}');

insert into public.restaurants (id, name, slug, owner_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- Turno + mesa no tenant A (para reservas).
insert into public.turns (id, restaurant_id, label, service, start_time, weekdays)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Jantar', 'jantar', '20:00', array[1,2,3,4,5,6,7]);
insert into public.tables (id, restaurant_id, label, seats)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mesa 1', 4);

-- ── Cenário 1: Owner A actua no SEU tenant ────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- C6: criar customer no próprio tenant PASSA.
select lives_ok($$
  insert into public.customers (restaurant_id, name, phone)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente A', '910000001')
$$, 'Owner A cria customer no seu tenant');

-- C6: o índice único por (restaurant_id, phone) bloqueia telefone duplicado
-- no mesmo tenant (suporta a estratégia find-then-insert do upsert).
select throws_ok($$
  insert into public.customers (restaurant_id, name, phone)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cliente A bis', '910000001')
$$, '23505', null,
   'Telefone duplicado no mesmo tenant COLIDE (unique parcial)');

-- C4: inserir reserva com service_date + reserved_at explícitos PASSA.
select lives_ok($$
  insert into public.reservations
    (restaurant_id, turn_id, table_id, customer_name, party_size, reserved_at, service_date, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          'dddddddd-dddd-dddd-dddd-dddddddddddd',
          'Cliente A', 2, '2026-06-20T20:00:00Z', date '2026-06-20', 'confirmada')
$$, 'Owner A insere reserva no seu tenant (service_date explícito)');

-- C4: reserva POR ATRIBUIR (table_id null) PASSA.
select lives_ok($$
  insert into public.reservations
    (restaurant_id, turn_id, table_id, customer_name, party_size, reserved_at, service_date, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null,
          'Por Atribuir', 4, '2026-06-20T20:30:00Z', date '2026-06-20', 'confirmada')
$$, 'Owner A insere reserva por atribuir (table_id null)');

-- C1/C2: CRUD de tables/turns no próprio tenant PASSA.
select lives_ok($$
  insert into public.tables (restaurant_id, label, seats)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mesa 2', 2)
$$, 'Owner A cria mesa no seu tenant');
select lives_ok($$
  update public.turns set active = false
  where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
$$, 'Owner A desactiva turno do seu tenant');
-- repõe o turno activo para os cenários seguintes
update public.turns set active = true where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

select is(
  (select count(*)::int from public.reservations),
  2, 'Owner A vê as suas 2 reservas');

-- ── Cenário 2: Owner B (outro tenant) NÃO toca no tenant A ─────────────────
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- Não vê dados do tenant A.
select is(
  (select count(*)::int from public.reservations),
  0, 'Owner B NÃO vê reservas do tenant A');
select is(
  (select count(*)::int from public.customers),
  0, 'Owner B NÃO vê customers do tenant A');

-- C4: tentar inserir reserva no tenant A (with check) FALHA por RLS (42501).
select throws_ok($$
  insert into public.reservations
    (restaurant_id, turn_id, table_id, customer_name, party_size, reserved_at, service_date, status)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', null,
          'Intruso', 2, '2026-06-20T21:00:00Z', date '2026-06-20', 'confirmada')
$$, '42501', null,
   'Owner B NÃO consegue inserir reserva no tenant A (RLS with check)');

-- C6: tentar criar customer no tenant A FALHA por RLS.
select throws_ok($$
  insert into public.customers (restaurant_id, name, phone)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Intruso', '910000009')
$$, '42501', null,
   'Owner B NÃO consegue criar customer no tenant A (RLS with check)');

-- C1: tentar criar mesa no tenant A FALHA por RLS.
select throws_ok($$
  insert into public.tables (restaurant_id, label, seats)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mesa Intrusa', 2)
$$, '42501', null,
   'Owner B NÃO consegue criar mesa no tenant A (RLS with check)');

select * from finish();

rollback;
