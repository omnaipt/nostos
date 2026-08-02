-- 0026 — A página de reserva no idioma do cliente.
--
-- Decisão do David (02-08-2026): quem lê a ementa em francês e carrega em
-- "Réserver une table" não pode cair numa página em português. O idioma
-- atravessa a porta com o cliente.
--
-- Três peças:
--
-- 1. TURNOS TRADUZÍVEIS. "Almoço 12:30" não diz nada a um francês, e o turno é
--    a escolha central da reserva. Reutiliza-se `menu_translations` com um
--    `entity_type` novo em vez de criar uma tabela para três linhas por casa.
--
-- 2. `public_turns_for_date` passa a aceitar idioma, com o mesmo padrão da
--    0025: default 'pt' e fallback ao rótulo original quando não há tradução
--    validada, para a app já publicada não partir.
--
-- 3. `reservations.lang`. O idioma em que o cliente reservou é informação que
--    só existe naquele momento: se não for guardada ali, perde-se para sempre.
--    Serve a confirmação (hoje ainda em português) e serve o dono, que passa a
--    saber em que língua falar com quem chega.

alter table public.menu_translations
  drop constraint if exists menu_translations_entity_type_check;

alter table public.menu_translations
  add constraint menu_translations_entity_type_check
  check (entity_type in ('item', 'category', 'variant', 'turn'));

comment on column public.menu_translations.entity_type is
  'item, category, variant (menu) ou turn (turnos, para a página de reserva). O nome da tabela ficou curto para o que ela guarda; renomear custava mais do que vale.';

alter table public.reservations
  add column if not exists lang text not null default 'pt'
  check (lang in ('pt', 'en', 'es', 'fr'));

comment on column public.reservations.lang is
  'Idioma em que o cliente fez a reserva. Usado para lhe falar na mesma língua na confirmação e no acolhimento.';

-- ---------------------------------------------------------------------------

drop function if exists public.public_turns_for_date(text, date);

create or replace function public.public_turns_for_date(
  p_slug text,
  p_date date,
  p_lang text default 'pt'
)
returns table (id uuid, label text, start_time text, service text)
language sql stable security definer set search_path to 'public' as $function$
  select t.id,
         coalesce(tr.name, t.label),
         t.start_time::text,
         t.service
  from public.turns t
  join public.restaurants r on r.id = t.restaurant_id
  left join public.menu_translations tr
    on tr.restaurant_id = r.id
   and tr.entity_type = 'turn'
   and tr.entity_id = t.id
   and tr.lang = p_lang
   and tr.status = 'validada'
  where r.slug = p_slug
    and t.active
    and extract(isodow from p_date)::int = any (t.weekdays)
  order by t.start_time;
$function$;

grant execute on function public.public_turns_for_date(text, date, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Criação de reserva com idioma. Novo parâmetro no fim e com default, portanto
-- a app publicada continua a chamar com 8 argumentos sem partir.

drop function if exists public.public_create_reservation(text, date, uuid, text, text, text, integer, text);

create or replace function public.public_create_reservation(
  p_slug text,
  p_service_date date,
  p_turn_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_party_size integer,
  p_notes text,
  p_lang text default 'pt'
)
returns uuid
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_rest public.restaurants%rowtype;
  v_turn public.turns%rowtype;
  v_customer_id uuid;
  v_reservation_id uuid;
  v_today date;
  v_reserved_at timestamptz;
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_lang text := case when p_lang in ('pt','en','es','fr') then p_lang else 'pt' end;
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
    party_size, turn_id, table_id, service_date, reserved_at, status, notes, lang
  ) values (
    v_rest.id, v_customer_id, trim(p_name), p_phone,
    p_party_size, v_turn.id, null, p_service_date, v_reserved_at, 'pendente',
    nullif(trim(coalesce(p_notes, '')), ''), v_lang
  ) returning id into v_reservation_id;

  return v_reservation_id;
end $function$;

grant execute on function public.public_create_reservation(text, date, uuid, text, text, text, integer, text, text) to anon, authenticated;
