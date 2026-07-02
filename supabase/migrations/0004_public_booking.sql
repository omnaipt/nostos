-- 0004 — C8 (Spec v2): reservas públicas.
-- 1) slug único por restaurante (gerado por trigger quando ausente)
-- 2) RPCs security definer com superfície mínima para acesso anónimo:
--    info do restaurante, turnos aplicáveis a uma data, criação de reserva
--    PENDENTE + POR ATRIBUIR. Anónimo nunca lê reservas/clientes/mesas.

create extension if not exists unaccent;

alter table public.restaurants add column if not exists slug text unique;

create or replace function public.slugify(input text)
returns text language sql stable set search_path = public as $$
  select trim(both '-' from regexp_replace(lower(public.unaccent(coalesce(input,''))), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.set_restaurant_slug()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  base := public.slugify(new.name);
  if base = '' then base := 'restaurante'; end if;
  candidate := base;
  while exists (select 1 from public.restaurants where slug = candidate and id <> new.id) loop
    candidate := base || '-' || substr(md5(random()::text), 1, 4);
  end loop;
  new.slug := candidate;
  return new;
end $$;

create trigger restaurants_set_slug
  before insert on public.restaurants
  for each row execute function public.set_restaurant_slug();

-- Backfill dos existentes
update public.restaurants r
set slug = sub.candidate
from (
  select id,
    public.slugify(name) ||
      case when count(*) over (partition by public.slugify(name)) > 1
             or public.slugify(name) = ''
           then '-' || substr(md5(id::text), 1, 4) else '' end as candidate
  from public.restaurants where slug is null
) sub
where r.id = sub.id;

alter table public.restaurants alter column slug set not null;

-- ── RPCs públicas ────────────────────────────────────────────────────────────

create or replace function public.public_restaurant_by_slug(p_slug text)
returns table (name text, phone text, slug text)
language sql security definer stable set search_path = public as $$
  select r.name, r.phone, r.slug from public.restaurants r where r.slug = p_slug;
$$;

create or replace function public.public_turns_for_date(p_slug text, p_date date)
returns table (id uuid, label text, start_time text, service text)
language sql security definer stable set search_path = public as $$
  select t.id, t.label, t.start_time::text, t.service
  from public.turns t
  join public.restaurants r on r.id = t.restaurant_id
  where r.slug = p_slug
    and t.active
    and extract(isodow from p_date)::int = any (t.weekdays)
  order by t.start_time;
$$;

create or replace function public.public_create_reservation(
  p_slug text,
  p_service_date date,
  p_turn_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_party_size int,
  p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rest public.restaurants%rowtype;
  v_turn public.turns%rowtype;
  v_customer_id uuid;
  v_reservation_id uuid;
  v_today date;
  v_reserved_at timestamptz;
  v_email text := nullif(trim(coalesce(p_email, '')), '');
begin
  select * into v_rest from public.restaurants where slug = p_slug;
  if not found then raise exception 'restaurante_invalido'; end if;

  select * into v_turn from public.turns
   where id = p_turn_id and restaurant_id = v_rest.id and active;
  if not found then raise exception 'turno_invalido'; end if;

  if not (extract(isodow from p_service_date)::int = any (v_turn.weekdays)) then
    raise exception 'turno_nao_aplicavel';
  end if;

  v_today := (now() at time zone coalesce(v_rest.timezone, 'Europe/Lisbon'))::date;
  if p_service_date < v_today then raise exception 'data_passada'; end if;
  if p_service_date > v_today + 180 then raise exception 'data_demasiado_distante'; end if;

  if p_party_size is null or p_party_size < 1 or p_party_size > 50 then
    raise exception 'pax_invalido';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2
     or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then
    raise exception 'dados_invalidos';
  end if;

  -- Protecção de abuso: máx. 3 pendentes por telefone/dia/restaurante.
  if (select count(*) from public.reservations
       where restaurant_id = v_rest.id and customer_phone = p_phone
         and service_date = p_service_date and status = 'pendente') >= 3 then
    raise exception 'limite_atingido';
  end if;

  -- Upsert do cliente por telefone (mesma semântica do fluxo staff, C6).
  select id into v_customer_id from public.customers
   where restaurant_id = v_rest.id and phone = p_phone;
  if v_customer_id is null then
    begin
      insert into public.customers (restaurant_id, name, phone, email)
      values (v_rest.id, trim(p_name), p_phone, v_email)
      returning id into v_customer_id;
    exception when unique_violation then
      select id into v_customer_id from public.customers
       where restaurant_id = v_rest.id and phone = p_phone;
    end;
  else
    update public.customers
       set name = trim(p_name), email = coalesce(v_email, email)
     where id = v_customer_id;
  end if;

  v_reserved_at := ((p_service_date::text || ' ' || v_turn.start_time::text)::timestamp)
                   at time zone coalesce(v_rest.timezone, 'Europe/Lisbon');

  insert into public.reservations (
    restaurant_id, customer_id, customer_name, customer_phone,
    party_size, turn_id, table_id, service_date, reserved_at, status, notes
  ) values (
    v_rest.id, v_customer_id, trim(p_name), p_phone,
    p_party_size, v_turn.id, null, p_service_date, v_reserved_at, 'pendente',
    nullif(trim(coalesce(p_notes, '')), '')
  ) returning id into v_reservation_id;

  return v_reservation_id;
end $$;
