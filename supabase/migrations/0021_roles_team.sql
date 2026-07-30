-- 0021 — Perfis de utilizador (roles curados) + gestão de equipa.
-- Spec working/nostos-demo/Spec_Roles_Balcao_Takeaway.md §1 (David 29-07,
-- decisões confirmadas 30-07). Quatro roles CURADOS em vez de matriz de
-- permissões à la carte: owner, gestor, balcao, cozinha.
--
-- Filosofia (spec §1): o gating por ÁREA (nav/rotas) é frontend; a RLS só
-- endurece o CRÍTICO em v1 pragmático — quem gere a casa (update de
-- restaurants) e quem gere a equipa (escrita em restaurant_members). O resto
-- das tabelas mantém member-all. Honestidade registada: gating frontend não é
-- segurança criptográfica; para empregados do próprio restaurante é risco
-- aceitável no v1.

-- ── 1) Role: backfill + CHECK ────────────────────────────────────────────────
-- Hoje não há CHECK no role (0001: text default 'owner'), e há dados legados
-- fora da taxonomia nova (ex.: 'staff'). Backfill dos existentes → 'owner' antes
-- de trancar (decisão David: existentes viram owner).
update public.restaurant_members
   set role = 'owner'
 where role not in ('owner','gestor','balcao','cozinha');

alter table public.restaurant_members
  add constraint restaurant_members_role_check
  check (role in ('owner','gestor','balcao','cozinha'));

-- ── 2) Helpers de role ───────────────────────────────────────────────────────
-- member_role: INVOKER (spec) — devolve o role do CALLER no restaurante, para
-- policies e para o frontend (RPC). Lê restaurant_members sob a RLS do caller
-- (members_select deixa qualquer membro ver os do seu restaurante), por isso vê
-- sempre a sua própria linha. NULL se não for membro (o frontend degrada a
-- 'owner' defensivamente enquanto assim decidir).
create or replace function public.member_role(p_restaurant_id uuid)
returns text
language sql
security invoker
stable
set search_path = public
as $$
  select m.role
    from public.restaurant_members m
   where m.restaurant_id = p_restaurant_id
     and m.user_id = auth.uid();
$$;
grant execute on function public.member_role(uuid) to authenticated;

-- is_restaurant_owner: DEFINER — para as policies de escrita em
-- restaurant_members (e member_invites). Definer para NÃO recursar: a policy de
-- restaurant_members não pode chamar uma função que leia restaurant_members sob
-- RLS (recursão), por isso esta bypassa a RLS.
create or replace function public.is_restaurant_owner(target uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members m
     where m.restaurant_id = target
       and m.user_id = auth.uid()
       and m.role = 'owner'
  );
$$;

-- ── 3) Lista de equipa (o cliente não lê auth.users nem profiles de colegas) ──
-- list_team_members: DEFINER, guarda de pertença ao tenant. O Zé pediu isto
-- explicitamente (use-team): profiles é self-only e auth.users não é legível
-- pelo cliente, por isso a lista de equipa só mostra o próprio sem esta RPC.
create or replace function public.list_team_members(p_restaurant_id uuid)
returns table (user_id uuid, email text, full_name text, role text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_restaurant_member(p_restaurant_id) then
    raise exception 'acesso_negado';
  end if;
  return query
    select m.user_id, u.email::text, p.full_name, m.role
      from public.restaurant_members m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
     where m.restaurant_id = p_restaurant_id
     order by m.created_at;
end;
$$;
grant execute on function public.list_team_members(uuid) to authenticated;

-- ── 4) Convites (padrão B da spec: member_invites + aceitação no 1º login) ────
-- ESCOLHA DE DESENHO (documentada no PR): pg_net/http NÃO estão instalados
-- neste projecto, por isso um RPC de BD não consegue enviar o email do magic
-- link. Optámos pelo padrão mais simples que o David ofereceu (tabela de
-- convites + aceitação no primeiro login), SEM depender de infra de email na
-- BD. Consequência: um convite a um email JÁ registado dá acesso imediato; um
-- email NOVO fica pendente e é aceite automaticamente no primeiro signup desse
-- email (trigger handle_new_user, abaixo). O email de convite OUTBOUND
-- (magic link transaccional) fica como follow-up sinalizado: precisa de pg_net
-- + edge OU de mover invite_member para uma edge (mudança de contrato do Zé) —
-- decisão de infra do David.
create table if not exists public.member_invites (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email         text not null,
  email_norm    text not null check (length(email_norm) between 3 and 200),
  role          text not null check (role in ('owner','gestor','balcao','cozinha')),
  invited_by    uuid references auth.users(id) on delete set null,
  status        text not null default 'pending'
    check (status in ('pending','accepted','revoked')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz
);
-- No máximo um convite PENDENTE por email por restaurante.
create unique index if not exists member_invites_pending_key
  on public.member_invites(restaurant_id, email_norm)
  where status = 'pending';
create index if not exists member_invites_email_idx
  on public.member_invites(email_norm) where status = 'pending';

alter table public.member_invites enable row level security;
create policy member_invites_owner_all on public.member_invites
  for all using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));
create policy member_invites_member_select on public.member_invites
  for select using (public.is_restaurant_member(restaurant_id));

-- invite_member: DEFINER, owner-only. Assinatura CONGELADA (p_email, p_role) —
-- sem p_restaurant_id (o Zé chama assim). Resolve o restaurante como "o único
-- em que o caller é owner"; se for owner de vários, erro pedindo desambiguação
-- (v1 assume um restaurante por owner; multi-restaurante = follow-up).
create or replace function public.invite_member(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_norm text := lower(trim(coalesce(p_email, '')));
  v_rid uuid;
  v_owner_count int;
  v_uid uuid;
  v_invite_id uuid;
begin
  if p_role not in ('owner','gestor','balcao','cozinha') then
    raise exception 'role_invalido';
  end if;
  -- Validação de email plausível (mesma exigência dos forms públicos).
  if v_email_norm = '' or v_email_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;

  -- Restaurante do caller: o único onde é owner.
  select count(*) into v_owner_count
    from public.restaurant_members m
   where m.user_id = auth.uid() and m.role = 'owner';
  if v_owner_count = 0 then
    raise exception 'nao_autorizado';
  elsif v_owner_count > 1 then
    raise exception 'restaurante_ambiguo';
  end if;
  select m.restaurant_id into v_rid
    from public.restaurant_members m
   where m.user_id = auth.uid() and m.role = 'owner'
   limit 1;

  -- Já tem conta? Acesso imediato (não precisa de convite pendente).
  select u.id into v_uid from auth.users u where lower(u.email) = v_email_norm;
  if v_uid is not null then
    insert into public.restaurant_members (restaurant_id, user_id, role)
    values (v_rid, v_uid, p_role)
    on conflict (restaurant_id, user_id) do update set role = excluded.role;
    -- fecha qualquer pendente residual desse email nesse restaurante
    update public.member_invites
       set status = 'accepted', accepted_at = now()
     where restaurant_id = v_rid and email_norm = v_email_norm and status = 'pending';
    return null;
  end if;

  -- Email novo: convite pendente (aceite no 1º signup).
  insert into public.member_invites (restaurant_id, email, email_norm, role, invited_by, status)
  values (v_rid, trim(p_email), v_email_norm, p_role, auth.uid(), 'pending')
  on conflict (restaurant_id, email_norm) where status = 'pending'
  do update set role = excluded.role, invited_by = excluded.invited_by, email = excluded.email
  returning id into v_invite_id;
  return v_invite_id;
end;
$$;
grant execute on function public.invite_member(text, text) to authenticated;

-- Aceitação no primeiro login: estende handle_new_user (0001) para converter
-- convites pendentes do email em membership. Mantém a criação do profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  -- Convites pendentes para este email → membership.
  insert into public.restaurant_members (restaurant_id, user_id, role)
  select mi.restaurant_id, new.id, mi.role
    from public.member_invites mi
   where mi.email_norm = lower(new.email) and mi.status = 'pending'
  on conflict (restaurant_id, user_id) do nothing;

  update public.member_invites
     set status = 'accepted', accepted_at = now()
   where email_norm = lower(new.email) and status = 'pending';

  return new;
end;
$$;

-- ── 5) RLS crítica (spec §1) ─────────────────────────────────────────────────
-- update de restaurants → owner/gestor (identidade/definições/takeaway). O
-- resto das tabelas mantém member-all. member_role (invoker) resolve o role do
-- caller; sem recursão porque restaurants ≠ restaurant_members.
drop policy if exists restaurants_member_update on public.restaurants;
create policy restaurants_manage_update on public.restaurants
  for update using (public.member_role(id) in ('owner','gestor'))
  with check (public.member_role(id) in ('owner','gestor'));

-- Escrita em restaurant_members → owner. insert mantém também o bootstrap do
-- criador (restaurants.owner_id) senão o 1º membro nunca entraria (não há owner
-- ainda no momento do onboarding). update/delete são owner-only (é aqui que as
-- escritas do Zé — mudar role / remover — passam a funcionar; hoje falham por
-- não existir policy).
drop policy if exists members_insert on public.restaurant_members;
create policy members_insert on public.restaurant_members
  for insert with check (
    public.is_restaurant_owner(restaurant_id)
    or exists (
      select 1 from public.restaurants r
       where r.id = restaurant_id and r.owner_id = auth.uid()
    )
  );
create policy members_update on public.restaurant_members
  for update using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));
create policy members_delete on public.restaurant_members
  for delete using (public.is_restaurant_owner(restaurant_id));

-- Guarda "≥1 owner sempre": não deixar remover nem despromover o último owner.
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and (
      select count(*) from public.restaurant_members
       where restaurant_id = old.restaurant_id and role = 'owner'
    ) <= 1 then
      raise exception 'ultimo_owner_protegido';
    end if;
    return old;
  else -- UPDATE
    if old.role = 'owner' and new.role <> 'owner' and (
      select count(*) from public.restaurant_members
       where restaurant_id = old.restaurant_id and role = 'owner'
    ) <= 1 then
      raise exception 'ultimo_owner_protegido';
    end if;
    return new;
  end if;
end;
$$;

create trigger restaurant_members_protect_last_owner
  before update or delete on public.restaurant_members
  for each row execute function public.protect_last_owner();
