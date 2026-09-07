-- 0029 — HACCP v1 (backend). Gate 1 da spec de produto da Sofia (02-08-2026),
-- épicos A, B, C, E e as cinco decisões de arquitectura do ponto 7. Sem UI.
--
-- Filosofia deste modulo:
--   1. Multi-tenant por RLS, como todo o repo. Leitura externa (consultor) via
--      role novo em restaurant_members que NAO ve dados de negocio (so HACCP).
--   2. Registos probatorios imutaveis: nunca se editam nem apagam. Correccao e
--      um registo de rectificacao encadeado, com o original preservado.
--   3. Timestamps de servidor sempre. O cliente nunca carimba a hora.
--   4. Ancoragem ao turno: a janela de registo abre 60 min antes do start_time
--      do turno e fecha no start_time do turno seguinte do mesmo dia (ou as
--      06:00 do dia seguinte se for o ultimo). Corte do dia de servico as 06:00.
--   5. Retencao configuravel (default 24 meses) com justificacao legal escrita
--      dentro do sistema, e quota de fotografias por tenant.
--
-- Relogio injectavel: public.haccp_now() devolve now() em producao e e o unico
-- ponto onde os testes fazem create or replace dentro da transaccao para fixar
-- o tempo. Modo semente (current_setting('haccp.seed')='on', so atingivel por
-- postgres/service role) respeita carimbos fornecidos e salta a validacao de
-- janela; serve fixtures e dados de demonstracao com historico. Modo purga
-- (current_setting('haccp.purge')='on') e o unico que contorna a imutabilidade.
--
-- Ordem do ficheiro: helpers/roles -> colunas de retencao -> relogio ->
-- pontos de controlo -> funcoes de janela -> registos de temperatura ->
-- fornecedores/recepcoes/recusas -> nao conformidades/verificacoes -> vistas ->
-- storage -> purga -> funcoes de estado -> grants. As tabelas de recepcao (item
-- 6) vem antes das nao conformidades (item 5) porque a NC referencia recepcoes.

-- ============================================================================
-- ITEM 1 — Role consultor e funcoes de pertenca
-- ============================================================================

-- restaurant_members.role e member_invites.role aceitam 'consultor'. Os CHECKs
-- existentes (0021) sao substituidos por versoes que incluem o novo valor; os
-- valores anteriores continuam validos.
alter table public.restaurant_members
  drop constraint if exists restaurant_members_role_check;
alter table public.restaurant_members
  add constraint restaurant_members_role_check
  check (role in ('owner','gestor','balcao','cozinha','consultor'));

alter table public.member_invites
  drop constraint if exists member_invites_role_check;
alter table public.member_invites
  add constraint member_invites_role_check
  check (role in ('owner','gestor','balcao','cozinha','consultor'));

-- is_restaurant_member passa a EXCLUIR o consultor: mesma assinatura, definer e
-- grants. Consequencia desejada: todas as policies *_member_all existentes
-- deixam de abrir dados de negocio ao consultor automaticamente.
create or replace function public.is_restaurant_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = target
      and m.user_id = auth.uid()
      and m.role <> 'consultor'
  );
$$;
comment on function public.is_restaurant_member(uuid) is
  'Verdadeiro se o caller e membro OPERACIONAL do restaurante (exclui consultor). Base das policies *_member_all. 0029.';

-- is_restaurant_reader: verdadeiro para QUALQUER role, incluindo consultor.
-- Mesma forma de is_restaurant_member (definer, stable). Base das policies de
-- LEITURA do HACCP e das superficies que o consultor pode ver.
create or replace function public.is_restaurant_reader(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = target
      and m.user_id = auth.uid()
  );
$$;
comment on function public.is_restaurant_reader(uuid) is
  'Verdadeiro se o caller e membro do restaurante em qualquer role, incluindo consultor. Guarda de LEITURA do HACCP. 0029.';

-- invite_member aceita 'consultor' (validacao alargada; resto intocado face a 0021).
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
  if p_role not in ('owner','gestor','balcao','cozinha','consultor') then
    raise exception 'role_invalido';
  end if;
  if v_email_norm = '' or v_email_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;

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

  select u.id into v_uid from auth.users u where lower(u.email) = v_email_norm;
  if v_uid is not null then
    insert into public.restaurant_members (restaurant_id, user_id, role)
    values (v_rid, v_uid, p_role)
    on conflict (restaurant_id, user_id) do update set role = excluded.role;
    update public.member_invites
       set status = 'accepted', accepted_at = now()
     where restaurant_id = v_rid and email_norm = v_email_norm and status = 'pending';
    return null;
  end if;

  insert into public.member_invites (restaurant_id, email, email_norm, role, invited_by, status)
  values (v_rid, trim(p_email), v_email_norm, p_role, auth.uid(), 'pending')
  on conflict (restaurant_id, email_norm) where status = 'pending'
  do update set role = excluded.role, invited_by = excluded.invited_by, email = excluded.email
  returning id into v_invite_id;
  return v_invite_id;
end;
$$;

-- Policies que passam a usar is_restaurant_reader para o consultor ler o mesmo
-- que um membro ve destas superficies (restaurantes, equipa, turnos). O resto
-- das tabelas de negocio mantem is_restaurant_member e fica fechado ao consultor.
drop policy if exists restaurants_member_select on public.restaurants;
create policy restaurants_member_select on public.restaurants
  for select using (public.is_restaurant_reader(id) or owner_id = auth.uid());

drop policy if exists members_select on public.restaurant_members;
create policy members_select on public.restaurant_members
  for select using (public.is_restaurant_reader(restaurant_id));

-- turns ja tem turns_member_all (FOR ALL, is_restaurant_member). Uma policy
-- PERMISSIVA de SELECT com is_restaurant_reader abre a leitura ao consultor sem
-- lhe dar escrita (as policies permissivas somam-se por OR).
drop policy if exists turns_reader_select on public.turns;
create policy turns_reader_select on public.turns
  for select using (public.is_restaurant_reader(restaurant_id));

-- ============================================================================
-- ITEM 2 (colunas) — Retencao e quota no tenant
-- ============================================================================
-- Decisoes 7.4 e 7.5. Editaveis so por owner/gestor (restaurants_manage_update,
-- 0021). A funcao de purga esta no fim do ficheiro (depende das tabelas todas).
alter table public.restaurants
  add column if not exists haccp_retention_months int not null default 24
    check (haccp_retention_months between 12 and 120),
  add column if not exists haccp_retention_note text not null default
    'Os registos HACCP são conservados por 24 meses. O Reg. (CE) 852/2004, art. 5.º n.º 4 c), exige conservação por um período adequado sem o quantificar; dois anos cobrem o ciclo típico de fiscalização da ASAE e a garantia de rastreabilidade do Reg. (CE) 178/2002, mantendo a minimização de dados. Alterável pelo responsável do estabelecimento nas Definições.',
  add column if not exists haccp_photo_quota_mb int not null default 500
    check (haccp_photo_quota_mb between 50 and 5000);

comment on column public.restaurants.haccp_retention_months is
  'Meses de conservacao dos registos HACCP (default 24). Base da purga. Decisao 7.4. 0029.';
comment on column public.restaurants.haccp_retention_note is
  'Justificacao legal da retencao, mostrada nas Definicoes e no dossie. Editavel pelo responsavel. Decisao 7.4. 0029.';
comment on column public.restaurants.haccp_photo_quota_mb is
  'Quota de fotografias por tenant em MB (default 500), verificada na policy de INSERT do storage. Decisao 7.5. 0029.';

-- ============================================================================
-- RELOGIO INJECTAVEL
-- ============================================================================
-- Em producao devolve now(). Nos testes e substituida por create or replace por
-- uma constante dentro da transaccao. E chamada por funcoes INVOKER (janela,
-- vistas, estado) e pelos gatilhos de carimbo, por isso mantem o EXECUTE por
-- defeito a PUBLIC (padrao Postgres): sem grant explicito a authenticated, mas
-- executavel por quem corre essas funcoes. Nao e um segredo (devolve a hora).
create or replace function public.haccp_now()
returns timestamptz
language sql
stable
as $$ select now() $$;
comment on function public.haccp_now() is
  'Relogio do modulo HACCP. Producao: now(). Testes: substituida por constante na transaccao. 0029.';

-- ============================================================================
-- ITEM 3 — Pontos de controlo e defaults por tipo
-- ============================================================================

-- Tabela global de defaults por tipo de ponto. Leitura para authenticated, sem
-- escrita pelo cliente. Fonte AHRESP para o gerente perceber de onde vem o numero.
create table if not exists public.haccp_kind_defaults (
  kind         text primary key,
  label        text not null,
  min_c        numeric(5,1),
  max_c        numeric(5,1),
  source_label text not null,
  source_url   text not null,
  note         text
);
comment on table public.haccp_kind_defaults is
  'Defaults globais de limites por tipo de ponto de controlo, com fonte legal. Item A1. 0029.';

alter table public.haccp_kind_defaults enable row level security;
drop policy if exists haccp_kind_defaults_read on public.haccp_kind_defaults;
create policy haccp_kind_defaults_read on public.haccp_kind_defaults
  for select to authenticated using (true);

insert into public.haccp_kind_defaults (kind, label, min_c, max_c, source_label, source_url, note) values
  ('frio_positivo', 'Frio positivo (frigorífico)', 0, 5,
     'AHRESP, Código de Boas Práticas de Higiene (2018)',
     'https://ahresp.com/app/uploads/2018/10/Codigo-CBPH_AHRESP.pdf', null),
  ('congelacao', 'Congelação', null, -18,
     'AHRESP, Código de Boas Práticas de Higiene (2018)',
     'https://ahresp.com/app/uploads/2018/10/Codigo-CBPH_AHRESP.pdf', null),
  ('quente', 'Manutenção a quente', 63, null,
     'AHRESP, Código de Boas Práticas de Higiene (2018)',
     'https://ahresp.com/app/uploads/2018/10/Codigo-CBPH_AHRESP.pdf', null),
  ('expositor', 'Expositor refrigerado', 0, 5,
     'AHRESP, Código de Boas Práticas de Higiene (2018)',
     'https://ahresp.com/app/uploads/2018/10/Codigo-CBPH_AHRESP.pdf',
     'Expositores quentes configuram-se como Manutenção a quente.')
on conflict (kind) do nothing;

-- Pontos de controlo por restaurante. deactivated_at e preenchido por gatilho
-- (usado pelas funcoes de estado do item 7 para deixar de contar o ponto a
-- partir do dia em que foi desactivado). Desactivar e active=false, nunca delete.
create table if not exists public.haccp_control_points (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null check (length(trim(name)) between 1 and 80),
  kind           text not null references public.haccp_kind_defaults(kind),
  min_c          numeric(5,1),
  max_c          numeric(5,1),
  all_turns      boolean not null default true,
  active         boolean not null default true,
  sort_order     int not null default 0,
  created_by     uuid references auth.users(id) on delete set null,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint haccp_cp_limits_present check (min_c is not null or max_c is not null),
  constraint haccp_cp_limits_order   check (min_c is null or max_c is null or min_c < max_c)
);
comment on table public.haccp_control_points is
  'Equipamentos de frio/quente a verificar. Limites por defeito herdados do tipo. Item A1. 0029.';

create unique index if not exists haccp_control_points_name_uidx
  on public.haccp_control_points (restaurant_id, lower(name)) where active;
create index if not exists haccp_control_points_restaurant_idx
  on public.haccp_control_points (restaurant_id);

-- Aplica os defaults do tipo quando o INSERT nao traz limites nenhuns.
create or replace function public.haccp_apply_kind_defaults()
returns trigger language plpgsql set search_path = public as $$
declare v_min numeric(5,1); v_max numeric(5,1);
begin
  if new.min_c is null and new.max_c is null then
    select d.min_c, d.max_c into v_min, v_max
      from public.haccp_kind_defaults d where d.kind = new.kind;
    new.min_c := v_min;
    new.max_c := v_max;
  end if;
  return new;
end $$;
comment on function public.haccp_apply_kind_defaults() is
  'BEFORE INSERT em haccp_control_points: herda min_c/max_c do tipo quando nenhum foi indicado. 0029.';

create trigger haccp_control_points_apply_defaults
  before insert on public.haccp_control_points
  for each row execute function public.haccp_apply_kind_defaults();

-- updated_at + carimbo de deactivated_at quando active passa a falso.
create or replace function public.haccp_control_points_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := public.haccp_now();
  if new.active = false and old.active = true then
    new.deactivated_at := public.haccp_now();
  elsif new.active = true and old.active = false then
    new.deactivated_at := null;
  end if;
  return new;
end $$;
comment on function public.haccp_control_points_touch() is
  'BEFORE UPDATE em haccp_control_points: updated_at e deactivated_at (carimba quando active passa a falso). 0029.';

create trigger haccp_control_points_touch
  before update on public.haccp_control_points
  for each row execute function public.haccp_control_points_touch();

-- Impede apagar pontos (mantem o historico). Excepcoes: purga do owner e cascade
-- de restaurante (quando o restaurante ja nao existe, deixa cair os filhos).
create or replace function public.haccp_control_point_no_delete()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('haccp.purge', true) = 'on' then
    return old;
  end if;
  if not exists (select 1 from public.restaurants r where r.id = old.restaurant_id) then
    return old;
  end if;
  raise exception 'haccp_ponto_nao_apagavel';
end $$;
comment on function public.haccp_control_point_no_delete() is
  'BEFORE DELETE em haccp_control_points: bloqueia apagar (excepto purga ou cascade de restaurante). Desactivar e active=false. 0029.';

create trigger haccp_control_points_no_delete
  before delete on public.haccp_control_points
  for each row execute function public.haccp_control_point_no_delete();

-- Associacao ponto <-> turno (quando o ponto nao e all_turns).
create table if not exists public.haccp_control_point_turns (
  control_point_id uuid not null references public.haccp_control_points(id) on delete cascade,
  turn_id          uuid not null references public.turns(id) on delete cascade,
  restaurant_id    uuid not null,
  primary key (control_point_id, turn_id)
);
comment on table public.haccp_control_point_turns is
  'Turnos associados a um ponto de controlo que nao e all_turns. Item A1. 0029.';

-- Valida que o turno pertence ao mesmo restaurante do ponto.
create or replace function public.haccp_cpt_same_restaurant()
returns trigger language plpgsql set search_path = public as $$
declare v_cp_rid uuid; v_turn_rid uuid;
begin
  select restaurant_id into v_cp_rid from public.haccp_control_points where id = new.control_point_id;
  select restaurant_id into v_turn_rid from public.turns where id = new.turn_id;
  if v_cp_rid is null or v_turn_rid is null or v_cp_rid <> v_turn_rid or v_cp_rid <> new.restaurant_id then
    raise exception 'turno_de_outro_restaurante';
  end if;
  return new;
end $$;
comment on function public.haccp_cpt_same_restaurant() is
  'BEFORE INSERT/UPDATE em haccp_control_point_turns: turno e ponto tem de ser do mesmo restaurante. 0029.';

create trigger haccp_control_point_turns_guard
  before insert or update on public.haccp_control_point_turns
  for each row execute function public.haccp_cpt_same_restaurant();

-- RLS dos pontos e das associacoes.
alter table public.haccp_control_points enable row level security;
alter table public.haccp_control_point_turns enable row level security;

create policy haccp_control_points_select on public.haccp_control_points
  for select using (public.is_restaurant_reader(restaurant_id));
create policy haccp_control_points_insert on public.haccp_control_points
  for insert to authenticated
  with check (public.member_role(restaurant_id) in ('owner','gestor'));
create policy haccp_control_points_update on public.haccp_control_points
  for update to authenticated
  using (public.member_role(restaurant_id) in ('owner','gestor'))
  with check (public.member_role(restaurant_id) in ('owner','gestor'));
-- Sem policy de DELETE: authenticated nao apaga (o gatilho e defesa em profundidade).

create policy haccp_cpt_select on public.haccp_control_point_turns
  for select using (public.is_restaurant_reader(restaurant_id));
create policy haccp_cpt_write on public.haccp_control_point_turns
  for all to authenticated
  using (public.member_role(restaurant_id) in ('owner','gestor'))
  with check (public.member_role(restaurant_id) in ('owner','gestor'));

-- ============================================================================
-- ITEM 4 (funcoes de janela) — dia de servico e janela do turno
-- ============================================================================

-- Dia de servico no fuso do restaurante com corte as 06:00.
create or replace function public.haccp_service_date(p_restaurant_id uuid, p_at timestamptz default null)
returns date
language sql
stable
set search_path = public
as $$
  select (((coalesce(p_at, public.haccp_now())
            at time zone coalesce((select r.timezone from public.restaurants r where r.id = p_restaurant_id), 'Europe/Lisbon'))
          - interval '6 hours'))::date;
$$;
comment on function public.haccp_service_date(uuid, timestamptz) is
  'Dia de servico (fuso do restaurante, corte as 06:00). p_at nulo usa haccp_now(). 0029.';

-- Janela de um turno num dia: opens_at 60 min antes do start_time; closes_at no
-- start_time do turno seguinte do mesmo dia ou as 06:00 do dia seguinte se for o
-- ultimo; cutoff_at sempre as 06:00 do dia seguinte. Zero linhas se o turno nao
-- corre nesse weekday ou esta inactivo.
create or replace function public.haccp_turn_window(p_restaurant_id uuid, p_turn_id uuid, p_service_date date)
returns table (opens_at timestamptz, closes_at timestamptz, cutoff_at timestamptz)
language sql
stable
set search_path = public
as $$
  with tz as (
    select coalesce((select r.timezone from public.restaurants r where r.id = p_restaurant_id), 'Europe/Lisbon') as t
  ),
  wd as (select extract(isodow from p_service_date)::int as d),
  this as (
    select tn.start_time
      from public.turns tn, wd
     where tn.id = p_turn_id
       and tn.restaurant_id = p_restaurant_id
       and tn.active
       and wd.d = any (tn.weekdays)
  ),
  nxt as (
    select min(tn.start_time) as start_time
      from public.turns tn, wd, this
     where tn.restaurant_id = p_restaurant_id
       and tn.active
       and wd.d = any (tn.weekdays)
       and tn.start_time > this.start_time
  )
  select
    (((p_service_date + this.start_time) at time zone (select t from tz)) - interval '60 minutes') as opens_at,
    coalesce(
      ((p_service_date + nxt.start_time) at time zone (select t from tz)),
      (((p_service_date + 1) + time '06:00') at time zone (select t from tz))
    ) as closes_at,
    (((p_service_date + 1) + time '06:00') at time zone (select t from tz)) as cutoff_at
  from this left join nxt on true;
$$;
comment on function public.haccp_turn_window(uuid, uuid, date) is
  'Janela de registo de um turno num dia (opens/closes/cutoff). Zero linhas se o turno nao corre nesse dia. 0029.';

-- ============================================================================
-- ITEM 4 (tabela) — Registos de temperatura imutaveis e ancorados ao turno
-- ============================================================================
create table if not exists public.haccp_temperature_readings (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  control_point_id uuid not null references public.haccp_control_points(id),
  turn_id        uuid not null references public.turns(id),
  service_date   date not null,
  value_c        numeric(5,1) not null check (value_c between -60 and 200),
  min_c          numeric(5,1),
  max_c          numeric(5,1),
  within_limits  boolean not null,
  sync_mode      text not null check (sync_mode in ('online','deferred')),
  captured_at    timestamptz,
  recorded_at    timestamptz not null default now(),
  recorded_by    uuid not null default auth.uid() references auth.users(id),
  rectifies_id   uuid references public.haccp_temperature_readings(id),
  note           text check (length(note) <= 500)
);
comment on table public.haccp_temperature_readings is
  'Registos de temperatura imutaveis, ancorados ao turno. Correccao por rectificacao encadeada. Itens A2, 7.2, 7.3. 0029.';

create index if not exists haccp_readings_service_idx
  on public.haccp_temperature_readings (restaurant_id, service_date, turn_id);
create index if not exists haccp_readings_cp_idx
  on public.haccp_temperature_readings (control_point_id, service_date);
create index if not exists haccp_readings_rectifies_idx
  on public.haccp_temperature_readings (rectifies_id);
-- Um original so pode ser rectificado uma vez (defesa em profundidade; o gatilho
-- da o erro amigavel haccp_rectificacao_invalida antes de chegar aqui).
create unique index if not exists haccp_readings_rectifies_uidx
  on public.haccp_temperature_readings (rectifies_id) where rectifies_id is not null;

-- Carimbo + validacao de janela + rectificacao. Corre como invoker.
create or replace function public.haccp_stamp_reading()
returns trigger language plpgsql set search_path = public as $$
declare
  v_seed boolean := current_setting('haccp.seed', true) = 'on';
  v_purge boolean := current_setting('haccp.purge', true) = 'on';
  v_uid uuid := auth.uid();
  v_now timestamptz := public.haccp_now();
  v_cp record;
  v_win record;
begin
  -- Ponto de controlo + coerencia de restaurante.
  select cp.* into v_cp from public.haccp_control_points cp where cp.id = new.control_point_id;
  if v_cp.id is null then
    raise exception 'haccp_ponto_inexistente';
  end if;
  if v_cp.restaurant_id <> new.restaurant_id then
    raise exception 'haccp_ponto_de_outro_restaurante';
  end if;
  if not exists (select 1 from public.turns t where t.id = new.turn_id and t.restaurant_id = new.restaurant_id) then
    raise exception 'haccp_turno_de_outro_restaurante';
  end if;

  -- Snapshot dos limites e conformidade (sempre, mesmo em semente).
  new.min_c := v_cp.min_c;
  new.max_c := v_cp.max_c;
  new.within_limits := (new.min_c is null or new.value_c >= new.min_c)
                   and (new.max_c is null or new.value_c <= new.max_c);

  -- Modo semente: respeita carimbos fornecidos, salta validacao de janela.
  if v_seed then
    if new.recorded_by is null then raise exception 'haccp_sem_utilizador'; end if;
    if new.recorded_at is null then new.recorded_at := v_now; end if;
    if new.service_date is null then
      new.service_date := public.haccp_service_date(new.restaurant_id, coalesce(new.captured_at, new.recorded_at));
    end if;
    if new.sync_mode is null then
      new.sync_mode := case when new.captured_at is null then 'online' else 'deferred' end;
    end if;
    return new;
  end if;

  -- Fora de semente e fora de purga exige utilizador autenticado.
  if v_uid is null then
    if v_purge then return new; end if;
    raise exception 'haccp_sem_utilizador';
  end if;

  -- Carimbo de servidor: ignora o que o cliente enviou.
  new.recorded_by := v_uid;
  new.recorded_at := v_now;

  if not v_cp.active then
    raise exception 'haccp_ponto_inactivo';
  end if;
  if not v_cp.all_turns then
    if not exists (
      select 1 from public.haccp_control_point_turns cpt
       where cpt.control_point_id = new.control_point_id and cpt.turn_id = new.turn_id
    ) then
      raise exception 'haccp_ponto_nao_associado_ao_turno';
    end if;
  end if;

  -- Dia de servico a partir do instante de captura (ou agora).
  new.service_date := public.haccp_service_date(new.restaurant_id, coalesce(new.captured_at, v_now));

  select * into v_win from public.haccp_turn_window(new.restaurant_id, new.turn_id, new.service_date);
  if v_win.opens_at is null then
    raise exception 'haccp_turno_nao_corre_hoje';
  end if;

  if new.captured_at is null then
    -- Online: now() dentro de [opens, closes).
    if not (v_now >= v_win.opens_at and v_now < v_win.closes_at) then
      raise exception 'haccp_fora_da_janela';
    end if;
    new.sync_mode := 'online';
  else
    -- Diferido: captured_at na janela, now() antes do cutoff, captura no passado.
    if new.captured_at > v_now then raise exception 'haccp_fora_da_janela'; end if;
    if not (new.captured_at >= v_win.opens_at and new.captured_at < v_win.closes_at) then
      raise exception 'haccp_fora_da_janela';
    end if;
    if not (v_now < v_win.cutoff_at) then raise exception 'haccp_fora_da_janela'; end if;
    new.sync_mode := 'deferred';
  end if;

  -- Rectificacao: original valido, do mesmo escopo, ainda nao rectificado.
  if new.rectifies_id is not null then
    if not exists (
      select 1 from public.haccp_temperature_readings o
       where o.id = new.rectifies_id
         and o.restaurant_id = new.restaurant_id
         and o.control_point_id = new.control_point_id
         and o.turn_id = new.turn_id
         and o.service_date = new.service_date
    ) then
      raise exception 'haccp_rectificacao_invalida';
    end if;
    if exists (select 1 from public.haccp_temperature_readings o2 where o2.rectifies_id = new.rectifies_id) then
      raise exception 'haccp_rectificacao_invalida';
    end if;
  end if;

  return new;
end $$;
comment on function public.haccp_stamp_reading() is
  'BEFORE INSERT em haccp_temperature_readings: carimbo de servidor, snapshot de limites, validacao de janela e de rectificacao. 0029.';

create trigger haccp_readings_stamp
  before insert on public.haccp_temperature_readings
  for each row execute function public.haccp_stamp_reading();

-- Imutabilidade generica reutilizada nas tabelas probatorias (itens 4, 5, 6).
create or replace function public.haccp_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('haccp.purge', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'haccp_registo_imutavel';
end $$;
comment on function public.haccp_immutable() is
  'BEFORE UPDATE OR DELETE: bloqueia mutacao de registos probatorios (excepto purga). 0029.';

create trigger haccp_readings_immutable
  before update or delete on public.haccp_temperature_readings
  for each row execute function public.haccp_immutable();

alter table public.haccp_temperature_readings enable row level security;
create policy haccp_readings_select on public.haccp_temperature_readings
  for select using (public.is_restaurant_reader(restaurant_id));
create policy haccp_readings_insert on public.haccp_temperature_readings
  for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id) and recorded_by = auth.uid());
-- Sem UPDATE/DELETE: a RLS fecha e o gatilho e defesa em profundidade.

-- RPC de registo (invoker). O cliente do Sprint 02 chama sempre isto.
create or replace function public.haccp_record_temperature(
  p_control_point_id uuid,
  p_turn_id uuid,
  p_value_c numeric,
  p_captured_at timestamptz default null,
  p_note text default null,
  p_rectifies_id uuid default null
)
returns table (id uuid, within_limits boolean, sync_mode text, service_date date)
language plpgsql
security invoker
set search_path = public
as $$
declare v_rid uuid; v_id uuid;
begin
  select cp.restaurant_id into v_rid from public.haccp_control_points cp where cp.id = p_control_point_id;
  if v_rid is null then raise exception 'haccp_ponto_inexistente'; end if;
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, value_c, within_limits, sync_mode, captured_at, note, rectifies_id, service_date)
  values
    (v_rid, p_control_point_id, p_turn_id, p_value_c, false, 'online', p_captured_at, p_note, p_rectifies_id, current_date)
  returning haccp_temperature_readings.id into v_id;
  return query
    select t.id, t.within_limits, t.sync_mode, t.service_date
      from public.haccp_temperature_readings t where t.id = v_id;
end $$;
comment on function public.haccp_record_temperature(uuid, uuid, numeric, timestamptz, text, uuid) is
  'RPC de registo de temperatura. Resolve o restaurante pelo ponto, insere e devolve o resultado carimbado. 0029.';

-- ============================================================================
-- ITEM 6 — Fornecedores, recepcao de materias-primas e recusas
-- (antes do item 5 porque a nao conformidade referencia recepcoes)
-- ============================================================================

create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  name_norm     text not null,
  nif           text check (nif ~ '^[0-9]{9}$'),
  active         boolean not null default true,
  created_at    timestamptz not null default now()
);
comment on table public.suppliers is
  'Fornecedores do tenant (entidade reutilizavel, nao texto livre). Editavel e desactivavel. Item B1. 0029.';

create unique index if not exists suppliers_name_norm_uidx
  on public.suppliers (restaurant_id, name_norm);

create or replace function public.suppliers_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name_norm := lower(trim(regexp_replace(new.name, '\s+', ' ', 'g')));
  return new;
end $$;
comment on function public.suppliers_normalize() is
  'BEFORE INSERT/UPDATE em suppliers: mantem name_norm para deteccao de duplicados. 0029.';

create trigger suppliers_normalize
  before insert or update on public.suppliers
  for each row execute function public.suppliers_normalize();

alter table public.suppliers enable row level security;
create policy suppliers_select on public.suppliers
  for select using (public.is_restaurant_reader(restaurant_id));
create policy suppliers_insert on public.suppliers
  for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id));
create policy suppliers_update on public.suppliers
  for update to authenticated
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
-- Sem DELETE.

create table if not exists public.haccp_receptions (
  id                     uuid primary key default gen_random_uuid(),
  restaurant_id          uuid not null references public.restaurants(id) on delete cascade,
  supplier_id            uuid not null references public.suppliers(id),
  delivered_on           date not null,
  service_date           date not null,
  turn_id                uuid references public.turns(id),
  temperature_applicable boolean not null default false,
  temperature_c          numeric(5,1) check (temperature_c between -60 and 200),
  expiry_ok              boolean not null,
  packaging_ok           boolean not null,
  conforming             boolean not null,
  photo_path             text check (photo_path is null or photo_path like restaurant_id::text || '/%'),
  note                   text check (length(note) <= 1000),
  recorded_by            uuid not null default auth.uid() references auth.users(id),
  recorded_at            timestamptz not null default now(),
  constraint haccp_reception_temp_present check (not temperature_applicable or temperature_c is not null)
);
comment on table public.haccp_receptions is
  'Recepcao de materias-primas (controlo na entrega). Registavel ate 7 dias apos a entrega. Item B1. 0029.';

create index if not exists haccp_receptions_service_idx
  on public.haccp_receptions (restaurant_id, service_date);
create index if not exists haccp_receptions_supplier_idx
  on public.haccp_receptions (supplier_id);

create or replace function public.haccp_reception_stamp()
returns trigger language plpgsql set search_path = public as $$
declare
  v_seed boolean := current_setting('haccp.seed', true) = 'on';
  v_uid uuid := auth.uid();
  v_sd date;
begin
  if v_seed then
    if new.recorded_by is null then raise exception 'haccp_sem_utilizador'; end if;
    if new.recorded_at is null then new.recorded_at := public.haccp_now(); end if;
  else
    if v_uid is null then raise exception 'haccp_sem_utilizador'; end if;
    new.recorded_by := v_uid;
    new.recorded_at := public.haccp_now();
  end if;

  if not exists (
    select 1 from public.suppliers s
     where s.id = new.supplier_id and s.restaurant_id = new.restaurant_id and s.active
  ) then
    raise exception 'haccp_fornecedor_invalido';
  end if;

  v_sd := public.haccp_service_date(new.restaurant_id);
  if v_seed then
    if new.service_date is null then new.service_date := v_sd; end if;
  else
    new.service_date := v_sd;
    if new.delivered_on > v_sd or new.delivered_on < v_sd - 7 then
      raise exception 'haccp_data_entrega_invalida';
    end if;
  end if;
  return new;
end $$;
comment on function public.haccp_reception_stamp() is
  'BEFORE INSERT em haccp_receptions: carimbo, fornecedor do mesmo restaurante e activo, janela de delivered_on (ate 7 dias). 0029.';

create trigger haccp_receptions_stamp
  before insert on public.haccp_receptions
  for each row execute function public.haccp_reception_stamp();
create trigger haccp_receptions_immutable
  before update or delete on public.haccp_receptions
  for each row execute function public.haccp_immutable();

alter table public.haccp_receptions enable row level security;
create policy haccp_receptions_select on public.haccp_receptions
  for select using (public.is_restaurant_reader(restaurant_id));
create policy haccp_receptions_insert on public.haccp_receptions
  for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id) and recorded_by = auth.uid());

create table if not exists public.haccp_rejections (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reception_id  uuid not null references public.haccp_receptions(id),
  cause         text not null check (cause in ('higiene_deficiente','requisitos_embalagem','validade_ultrapassada','temperatura_insuficiente','caracteristicas_organolepticas')),
  quantity_text text check (length(quantity_text) <= 120),
  description   text check (length(description) <= 1000),
  recorded_by   uuid not null default auth.uid() references auth.users(id),
  recorded_at   timestamptz not null default now()
);
comment on table public.haccp_rejections is
  'Recusa de materia-prima (uma por recepcao). Exige recepcao nao conforme. Item B2. 0029.';

create unique index if not exists haccp_rejections_reception_uidx
  on public.haccp_rejections (reception_id);

create or replace function public.haccp_rejection_stamp()
returns trigger language plpgsql set search_path = public as $$
declare
  v_seed boolean := current_setting('haccp.seed', true) = 'on';
  v_uid uuid := auth.uid();
  v_conforming boolean;
  v_rid uuid;
begin
  if v_seed then
    if new.recorded_by is null then raise exception 'haccp_sem_utilizador'; end if;
    if new.recorded_at is null then new.recorded_at := public.haccp_now(); end if;
  else
    if v_uid is null then raise exception 'haccp_sem_utilizador'; end if;
    new.recorded_by := v_uid;
    new.recorded_at := public.haccp_now();
  end if;

  select restaurant_id, conforming into v_rid, v_conforming
    from public.haccp_receptions where id = new.reception_id;
  if v_rid is null or v_rid <> new.restaurant_id then
    raise exception 'haccp_registo_de_outro_restaurante';
  end if;
  if v_conforming then
    raise exception 'haccp_recusa_exige_nao_conforme';
  end if;
  return new;
end $$;
comment on function public.haccp_rejection_stamp() is
  'BEFORE INSERT em haccp_rejections: carimbo, recepcao do mesmo restaurante e nao conforme. 0029.';

create trigger haccp_rejections_stamp
  before insert on public.haccp_rejections
  for each row execute function public.haccp_rejection_stamp();
create trigger haccp_rejections_immutable
  before update or delete on public.haccp_rejections
  for each row execute function public.haccp_immutable();

alter table public.haccp_rejections enable row level security;
create policy haccp_rejections_select on public.haccp_rejections
  for select using (public.is_restaurant_reader(restaurant_id));
create policy haccp_rejections_insert on public.haccp_rejections
  for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id) and recorded_by = auth.uid());

-- ============================================================================
-- ITEM 5 — Nao conformidades e verificacao de eficacia
-- ============================================================================
create table if not exists public.haccp_nonconformities (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  source             text not null check (source in ('temperature','reception','manual')),
  reading_id         uuid references public.haccp_temperature_readings(id),
  reception_id       uuid references public.haccp_receptions(id),
  service_date       date not null,
  turn_id            uuid references public.turns(id),
  occurred_at        timestamptz not null default now(),
  description        text not null check (length(trim(description)) between 3 and 2000),
  measured_value     text,
  limit_text         text,
  product_disposition text not null check (length(trim(product_disposition)) >= 2),
  immediate_action   text not null check (length(trim(immediate_action)) >= 2),
  root_cause_action  text not null check (length(trim(root_cause_action)) >= 2),
  executed_by_name   text not null check (length(trim(executed_by_name)) >= 2),
  recorded_by        uuid not null default auth.uid() references auth.users(id),
  recorded_at        timestamptz not null default now(),
  constraint haccp_nc_source_ref check (
    (source = 'temperature' and reading_id is not null) or
    (source = 'reception'   and reception_id is not null) or
    (source = 'manual')
  )
);
comment on table public.haccp_nonconformities is
  'Nao conformidades com accao correctiva obrigatoria. Origem em temperatura, recepcao ou manual. Item C1. 0029.';

create index if not exists haccp_nc_service_idx on public.haccp_nonconformities (restaurant_id, service_date);
create index if not exists haccp_nc_reading_idx on public.haccp_nonconformities (reading_id);
create index if not exists haccp_nc_reception_idx on public.haccp_nonconformities (reception_id);

create or replace function public.haccp_nc_stamp()
returns trigger language plpgsql set search_path = public as $$
declare
  v_seed boolean := current_setting('haccp.seed', true) = 'on';
  v_uid uuid := auth.uid();
begin
  if v_seed then
    if new.recorded_by is null then raise exception 'haccp_sem_utilizador'; end if;
    if new.recorded_at is null then new.recorded_at := public.haccp_now(); end if;
  else
    if v_uid is null then raise exception 'haccp_sem_utilizador'; end if;
    new.recorded_by := v_uid;
    new.recorded_at := public.haccp_now();
  end if;

  if new.reading_id is not null then
    if not exists (select 1 from public.haccp_temperature_readings r
                    where r.id = new.reading_id and r.restaurant_id = new.restaurant_id) then
      raise exception 'haccp_registo_de_outro_restaurante';
    end if;
    select r.service_date, r.turn_id into new.service_date, new.turn_id
      from public.haccp_temperature_readings r where r.id = new.reading_id;
  elsif new.reception_id is not null then
    if not exists (select 1 from public.haccp_receptions rc
                    where rc.id = new.reception_id and rc.restaurant_id = new.restaurant_id) then
      raise exception 'haccp_registo_de_outro_restaurante';
    end if;
    select rc.service_date, rc.turn_id into new.service_date, new.turn_id
      from public.haccp_receptions rc where rc.id = new.reception_id;
  else
    if new.service_date is null then
      new.service_date := public.haccp_service_date(new.restaurant_id);
    end if;
  end if;
  return new;
end $$;
comment on function public.haccp_nc_stamp() is
  'BEFORE INSERT em haccp_nonconformities: carimbo, valida origem do mesmo restaurante, herda service_date/turn_id da origem. 0029.';

create trigger haccp_nc_stamp
  before insert on public.haccp_nonconformities
  for each row execute function public.haccp_nc_stamp();
create trigger haccp_nc_immutable
  before update or delete on public.haccp_nonconformities
  for each row execute function public.haccp_immutable();

create table if not exists public.haccp_nc_verifications (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  nonconformity_id uuid not null references public.haccp_nonconformities(id),
  effective        boolean not null,
  note             text check (length(note) <= 1000),
  verified_by      uuid not null default auth.uid() references auth.users(id),
  verified_at      timestamptz not null default now()
);
comment on table public.haccp_nc_verifications is
  'Verificacao de eficacia de uma nao conformidade (uma por NC, por utilizador diferente de quem a registou). Item C1. 0029.';

create unique index if not exists haccp_nc_verif_uidx
  on public.haccp_nc_verifications (nonconformity_id);

create or replace function public.haccp_nc_verif_stamp()
returns trigger language plpgsql set search_path = public as $$
declare
  v_seed boolean := current_setting('haccp.seed', true) = 'on';
  v_uid uuid := auth.uid();
  v_rec_by uuid;
  v_nc_rid uuid;
begin
  if v_seed then
    if new.verified_by is null then raise exception 'haccp_sem_utilizador'; end if;
    if new.verified_at is null then new.verified_at := public.haccp_now(); end if;
  else
    if v_uid is null then raise exception 'haccp_sem_utilizador'; end if;
    new.verified_by := v_uid;
    new.verified_at := public.haccp_now();
  end if;

  select nc.recorded_by, nc.restaurant_id into v_rec_by, v_nc_rid
    from public.haccp_nonconformities nc where nc.id = new.nonconformity_id;
  if v_nc_rid is null or v_nc_rid <> new.restaurant_id then
    raise exception 'haccp_registo_de_outro_restaurante';
  end if;
  if new.verified_by = v_rec_by then
    raise exception 'haccp_verificacao_mesmo_utilizador';
  end if;
  return new;
end $$;
comment on function public.haccp_nc_verif_stamp() is
  'BEFORE INSERT em haccp_nc_verifications: carimbo, mesmo restaurante da NC, verificador diferente de quem registou a NC. 0029.';

create trigger haccp_nc_verif_stamp
  before insert on public.haccp_nc_verifications
  for each row execute function public.haccp_nc_verif_stamp();
create trigger haccp_nc_verif_immutable
  before update or delete on public.haccp_nc_verifications
  for each row execute function public.haccp_immutable();

alter table public.haccp_nonconformities enable row level security;
alter table public.haccp_nc_verifications enable row level security;

create policy haccp_nc_select on public.haccp_nonconformities
  for select using (public.is_restaurant_reader(restaurant_id));
create policy haccp_nc_insert on public.haccp_nonconformities
  for insert to authenticated
  with check (public.is_restaurant_member(restaurant_id));

create policy haccp_nc_verif_select on public.haccp_nc_verifications
  for select using (public.is_restaurant_reader(restaurant_id));
-- Um consultor externo PODE verificar eficacia: e o caso de uso do role.
create policy haccp_nc_verif_insert on public.haccp_nc_verifications
  for insert to authenticated
  with check (public.is_restaurant_reader(restaurant_id) and verified_by = auth.uid());

-- ============================================================================
-- VISTAS
-- ============================================================================

-- Estado por NC: aberta/verificada, horas em aberto, overdue (>48 h).
create or replace view public.haccp_nc_status
with (security_invoker = true) as
  select
    nc.id                                          as nonconformity_id,
    nc.restaurant_id,
    nc.service_date,
    nc.occurred_at,
    case when v.id is null then 'aberta' else 'verificada' end as status,
    v.verified_at,
    v.effective,
    case when v.id is null
         then extract(epoch from (public.haccp_now() - nc.occurred_at)) / 3600.0
         else null end                             as open_hours,
    (v.id is null and public.haccp_now() - nc.occurred_at > interval '48 hours') as overdue
  from public.haccp_nonconformities nc
  left join public.haccp_nc_verifications v on v.nonconformity_id = nc.id;
comment on view public.haccp_nc_status is
  'Uma linha por NC com estado, horas em aberto e overdue (>48h). security_invoker. Item C1. 0029.';

-- Estatisticas por fornecedor.
create or replace view public.haccp_supplier_stats
with (security_invoker = true) as
  select
    s.id            as supplier_id,
    s.restaurant_id,
    s.name,
    count(distinct rc.id) as receptions_count,
    count(distinct rj.id) as rejections_count,
    max(rj.recorded_at)   as last_rejection_at,
    max(rc.recorded_at)   as last_reception_at
  from public.suppliers s
  left join public.haccp_receptions rc on rc.supplier_id = s.id
  left join public.haccp_rejections rj on rj.reception_id = rc.id
  group by s.id, s.restaurant_id, s.name;
comment on view public.haccp_supplier_stats is
  'Contagens de recepcoes e recusas por fornecedor, com ultimas datas. security_invoker. Item B2. 0029.';

-- ============================================================================
-- STORAGE — bucket privado de evidencias com quota por tenant
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('haccp-evidence', 'haccp-evidence', false)
on conflict (id) do nothing;

-- Bytes usados no bucket por um restaurante (prefixo restaurant_id/). Definer
-- porque o cliente nao le storage.objects de forma agregada; guarda de leitura.
create or replace function public.haccp_storage_usage_bytes(p_restaurant_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if not public.is_restaurant_reader(p_restaurant_id) then
    raise exception 'nao_autorizado';
  end if;
  return coalesce((
    select sum((o.metadata->>'size')::bigint)
      from storage.objects o
     where o.bucket_id = 'haccp-evidence'
       and (storage.foldername(o.name))[1] = p_restaurant_id::text
  ), 0);
end $$;
comment on function public.haccp_storage_usage_bytes(uuid) is
  'Bytes usados no bucket haccp-evidence por um restaurante. Guarda is_restaurant_reader. Decisao 7.5. 0029.';

drop policy if exists "haccp_evidence_reader_select" on storage.objects;
create policy "haccp_evidence_reader_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'haccp-evidence'
    and public.is_restaurant_reader(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "haccp_evidence_member_insert" on storage.objects;
create policy "haccp_evidence_member_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'haccp-evidence'
    and public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
    and public.haccp_storage_usage_bytes(((storage.foldername(name))[1])::uuid)
        < (coalesce((select r.haccp_photo_quota_mb from public.restaurants r
                      where r.id = ((storage.foldername(name))[1])::uuid), 500)::bigint * 1024 * 1024)
  );
-- Sem UPDATE/DELETE para authenticated (evidencias nao se alteram; purga e definer).

-- ============================================================================
-- ITEM 2 (funcao) — Purga de registos fora da retencao (owner-only)
-- ============================================================================
create or replace function public.haccp_purge_expired(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_months int;
  v_cut date;
  v_readings int; v_nc int; v_ver int; v_rec int; v_rej int; v_photos int;
begin
  if not public.is_restaurant_owner(p_restaurant_id) then
    raise exception 'nao_autorizado';
  end if;
  select r.haccp_retention_months into v_months
    from public.restaurants r where r.id = p_restaurant_id;
  v_cut := (current_date - make_interval(months => v_months));

  -- Carimbo que autoriza contornar a imutabilidade e o no-delete dos pontos.
  perform set_config('haccp.purge', 'on', true);

  -- Verificacoes das NC que vao cair (nao tem service_date proprio).
  delete from public.haccp_nc_verifications v
   using public.haccp_nonconformities nc
   where v.nonconformity_id = nc.id
     and nc.restaurant_id = p_restaurant_id
     and nc.service_date < v_cut;
  get diagnostics v_ver = row_count;

  delete from public.haccp_nonconformities nc
   where nc.restaurant_id = p_restaurant_id and nc.service_date < v_cut;
  get diagnostics v_nc = row_count;

  -- Recusas das recepcoes que vao cair.
  delete from public.haccp_rejections rj
   using public.haccp_receptions rc
   where rj.reception_id = rc.id
     and rc.restaurant_id = p_restaurant_id
     and rc.service_date < v_cut;
  get diagnostics v_rej = row_count;

  delete from public.haccp_receptions rc
   where rc.restaurant_id = p_restaurant_id and rc.service_date < v_cut;
  get diagnostics v_rec = row_count;

  delete from public.haccp_temperature_readings r
   where r.restaurant_id = p_restaurant_id and r.service_date < v_cut;
  get diagnostics v_readings = row_count;

  delete from storage.objects o
   where o.bucket_id = 'haccp-evidence'
     and (storage.foldername(o.name))[1] = p_restaurant_id::text
     and o.created_at < v_cut;
  get diagnostics v_photos = row_count;

  return jsonb_build_object(
    'readings', v_readings,
    'nonconformities', v_nc,
    'verifications', v_ver,
    'receptions', v_rec,
    'rejections', v_rej,
    'photos', v_photos
  );
end $$;
comment on function public.haccp_purge_expired(uuid) is
  'Apaga registos HACCP fora da retencao do tenant. Owner-only. Contorna imutabilidade via haccp.purge. Decisao 7.4. 0029.';

-- ============================================================================
-- ITEM 7 — Estado por turno, lacunas do periodo e registos em bloco
-- ============================================================================

-- Uma linha por (dia, turno que corre e estava activo, ponto activo associado)
-- com o estado do registo. O registo considerado e o mais recente da cadeia de
-- rectificacao (o que nao foi rectificado).
create or replace function public.haccp_expected_readings(
  p_restaurant_id uuid, p_from date, p_to date
)
returns table (
  service_date date, turn_id uuid, turn_label text,
  control_point_id uuid, control_point_name text, kind text,
  opens_at timestamptz, closes_at timestamptz, status text,
  reading_id uuid, value_c numeric, within_limits boolean,
  recorded_at timestamptz, sync_mode text, nc_id uuid, nc_status text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if not public.is_restaurant_reader(p_restaurant_id) then
    raise exception 'nao_autorizado';
  end if;
  if p_to - p_from > 92 then
    raise exception 'intervalo_demasiado_longo';
  end if;

  return query
  with days as (
    select g::date as service_date
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  cells as (
    select dd.service_date, t.id as turn_id, t.label as turn_label,
           cp.id as control_point_id, cp.name as control_point_name, cp.kind
      from days dd
      join public.turns t
        on t.restaurant_id = p_restaurant_id
       and t.active
       and extract(isodow from dd.service_date)::int = any (t.weekdays)
      join public.haccp_control_points cp
        on cp.restaurant_id = p_restaurant_id
       and cp.created_at::date <= dd.service_date
       and (cp.deactivated_at is null or dd.service_date < cp.deactivated_at::date)
       and (cp.all_turns or exists (
              select 1 from public.haccp_control_point_turns x
               where x.control_point_id = cp.id and x.turn_id = t.id))
  )
  select
    c.service_date, c.turn_id, c.turn_label,
    c.control_point_id, c.control_point_name, c.kind,
    w.opens_at, w.closes_at,
    case
      when r.id is not null and r.within_limits then 'conforme'
      when r.id is not null and ncs.status = 'verificada' then 'desvio_resolvido'
      when r.id is not null and nc.id is not null then 'desvio_aberto'
      when r.id is not null then 'desvio_sem_resposta'
      when public.haccp_now() < w.opens_at then 'futuro'
      when public.haccp_now() < w.closes_at then 'por_verificar'
      else 'em_falta'
    end as status,
    r.id, r.value_c, r.within_limits, r.recorded_at, r.sync_mode,
    nc.id, ncs.status
  from cells c
  cross join lateral public.haccp_turn_window(p_restaurant_id, c.turn_id, c.service_date) w
  left join lateral (
    select rd.id, rd.value_c, rd.within_limits, rd.recorded_at, rd.sync_mode
      from public.haccp_temperature_readings rd
     where rd.restaurant_id = p_restaurant_id
       and rd.control_point_id = c.control_point_id
       and rd.turn_id = c.turn_id
       and rd.service_date = c.service_date
       and not exists (select 1 from public.haccp_temperature_readings r2 where r2.rectifies_id = rd.id)
     order by rd.recorded_at desc
     limit 1
  ) r on true
  left join lateral (
    select n.id, n.recorded_by
      from public.haccp_nonconformities n
     where n.reading_id = r.id
     order by n.occurred_at desc
     limit 1
  ) nc on true
  left join public.haccp_nc_status ncs on ncs.nonconformity_id = nc.id
  order by c.service_date, w.opens_at, c.control_point_name;
end $$;
comment on function public.haccp_expected_readings(uuid, date, date) is
  'Estado esperado vs registado por (dia, turno, ponto) num periodo. Base do A3 e do dossie. 0029.';

-- Wrapper de um dia (default: dia de servico corrente).
create or replace function public.haccp_turn_status(
  p_restaurant_id uuid, p_service_date date default null
)
returns table (
  service_date date, turn_id uuid, turn_label text,
  control_point_id uuid, control_point_name text, kind text,
  opens_at timestamptz, closes_at timestamptz, status text,
  reading_id uuid, value_c numeric, within_limits boolean,
  recorded_at timestamptz, sync_mode text, nc_id uuid, nc_status text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare v_d date := coalesce(p_service_date, public.haccp_service_date(p_restaurant_id));
begin
  return query select * from public.haccp_expected_readings(p_restaurant_id, v_d, v_d);
end $$;
comment on function public.haccp_turn_status(uuid, date) is
  'Estado do turno para um dia (wrapper de haccp_expected_readings). 0029.';

-- Sumario do periodo para o dossie e a anti-metrica.
create or replace function public.haccp_period_summary(
  p_restaurant_id uuid, p_from date, p_to date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare v_out jsonb;
begin
  if not public.is_restaurant_reader(p_restaurant_id) then
    raise exception 'nao_autorizado';
  end if;
  with er as (
    select * from public.haccp_expected_readings(p_restaurant_id, p_from, p_to)
  ),
  a as (
    select
      count(*) as expected,
      count(*) filter (where reading_id is not null) as recorded,
      count(*) filter (where status = 'em_falta') as missing,
      count(*) filter (where status in ('desvio_sem_resposta','desvio_aberto','desvio_resolvido')) as deviations,
      count(*) filter (where status = 'desvio_sem_resposta') as deviations_unanswered
    from er
  ),
  n as (
    select
      count(*) filter (where s.status = 'aberta')     as nc_open,
      count(*) filter (where s.status = 'verificada') as nc_verified
    from public.haccp_nonconformities nc
    join public.haccp_nc_status s on s.nonconformity_id = nc.id
    where nc.restaurant_id = p_restaurant_id and nc.service_date between p_from and p_to
  ),
  rc as (
    select count(*) as receptions from public.haccp_receptions
     where restaurant_id = p_restaurant_id and service_date between p_from and p_to
  ),
  rj as (
    select count(*) as rejections
      from public.haccp_rejections r
      join public.haccp_receptions rec on rec.id = r.reception_id
     where rec.restaurant_id = p_restaurant_id and rec.service_date between p_from and p_to
  )
  select jsonb_build_object(
    'expected', a.expected,
    'recorded', a.recorded,
    'missing', a.missing,
    'deviations', a.deviations,
    'deviations_unanswered', a.deviations_unanswered,
    'nc_open', n.nc_open,
    'nc_verified', n.nc_verified,
    'receptions', rc.receptions,
    'rejections', rj.rejections,
    'completion_rate', round(case when a.expected = 0 then 0 else a.recorded::numeric / a.expected end, 4)
  ) into v_out
  from a, n, rc, rj;
  return v_out;
end $$;
comment on function public.haccp_period_summary(uuid, date, date) is
  'Sumario agregado do periodo (esperado/registado/lacunas/desvios/NC/recepcoes). 0029.';

-- Anti-metrica: registos em bloco (3+ do mesmo utilizador em 2 minutos).
create or replace function public.haccp_burst_check(
  p_restaurant_id uuid, p_from date, p_to date
)
returns table (recorded_by uuid, window_start timestamptz, readings int, control_points int)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if public.member_role(p_restaurant_id) not in ('owner','gestor','consultor') then
    raise exception 'nao_autorizado';
  end if;
  return query
  with base as (
    select r.recorded_by, r.recorded_at, r.control_point_id
      from public.haccp_temperature_readings r
     where r.restaurant_id = p_restaurant_id
       and r.service_date between p_from and p_to
  )
  select b.recorded_by, b.recorded_at as window_start,
         count(*)::int as readings,
         count(distinct b2.control_point_id)::int as control_points
    from base b
    join base b2 on b2.recorded_by = b.recorded_by
      and b2.recorded_at >= b.recorded_at
      and b2.recorded_at < b.recorded_at + interval '2 minutes'
   group by b.recorded_by, b.recorded_at
  having count(*) >= 3;
end $$;
comment on function public.haccp_burst_check(uuid, date, date) is
  'Deteccao de registos em bloco (3+ do mesmo utilizador numa janela de 2 min). Anti-metrica. Guarda owner/gestor/consultor. 0029.';

-- ============================================================================
-- ITEM 8 — Higiene de grants (padrao 0024: revoke public/anon, grant authenticated)
-- ============================================================================

-- Funcoes expostas ao cliente.
revoke all on function public.is_restaurant_reader(uuid) from public, anon;
grant execute on function public.is_restaurant_reader(uuid) to authenticated;

revoke all on function public.haccp_service_date(uuid, timestamptz) from public, anon;
grant execute on function public.haccp_service_date(uuid, timestamptz) to authenticated;

revoke all on function public.haccp_turn_window(uuid, uuid, date) from public, anon;
grant execute on function public.haccp_turn_window(uuid, uuid, date) to authenticated;

revoke all on function public.haccp_record_temperature(uuid, uuid, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.haccp_record_temperature(uuid, uuid, numeric, timestamptz, text, uuid) to authenticated;

revoke all on function public.haccp_storage_usage_bytes(uuid) from public, anon;
grant execute on function public.haccp_storage_usage_bytes(uuid) to authenticated;

revoke all on function public.haccp_purge_expired(uuid) from public, anon;
grant execute on function public.haccp_purge_expired(uuid) to authenticated;

revoke all on function public.haccp_expected_readings(uuid, date, date) from public, anon;
grant execute on function public.haccp_expected_readings(uuid, date, date) to authenticated;

revoke all on function public.haccp_turn_status(uuid, date) from public, anon;
grant execute on function public.haccp_turn_status(uuid, date) to authenticated;

revoke all on function public.haccp_period_summary(uuid, date, date) from public, anon;
grant execute on function public.haccp_period_summary(uuid, date, date) to authenticated;

revoke all on function public.haccp_burst_check(uuid, date, date) from public, anon;
grant execute on function public.haccp_burst_check(uuid, date, date) to authenticated;

-- Funcoes de gatilho: sem grant a authenticated. Os gatilhos disparam sem
-- necessitar de EXECUTE do invocador; revogar de public/anon impede chamada
-- directa. haccp_now() NAO e revogada de propos: e chamada por funcoes INVOKER
-- (janela, vistas, estado) que correm como o caller, que precisa de EXECUTE.
revoke all on function public.haccp_apply_kind_defaults() from public, anon;
revoke all on function public.haccp_control_points_touch() from public, anon;
revoke all on function public.haccp_control_point_no_delete() from public, anon;
revoke all on function public.haccp_cpt_same_restaurant() from public, anon;
revoke all on function public.haccp_stamp_reading() from public, anon;
revoke all on function public.haccp_immutable() from public, anon;
revoke all on function public.suppliers_normalize() from public, anon;
revoke all on function public.haccp_reception_stamp() from public, anon;
revoke all on function public.haccp_rejection_stamp() from public, anon;
revoke all on function public.haccp_nc_stamp() from public, anon;
revoke all on function public.haccp_nc_verif_stamp() from public, anon;
