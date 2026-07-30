-- 0022 — Módulo take-away v1 (spec Roles §3) + decisão de canais (David 30-07).
--
-- Fronteiras da spec respeitadas no schema:
--   ARMADILHA 1 — v1 SEM pagamento online (paga ao levantar; total é informativo).
--   ARMADILHA 2 — o take-away NÃO abate stock (zero triggers de stock a partir
--   de orders; o abate é do fecho SAF-T, fonte única de verdade).
--
-- Decisão de canais (30-07): SMS fora, email é o único canal garantido até a
-- Meta aprovar o WhatsApp. Consequência no schema: orders.email NOT NULL, e o
-- public_create_reservation passa a EXIGIR email (quebra chamadas com email
-- vazio — intencional; os forms públicos passam a exigir email no mesmo ciclo).

-- ── 1) Opt-in por restaurante ────────────────────────────────────────────────
alter table public.restaurants
  add column if not exists takeaway_enabled boolean not null default false;

-- ── 2) Encomendas ────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_name text not null,
  phone         text not null,
  email         text not null,               -- canal garantido (decisão 30-07)
  pickup_at     timestamptz,
  status        text not null default 'recebida'
    check (status in ('recebida','aceite','pronta','levantada','recusada')),
  note          text,
  total_cents   int not null default 0,       -- informativo (paga ao levantar)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orders_restaurant_status_idx
  on public.orders(restaurant_id, status, created_at);

create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id  uuid references public.menu_items(id) on delete set null,
  variant_id    uuid references public.menu_item_variants(id) on delete set null,
  qty           int  not null check (qty > 0),
  price_cents   int  not null check (price_cents >= 0),  -- snapshot do servidor
  name          text not null                            -- snapshot ("Prato · dose")
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- Guarda multi-tenant (padrão supplier_aliases/menu_variants): a linha, a
-- encomenda, o item e a variante têm de ser do MESMO restaurante; a variante
-- tem de pertencer ao item. A FK não passa pela RLS, logo sem isto um membro
-- podia coser linhas de outro tenant.
create or replace function public.order_item_tenant_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.orders o
     where o.id = new.order_id and o.restaurant_id = new.restaurant_id
  ) then
    raise exception 'encomenda_de_outro_restaurante';
  end if;
  if new.menu_item_id is not null and not exists (
    select 1 from public.menu_items i
     where i.id = new.menu_item_id and i.restaurant_id = new.restaurant_id
  ) then
    raise exception 'item_de_outro_restaurante';
  end if;
  if new.variant_id is not null and not exists (
    select 1 from public.menu_item_variants v
     where v.id = new.variant_id and v.restaurant_id = new.restaurant_id
       and v.item_id = new.menu_item_id
  ) then
    raise exception 'variante_de_outro_item';
  end if;
  return new;
end $$;

create trigger order_items_tenant_guard
  before insert or update on public.order_items
  for each row execute function public.order_item_tenant_guard();

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Membros gerem as encomendas do seu restaurante; o anónimo NÃO toca em nada
-- directamente (submete só via submit_takeaway_order, security definer).
create policy orders_member_all on public.orders
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy order_items_member_all on public.order_items
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- ── 3) RPC pública do menu: expõe o id da variante ───────────────────────────
-- O take-away precisa de referenciar a dose escolhida por id (o carrinho manda
-- variant_id; o servidor fixa o preço dessa variante). O id é aditivo no jsonb
-- (sem mudar a assinatura de saída), retrocompatível com os consumidores do /m.
create or replace function public.public_menu_by_slug(p_slug text)
returns table (
  category_id      uuid,
  category_label   text,
  category_sort    int,
  item_id          uuid,
  item_name        text,
  item_description text,
  price_cents      int,
  price_type       text,
  serves           int,
  allergens        text[],
  variants         jsonb,
  item_sort        int,
  available        boolean,
  by_order         boolean,
  kind             text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.label, c.sort_order,
         i.id, i.name, i.description,
         i.price_cents, i.price_type, i.serves, i.allergens,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id',          v.id,
                    'label',       v.label,
                    'price_cents', v.price_cents,
                    'unit',        v.unit,
                    'serves',      v.serves)
                    order by v.sort_order)
           from public.menu_item_variants v where v.item_id = i.id
         ), '[]'::jsonb),
         i.sort_order, i.available, i.by_order, i.kind
  from public.restaurants r
  join public.menu_categories c on c.restaurant_id = r.id and c.active
  left join public.menu_items i on i.category_id = c.id and i.active
    and (i.kind = 'standard' or i.service_date = (now() at time zone 'Europe/Lisbon')::date)
  where r.slug = p_slug
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$$;
grant execute on function public.public_menu_by_slug(text) to anon, authenticated;

-- ── 4) Submissão pública de encomenda ────────────────────────────────────────
-- security definer: o anónimo nunca escreve directo em orders. Preço é SEMPRE
-- snapshot do servidor (nunca do cliente). Só itens activos, fixed/variants;
-- market e by_order rejeitados. Email obrigatório (decisão de canais 30-07).
create or replace function public.submit_takeaway_order(
  p_slug text,
  p_customer_name text,
  p_phone text,
  p_email text,
  p_pickup_at timestamptz,
  p_note text,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rest        public.restaurants%rowtype;
  v_email_norm  text := lower(trim(coalesce(p_email, '')));
  v_order_id    uuid;
  v_item        jsonb;
  v_menu_item   public.menu_items%rowtype;
  v_variant     public.menu_item_variants%rowtype;
  v_qty         int;
  v_price       int;
  v_name        text;
  v_variant_id  uuid;
  v_total       int := 0;
begin
  select * into v_rest from public.restaurants where slug = p_slug;
  if not found then raise exception 'restaurante_invalido'; end if;
  if not v_rest.takeaway_enabled then raise exception 'takeaway_desligado'; end if;

  if length(trim(coalesce(p_customer_name, ''))) < 2 then raise exception 'dados_invalidos'; end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then raise exception 'dados_invalidos'; end if;
  if v_email_norm = '' or v_email_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  if p_pickup_at is null then raise exception 'hora_invalida'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'sem_itens';
  end if;

  -- Anti-abuso (mesma família do booking): teto de encomendas activas por
  -- telefone/restaurante nas últimas 24h.
  if (select count(*) from public.orders
       where restaurant_id = v_rest.id and phone = p_phone
         and status in ('recebida','aceite','pronta')
         and created_at > now() - interval '24 hours') >= 8 then
    raise exception 'limite_atingido';
  end if;

  insert into public.orders (restaurant_id, customer_name, phone, email, pickup_at, note, total_cents, status)
  values (v_rest.id, trim(p_customer_name), trim(p_phone), v_email_norm, p_pickup_at,
          nullif(trim(coalesce(p_note, '')), ''), 0, 'recebida')
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    if v_qty < 1 then raise exception 'qty_invalida'; end if;

    select * into v_menu_item from public.menu_items
     where id = (v_item->>'menu_item_id')::uuid and restaurant_id = v_rest.id and active;
    if not found or v_menu_item.available is not true then raise exception 'item_indisponivel'; end if;
    if v_menu_item.by_order then raise exception 'item_nao_encomendavel'; end if;

    if v_menu_item.price_type = 'fixed' then
      if v_menu_item.price_cents is null then raise exception 'item_sem_preco'; end if;
      v_price := v_menu_item.price_cents;
      v_name := v_menu_item.name;
      v_variant_id := null;
    elsif v_menu_item.price_type = 'variants' then
      if (v_item->>'variant_id') is null then raise exception 'variante_obrigatoria'; end if;
      select * into v_variant from public.menu_item_variants
       where id = (v_item->>'variant_id')::uuid and item_id = v_menu_item.id and price_cents is not null;
      if not found then raise exception 'variante_invalida'; end if;
      v_price := v_variant.price_cents;
      v_name := v_menu_item.name || ' · ' || v_variant.label;
      v_variant_id := v_variant.id;
    else
      -- market e per_kg não se auto-encomendam no v1
      raise exception 'item_nao_encomendavel';
    end if;

    insert into public.order_items (order_id, restaurant_id, menu_item_id, variant_id, qty, price_cents, name)
    values (v_order_id, v_rest.id, v_menu_item.id, v_variant_id, v_qty, v_price, v_name);
    v_total := v_total + v_price * v_qty;
  end loop;

  update public.orders set total_cents = v_total where id = v_order_id;
  return v_order_id;
end $$;
grant execute on function public.submit_takeaway_order(text, text, text, text, timestamptz, text, jsonb) to anon, authenticated;

-- ── 5) Transição de estado (staff) ───────────────────────────────────────────
-- security invoker: corre sob a RLS de orders (member-all), logo só um membro
-- do restaurante avança as suas encomendas. Só transições válidas. "pronta" NÃO
-- manda mensagem daqui — é o frontend que chama a edge (best-effort), como nas
-- reservas.
create or replace function public.advance_order(
  p_order_id uuid, p_status text, p_note text default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_current text;
  v_ok boolean;
begin
  select status into v_current from public.orders where id = p_order_id;
  if not found then raise exception 'encomenda_invalida'; end if;

  v_ok := (v_current = 'recebida' and p_status in ('aceite','recusada'))
       or (v_current = 'aceite'   and p_status in ('pronta','recusada'))
       or (v_current = 'pronta'   and p_status = 'levantada');
  if not v_ok then raise exception 'transicao_invalida'; end if;

  update public.orders
     set status = p_status,
         note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note)
   where id = p_order_id;
end $$;
grant execute on function public.advance_order(uuid, text, text) to authenticated;

-- ── 6) Reservas: email obrigatório (decisão de canais 30-07) ──────────────────
-- Sem mexer no schema de reservations (não tem email; p_email cai em
-- customers.email nullable). Endurece o public_create_reservation para REJEITAR
-- email nulo/vazio. Quebra chamadas antigas com email vazio — intencional; o
-- form público passa a exigir email no mesmo ciclo (PR).
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
  -- Email obrigatório e plausível (canal garantido até o WhatsApp aprovar).
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_obrigatorio';
  end if;

  if (select count(*) from public.reservations
       where restaurant_id = v_rest.id and customer_phone = p_phone
         and service_date = p_service_date and status = 'pendente') >= 3 then
    raise exception 'limite_atingido';
  end if;

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
