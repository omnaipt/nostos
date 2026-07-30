-- STOA/Nostos — Testes de perfis + gestão de equipa (migration 0021).
-- Valida: CHECK do role, member_role por caller, RLS crítica (update de
-- restaurants → owner/gestor; escrita em restaurant_members → owner),
-- guarda do último owner, invite_member owner-only (pendente + grant imediato +
-- aceitação no 1º signup), e guarda de tenant do list_team_members.
--
-- Correr com: supabase test db (pgTAP). Requer 0001 + 0021.

begin;

select plan(17);

-- ── Seed (como superuser, antes de trocar de role) ───────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ownerA@stoa.test'),
  ('33333333-3333-3333-3333-333333333333', 'gestorA@stoa.test'),
  ('44444444-4444-4444-4444-444444444444', 'balcaoA@stoa.test'),
  ('22222222-2222-2222-2222-222222222222', 'ownerB@stoa.test'),
  ('55555555-5555-5555-5555-555555555555', 'invitee@stoa.test');

insert into public.restaurants (id, name, slug, owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tasca A', 'tasca-a', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tasca B', 'tasca-b', '22222222-2222-2222-2222-222222222222');

insert into public.restaurant_members (restaurant_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'gestor'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'balcao'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

-- ── member_role devolve o role do caller ─────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is(public.member_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'gestor',
  'member_role devolve gestor para o gestor');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.member_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'balcao',
  'member_role devolve balcao para o balcão');

-- balcão não é owner: invite_member rejeitado
select throws_ok($$ select public.invite_member('x@stoa.test', 'balcao') $$,
  'P0001', 'nao_autorizado', 'invite_member rejeita quem não é owner (balcão)');

-- RLS: balcão NÃO actualiza restaurants (update filtrado → 0 linhas, sem erro)
update public.restaurants set default_duration_min = 200
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select default_duration_min from public.restaurants where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  120, 'balcão não altera restaurants (RLS bloqueia o update)');

-- ── gestor: pode gerir restaurants, não pode gerir equipa ────────────────────
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
update public.restaurants set default_duration_min = 200
  where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select default_duration_min from public.restaurants where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  200, 'gestor altera restaurants (RLS permite owner/gestor)');

update public.restaurant_members set role = 'owner'
  where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and user_id = '44444444-4444-4444-4444-444444444444';
select is(
  (select role from public.restaurant_members
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id = '44444444-4444-4444-4444-444444444444'),
  'balcao', 'gestor não muda roles (RLS: escrita em members é owner-only)');

-- ── owner de A ───────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- CHECK do role
select throws_ok($$
  insert into public.restaurant_members (restaurant_id, user_id, role)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'xpto')
$$, '23514', null, 'CHECK do role rejeita valor fora da taxonomia');

-- owner muda o role do balcão
update public.restaurant_members set role = 'cozinha'
  where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and user_id = '44444444-4444-4444-4444-444444444444';
select is(
  (select role from public.restaurant_members
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id = '44444444-4444-4444-4444-444444444444'),
  'cozinha', 'owner muda roles');

-- invite a email JÁ registado → acesso imediato (sem convite pendente)
select is(public.invite_member('invitee@stoa.test', 'balcao'), null,
  'invite a email existente devolve null (grant imediato, sem pendente)');
select is(
  (select role from public.restaurant_members
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id = '55555555-5555-5555-5555-555555555555'),
  'balcao', 'invitee existente ganha membership imediata');

-- invite a email NOVO → convite pendente
select isnt(public.invite_member('newperson@stoa.test', 'gestor'), null,
  'invite a email novo devolve id de convite pendente');
select is(
  (select count(*)::int from public.member_invites
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and email_norm = 'newperson@stoa.test' and status = 'pending'),
  1, 'convite pendente registado');

-- list_team_members: owner de A vê a equipa toda
select ok(
  (select count(*) from public.list_team_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) >= 4,
  'list_team_members devolve a equipa ao membro do tenant');

-- ── Aceitação no primeiro signup (trigger handle_new_user) ───────────────────
reset role;
insert into auth.users (id, email)
  values ('99999999-9999-9999-9999-999999999999', 'newperson@stoa.test');
select is(
  (select role from public.restaurant_members
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id = '99999999-9999-9999-9999-999999999999'),
  'gestor', 'convite pendente vira membership no 1º signup');
select is(
  (select status from public.member_invites
    where restaurant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and email_norm = 'newperson@stoa.test'),
  'accepted', 'convite fica accepted após signup');

-- ── Guarda do último owner + tenant do list_team_members (owner B) ────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok($$
  delete from public.restaurant_members
   where restaurant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and user_id = '22222222-2222-2222-2222-222222222222'
$$, 'P0001', 'ultimo_owner_protegido', 'não se remove o último owner');

select throws_ok($$
  update public.restaurant_members set role = 'gestor'
   where restaurant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
     and user_id = '22222222-2222-2222-2222-222222222222'
$$, 'P0001', 'ultimo_owner_protegido', 'não se despromove o último owner');

select throws_ok($$
  select public.list_team_members('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
$$, 'P0001', 'acesso_negado', 'list_team_members bloqueia quem é de outro tenant');

select * from finish();
rollback;
