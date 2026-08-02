-- 0024 — Estatísticas v0 ("o pulso da casa").
-- Spec: Claude_memory/working/nostos-demo/Spec_Modulo_Estatistico.md (02-08-2026).
--
-- Três coisas, por esta ordem de importância:
--
-- 1. `invoice_at`: a HORA do documento. A 0012 guardava só `invoice_date::date`
--    e deitava a hora fora. Sem hora não há corte almoço/jantar, que foi o
--    primeiro filtro pedido pelo dono d'O Rochedo. Os lotes anteriores ficam
--    com null e são contados à parte em vez de mentirem por omissão.
--
--    É `timestamp` SEM fuso de propósito: o SystemEntryDate do SAF-T é hora
--    local do POS e não traz offset nenhum. Converter para UTC seria inventar
--    informação que o ficheiro não tem. Guarda-se a hora da casa, que é
--    exactamente contra o que se compara (os turnos também são hora local).
--
-- 2. `apply_stock`: um SAF-T histórico (os 12 meses que um cliente traz no dia
--    do onboarding) serve para ANÁLISE. Abater stock retroactivamente com ele
--    seria absurdo: o peixe de Março já foi cozinhado. O apply respeita a flag.
--
-- 3. `turn_local` + `sales_lines` + `sales_by_item` + `sales_summary`:
--    agregação pelos TURNOS DA CASA e não por horas fixas. Almoço e jantar são
--    o que cada restaurante disser que são; a Lota do Cais tem 2º turno só à
--    sexta e ao sábado. Reutiliza `turns`, que já existe e já está configurado.
--
-- Tudo security INVOKER (default): a RLS das tabelas de base é que isola o
-- tenant. Nenhuma função abaixo vê linhas que o utilizador não veria à mão.

-- ---------------------------------------------------------------- 1 e 2

alter table public.saft_import_lines
  add column if not exists invoice_at timestamp;

create index if not exists saft_import_lines_restaurant_invoice_at_idx
  on public.saft_import_lines (restaurant_id, invoice_at);

alter table public.saft_imports
  add column if not exists apply_stock boolean not null default true;

comment on column public.saft_import_lines.invoice_at is
  'Data e hora LOCAL do documento (SAF-T SystemEntryDate). Sem fuso: o SAF-T não o traz. Null nos lotes anteriores à 0024, que ficam fora dos cortes por refeição e são reportados como tal.';

comment on column public.saft_imports.apply_stock is
  'false = lote histórico, importado só para estatística; o apply não gera movimentos de stock. Default true mantém o comportamento do fecho do dia.';

-- ---------------------------------------------------------------- 3

-- Turno da casa a que pertence um instante LOCAL. Regra: o turno activo desse
-- dia da semana cuja start_time é a mais recente anterior à hora. Uma venda
-- antes do primeiro turno (o café das 10h) cai no primeiro turno do dia em vez
-- de ficar órfã.
create or replace function public.turn_local(p_restaurant uuid, p_local timestamp)
returns uuid
language sql stable set search_path = public as $$
  select t.id
    from public.turns t
   where t.restaurant_id = p_restaurant
     and t.active
     and extract(isodow from p_local)::int = any (t.weekdays)
   order by (t.start_time <= p_local::time) desc,
            (case when t.start_time <= p_local::time then t.start_time end) desc nulls last,
            t.start_time asc
   limit 1;
$$;

-- Linhas de venda das DUAS fontes, normalizadas para hora local da casa:
--   saft  = vendas de sala (retrovisor, ao ritmo do export do POS)
--   order = take-away e balcão (tempo real, nascem dentro do Nostos)
-- `mapped` diz se a linha está associada a um prato da ementa. É o que sustenta
-- o indicador de cobertura: sem ele os totais por prato mentem em silêncio.
create or replace function public.sales_lines(
  p_restaurant uuid,
  p_from       date,
  p_to         date
)
returns table (
  sold_at      timestamp,
  service_date date,
  turn_id      uuid,
  weekday      int,
  menu_item_id uuid,
  qty          numeric,
  gross_cents  bigint,
  doc_ref      text,
  mapped       boolean,
  source       text
)
language sql stable set search_path = public as $$
  with tz as (
    select coalesce(
             (select r.timezone from public.restaurants r where r.id = p_restaurant),
             'Europe/Lisbon') as t
  ),
  u as (
    select
      l.invoice_at                                        as at_local,
      coalesce(l.invoice_at::date, l.invoice_date)        as sdate,
      case when l.invoice_at is null then null
           else public.turn_local(p_restaurant, l.invoice_at) end as tid,
      l.menu_item_id                                      as item,
      l.qty                                               as q,
      (l.qty * coalesce(l.unit_price_cents, 0))::bigint   as gross,
      l.invoice_no                                        as doc,
      (l.status = 'matched' and l.menu_item_id is not null) as ok,
      'saft'::text                                        as src
    from public.saft_import_lines l
    join public.saft_imports i on i.id = l.import_id
    where l.restaurant_id = p_restaurant
      and i.status = 'applied'
      and l.status <> 'ignored'
      and coalesce(l.invoice_at::date, l.invoice_date) between p_from and p_to

    union all

    select
      (o.created_at at time zone (select t from tz)),
      (o.created_at at time zone (select t from tz))::date,
      public.turn_local(p_restaurant, (o.created_at at time zone (select t from tz))),
      oi.menu_item_id,
      oi.qty::numeric,
      (oi.qty * oi.price_cents)::bigint,
      o.id::text,
      (oi.menu_item_id is not null),
      'order'::text
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.restaurant_id = p_restaurant
      and o.status in ('aceite', 'pronta', 'levantada')
      and (o.created_at at time zone (select t from tz))::date between p_from and p_to
  )
  select u.at_local, u.sdate, u.tid,
         extract(isodow from u.sdate)::int,
         u.item, u.q, u.gross, u.doc, u.ok, u.src
    from u;
$$;

-- Vendas por prato. Só linhas mapeadas: um prato com nome só existe se a linha
-- souber a que prato pertence. A parte não mapeada é reportada pelo summary.
create or replace function public.sales_by_item(
  p_restaurant uuid,
  p_from       date,
  p_to         date,
  p_turns      uuid[] default null,
  p_weekdays   int[]  default null
)
returns table (
  menu_item_id uuid,
  item_name    text,
  qty          numeric,
  gross_cents  bigint,
  days         int
)
language sql stable set search_path = public as $$
  select s.menu_item_id,
         coalesce(m.name, '(prato apagado)'),
         sum(s.qty),
         sum(s.gross_cents)::bigint,
         count(distinct s.service_date)::int
    from public.sales_lines(p_restaurant, p_from, p_to) s
    left join public.menu_items m on m.id = s.menu_item_id
   where s.mapped
     and (p_turns    is null or s.turn_id = any (p_turns))
     and (p_weekdays is null or s.weekday = any (p_weekdays))
   group by s.menu_item_id, m.name;
$$;

-- Resumo do período. `gross_cents` conta TUDO (receita é receita, mapeada ou
-- não); `lines_mapped/lines_total` é a cobertura; `lines_no_time` são as linhas
-- de lotes anteriores à 0024, que não sabem a que refeição pertencem e por isso
-- desaparecem assim que se filtra por turno.
create or replace function public.sales_summary(
  p_restaurant uuid,
  p_from       date,
  p_to         date,
  p_turns      uuid[] default null,
  p_weekdays   int[]  default null
)
returns table (
  gross_cents   bigint,
  docs          int,
  units         numeric,
  days          int,
  lines_total   int,
  lines_mapped  int,
  lines_no_time int,
  first_date    date,
  last_date     date
)
language sql stable set search_path = public as $$
  with f as (
    select *
      from public.sales_lines(p_restaurant, p_from, p_to) s
     where (p_turns    is null or s.turn_id = any (p_turns))
       and (p_weekdays is null or s.weekday = any (p_weekdays))
  )
  select coalesce(sum(f.gross_cents), 0)::bigint,
         count(distinct f.doc_ref)::int,
         coalesce(sum(f.qty), 0),
         count(distinct f.service_date)::int,
         count(*)::int,
         count(*) filter (where f.mapped)::int,
         count(*) filter (where f.turn_id is null)::int,
         min(f.service_date),
         max(f.service_date)
    from f;
$$;

grant execute on function public.turn_local(uuid, timestamp)                    to authenticated;
grant execute on function public.sales_lines(uuid, date, date)                  to authenticated;
grant execute on function public.sales_by_item(uuid, date, date, uuid[], int[]) to authenticated;
grant execute on function public.sales_summary(uuid, date, date, uuid[], int[]) to authenticated;
