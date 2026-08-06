-- ============================================================================
-- OMNAI Console · Backend Nostos (control plane OMNAI→cliente)
-- Aplicada a prod (stoa, emuwqkdummdmacnkltte) em 06-08-2026 como migrations
-- `omnai_console_admin_nostos_bloco3` + `..._audit_immutable_search_path`
-- (consolidadas aqui num único ficheiro). Aditiva, idempotente.
-- Backfill dos pilotos (dados específicos de prod) em supabase/ops/.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. restaurants: campos de gestão de tenant (control plane OMNAI→cliente)
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists plan_code            text,
  add column if not exists status               text not null default 'trial',
  add column if not exists is_demo              boolean not null default false,
  add column if not exists price_override_cents int,
  add column if not exists override_reason_code text,
  add column if not exists override_reason_note text,
  add column if not exists override_until       date,
  add column if not exists paid_until           date,
  add column if not exists trial_ends_at        date,
  add column if not exists activated_at         timestamptz,  -- 1ª activação; âncora do intro
  add column if not exists suspended_at         timestamptz;

-- Estados canónicos: trial → active → suspended → churned
alter table public.restaurants
  drop constraint if exists restaurants_status_check;
alter table public.restaurants
  add constraint restaurants_status_check
  check (status in ('trial','active','suspended','churned'));

-- Motivo de override (spec §4): estrategico | volume | outro (nota livre à parte)
alter table public.restaurants
  drop constraint if exists restaurants_override_reason_check;
alter table public.restaurants
  add constraint restaurants_override_reason_check
  check (override_reason_code is null
         or override_reason_code in ('estrategico','volume','outro'));

-- Coerência: se há override de preço, tem de haver motivo (desconto nunca invisível)
alter table public.restaurants
  drop constraint if exists restaurants_override_needs_reason_check;
alter table public.restaurants
  add constraint restaurants_override_needs_reason_check
  check (price_override_cents is null or override_reason_code is not null);

-- ---------------------------------------------------------------------------
-- 2. product_plans: catálogo de planos do produto (Nostos)
-- ---------------------------------------------------------------------------
create table if not exists public.product_plans (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  base_price_cents  int  not null,
  unit_price_cents  int,
  unit_metric       text,
  intro_price_cents int,
  intro_months      int,
  billing_period    text not null default 'mensal',
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.product_plans enable row level security;
-- Sem policies: só service_role (dentro das edge functions) lê/escreve. Advisor
-- vai marcar "RLS enabled, no policy" — é intencional (tabela de control plane).

-- Seed do catálogo Nostos (spec §4; IVA fica na facturação, não no catálogo).
-- Grelha Essencial/Sala/Casa está morta (decisão 30-07: um preço, tudo incluído).
insert into public.product_plans
  (code, name, base_price_cents, intro_price_cents, intro_months, billing_period, active)
values
  ('founding', 'Founding', 7900, 4900, 12, 'mensal', true),
  ('normal',   'Normal',   9900, null, null, 'mensal', true)
on conflict (code) do update set
  name              = excluded.name,
  base_price_cents  = excluded.base_price_cents,
  intro_price_cents = excluded.intro_price_cents,
  intro_months      = excluded.intro_months,
  billing_period    = excluded.billing_period,
  active            = excluded.active;

-- ---------------------------------------------------------------------------
-- 3. admin_audit_log: registo imutável de acções administrativas
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action      text not null,
  tenant_id   uuid references public.restaurants(id) on delete set null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_tenant_idx on public.admin_audit_log (tenant_id);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- Sem policies de INSERT/UPDATE/DELETE: só service_role escreve (bypassa RLS).

-- Imutabilidade real (defesa em profundidade): bloqueia UPDATE/DELETE mesmo a
-- service_role. Spec §6.6 "audit log imutável".
create or replace function public.admin_audit_log_immutable()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only';
end;
$$;

drop trigger if exists admin_audit_log_no_update on public.admin_audit_log;
create trigger admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- 4. View de leitura para admin-list-tenants (deriva preço efectivo e atraso)
-- ---------------------------------------------------------------------------
create or replace view public.admin_tenant_overview as
select
  r.id,
  r.name,
  r.status,
  r.plan_code,
  p.base_price_cents,
  -- Preço efectivo: override válido > intro dentro da janela > base.
  -- Âncora do intro = coalesce(activated_at, created_at): conta a partir do
  -- início comercial (1ª activação), não da criação do registo.
  -- Planos Nostos não têm componente variável (unit_price_cents null), logo
  -- não há metering on-read nesta migration.
  case
    when r.price_override_cents is not null
         and (r.override_until is null or r.override_until >= current_date)
      then r.price_override_cents
    when p.intro_price_cents is not null and p.intro_months is not null
         and coalesce(r.activated_at, r.created_at) + make_interval(months => p.intro_months) > now()
      then p.intro_price_cents
    else p.base_price_cents
  end as effective_price_cents,
  r.override_reason_code as override_reason,
  (select count(*) from public.restaurant_members m where m.restaurant_id = r.id) as user_count,
  r.created_at,
  r.paid_until,
  r.is_demo,
  (r.status = 'active' and r.paid_until is not null and r.paid_until < current_date) as is_overdue
from public.restaurants r
left join public.product_plans p on p.code = r.plan_code;

-- Segurança: a view corre com os direitos do dono (postgres) e ignora a RLS
-- das tabelas base. Sem isto, PostgREST expõe-na a anon/authenticated. As edge
-- functions usam service_role (BYPASSRLS), que não depende destes GRANTs.
revoke all on public.admin_tenant_overview from anon, authenticated;
