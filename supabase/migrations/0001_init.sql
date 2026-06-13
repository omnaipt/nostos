-- STOA · Esquema inicial (multi-tenant, vertical Restaurantes)
-- Cada restaurante é um tenant isolado por RLS.
-- A coluna restaurants.vertical fica preparada para futuras verticais
-- sem reescrever o esquema (default 'restaurante').

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

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null,
  customer_phone text,
  party_size int not null check (party_size > 0),
  reserved_at timestamptz not null,
  status text not null default 'confirmada' check (status in ('pendente','confirmada','sentada','cancelada','no_show')),
  table_label text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists reservations_restaurant_time_idx on public.reservations (restaurant_id, reserved_at);

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
