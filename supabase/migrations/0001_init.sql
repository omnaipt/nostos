-- STOA · Esquema inicial (multi-tenant, vertical Restaurantes)
-- Cada restaurante é um tenant isolado por RLS.
-- A coluna restaurants.vertical fica preparada para futuras verticais
-- sem reescrever o esquema (default 'restaurante').
--
-- FASE 1: gestão real de mesas (tables) e turnos (turns).
-- A lotação única foi removida; a capacidade resulta da soma dos lugares
-- das mesas e o horário de serviço resulta dos turnos.
-- Disponibilidade Fase 1 (calculada na aplicação, sem duração):
--   uma mesa está livre num (date, turn) se não houver reserva atribuída
--   a essa mesa nesse date + turn. O cálculo por duração fica para a Fase 2.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  vertical text not null default 'restaurante',
  timezone text not null default 'Europe/Lisbon',
  -- Contacto recolhido no onboarding (F1). NÃO duplicamos aqui capacidade
  -- nem horário: capacidade vem de public.tables, horário vem de public.turns.
  email text,
  phone text,
  -- Default operacional recolhido no onboarding; só passa a ter efeito de
  -- cálculo na Fase 2 (disponibilidade por duração). Guardado já para não
  -- perder o input do form de onboarding.
  default_duration_min int not null default 120
    check (default_duration_min between 30 and 360),
  -- Modo de atribuição de mesa do tenant. Ciclo de vida: cada restaurante
  -- arranca SEMPRE em 'manual'; passa a 'auto' só quando tiver dados
  -- suficientes. A Fase 2 é que vira o flag e define o critério (sem lógica
  -- automática nesta fase: aqui é só o campo).
  assignment_mode text not null default 'manual'
    check (assignment_mode in ('manual','auto')),
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_members (
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);

-- ── Mesas (capacidade real do restaurante) ─────────────────────────────────
create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label text not null,
  seats int not null check (seats > 0),
  combinable boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Label de mesa único por restaurante (case-insensitive).
create unique index if not exists tables_restaurant_label_uidx
  on public.tables (restaurant_id, lower(label));
create index if not exists tables_restaurant_idx
  on public.tables (restaurant_id);

-- ── Turnos / serviços (horário de serviço do restaurante) ──────────────────
create table if not exists public.turns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  label text not null,
  -- Categoria de serviço do turno: texto livre e OPCIONAL (almoço, jantar,
  -- brunch, lanche, etc.). Sem enum nem CHECK de valores: a taxonomia é
  -- configurável por restaurante. label e start_time é que são obrigatórios.
  service text,
  start_time time not null,
  -- Dias da semana ISO-8601: 1 = Segunda ... 7 = Domingo.
  -- int[] (não bitmask) por legibilidade e por o Postgres validar/indexar bem
  -- arrays; CHECK garante array não vazio e cada elemento no intervalo 1..7.
  weekdays int[] not null
    check (
      array_length(weekdays, 1) >= 1
      and weekdays <@ array[1,2,3,4,5,6,7]
    ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Label de turno único por restaurante (case-insensitive).
create unique index if not exists turns_restaurant_label_uidx
  on public.turns (restaurant_id, lower(label));
create index if not exists turns_restaurant_idx
  on public.turns (restaurant_id);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customers_restaurant_idx on public.customers (restaurant_id);
-- Match de cliente por telefone dentro do restaurante (F4): um telefone
-- identifica no máximo um customer por tenant. Índice parcial (ignora nulos).
create unique index if not exists customers_restaurant_phone_uidx
  on public.customers (restaurant_id, phone)
  where phone is not null;

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  -- Atribuição Fase 1 (nullable: reserva pode existir sem mesa/turno atribuídos).
  table_id uuid references public.tables (id) on delete set null,
  turn_id uuid references public.turns (id) on delete set null,
  customer_name text not null,
  customer_phone text,
  party_size int not null check (party_size > 0),
  -- Hora exacta da reserva (exibição e ordenação).
  reserved_at timestamptz not null,
  -- Data LÓGICA do serviço (dia de calendário no fuso do restaurante,
  -- derivada de reserved_at pela aplicação no momento da criação). É a
  -- unidade de disponibilidade da Fase 1 junto com turn_id, e mantém o
  -- índice de unicidade IMMUTABLE (evita reserved_at::date, que depende
  -- do TimeZone da sessão).
  --
  -- CONTRATO service_date (FROZEN): a APP é a fonte de verdade. Calcula
  -- service_date a partir de reserved_at no fuso do restaurante
  -- (restaurants.timezone, ex.: Europe/Lisbon) no momento da criação/edição.
  -- O default UTC abaixo é APENAS fallback de segurança para inserts que
  -- não passem o valor; NÃO é o comportamento correcto para o produto
  -- (perto da meia-noite a data UTC diverge da data local). Tem de ser
  -- ENFORCED no wiring da aplicação (Zé rework PR #11 → Marco #4): nenhuma
  -- escrita de reserva deve depender deste default.
  service_date date not null default (now() at time zone 'UTC')::date,
  status text not null default 'confirmada'
    check (status in ('pendente','confirmada','sentada','cancelada','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  -- Integridade de atribuição: uma mesa NUNCA é atribuída sem turno.
  -- O índice único parcial (reservations_table_slot_uidx) NÃO protege o caso
  -- table_id preenchido + turn_id null, porque NULL é distinto em índice único
  -- (duas reservas na mesma mesa com turn_id null não colidiriam). Este CHECK
  -- fecha esse buraco: se há mesa, tem de haver turno. O inverso é livre
  -- (turno sem mesa = reserva por atribuir, caso válido da Fase 1).
  constraint reservations_table_requires_turn
    check (table_id is null or turn_id is not null)
);
create index if not exists reservations_restaurant_time_idx
  on public.reservations (restaurant_id, reserved_at);
-- Suporta a query de disponibilidade Fase 1: dado (restaurant_id, data, turno),
-- que mesas já estão ocupadas. A unidade de disponibilidade é (date, turn_id).
create index if not exists reservations_availability_idx
  on public.reservations (restaurant_id, service_date, turn_id, table_id);
-- Unicidade de atribuição: uma mesa não pode ter 2 reservas activas
-- (status != cancelada) no mesmo (service_date, turno).
-- Índice PARCIAL: ignora reservas sem mesa (table_id null) e canceladas,
-- portanto reservas "por atribuir" (table_id null) NÃO colidem entre si.
create unique index if not exists reservations_table_slot_uidx
  on public.reservations (restaurant_id, service_date, turn_id, table_id)
  where table_id is not null and status <> 'cancelada';

create or replace function public.is_restaurant_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.restaurant_id = target and m.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.tables enable row level security;
alter table public.turns enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_upsert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid());

create policy restaurants_member_select on public.restaurants
  for select using (public.is_restaurant_member(id));
create policy restaurants_owner_insert on public.restaurants
  for insert with check (owner_id = auth.uid());
create policy restaurants_member_update on public.restaurants
  for update using (public.is_restaurant_member(id));

create policy members_select on public.restaurant_members
  for select using (public.is_restaurant_member(restaurant_id));
create policy members_insert on public.restaurant_members
  for insert with check (
    exists (select 1 from public.restaurants r
            where r.id = restaurant_id and r.owner_id = auth.uid())
  );

create policy tables_member_all on public.tables
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy turns_member_all on public.turns
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy customers_member_all on public.customers
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

create policy reservations_member_all on public.reservations
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

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
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
