-- Histórico de vendas da demo "Lota do Cais" (Estatísticas v0, 02-08-2026).
--
-- PORQUÊ EXISTE: o ecrã /estatisticas precisa de meses de vendas para mostrar
-- alguma coisa, e o tenant demo tinha 0 lotes SAF-T de propósito (o upload ao
-- vivo é o clímax do acto 7 do guião). Este script cria o histórico SEM tocar
-- em stock nenhum.
--
-- COMO NÃO PARTE A DEMO: os lotes entram com `apply_stock = false` (0024) e as
-- linhas são inseridas directamente, sem passar pelo apply da edge. Nenhum
-- `stock_movement` é criado. O estado sagrado (polvo 12 kg, coentros 14, 72
-- movimentos, 0 movimentos de origem saft_import) fica exactamente como está.
-- É também o comportamento correcto do produto: um SAF-T histórico que um
-- cliente traz no onboarding não pode abater a despensa de hoje.
--
-- REPRODUTÍVEL: sem `random()`. Toda a variação vem de `hashtext` sobre a
-- chave do par, portanto correr duas vezes dá o mesmo resultado.
--   (Nota de quem passou por lá: a primeira versão usava
--    `join pesos on random() < prob`. O planeador avaliou o random() uma vez
--    por linha de pesos em vez de por par, e quatro pratos diferentes saíram
--    com exactamente 578 unidades. Não usar random() em condições de junção.)
--
-- DATAS RELATIVAS: gera os últimos 6 meses a contar de hoje. Correr outra vez
-- antes de cada demonstração para os dados não envelhecerem.
--
-- Correr com o restaurante certo em `r`. O slug da demo é `lota-do-cais-demo`.

begin;

with r as (select id from restaurants where slug = 'lota-do-cais-demo')
delete from saft_imports
 where restaurant_id = (select id from r)
   and filename like 'historico-demo-%';

insert into saft_imports (restaurant_id, filename, period_start, period_end,
                          status, apply_stock, applied_at)
select (select id from restaurants where slug = 'lota-do-cais-demo'),
       'historico-demo-' || to_char(m, 'YYYY-MM') || '.xml',
       m::date,
       (m + interval '1 month - 1 day')::date,
       'applied', false, now()
  from generate_series(
         date_trunc('month', current_date - interval '6 months'),
         date_trunc('month', current_date),
         interval '1 month') m;

with r as (select id from restaurants where slug = 'lota-do-cais-demo'),
-- Probabilidade de cada código POS entrar num documento (~5,2 linhas/doc).
pesos(pos_code, prob, qkind) as (values
  ('101',0.92,'pao'), ('110',0.18,'un'), ('102',0.06,'un'), ('103',0.07,'un'),
  ('111',0.08,'un'), ('201',0.22,'un'), ('204',0.10,'un'), ('202',0.07,'kg'),
  ('210',0.05,'un'), ('211',0.02,'un'), ('301',0.30,'un'), ('302',0.10,'un'),
  ('303',0.11,'un'), ('304',0.07,'un'), ('402',0.20,'un'), ('403',0.16,'un'),
  ('404',0.09,'un'), ('405',0.10,'un'), ('501',0.07,'un'), ('502',0.06,'un'),
  ('601',0.05,'un'), ('602',0.06,'un'), ('603',0.16,'bebida'), ('604',0.13,'bebida'),
  ('605',0.07,'un'), ('701',0.55,'bebida'), ('702',0.30,'bebida'),
  ('801',0.62,'cafe'), ('901',0.10,'un'), ('902',0.11,'un'), ('802',0.05,'un')
),
precos as (
  select p.pos_code, p.pos_description, p.menu_item_id,
         coalesce(m.price_cents,
                  (select v.price_cents from menu_item_variants v
                    where v.item_id = m.id and v.is_default limit 1),
                  (select v.price_cents from menu_item_variants v
                    where v.item_id = m.id order by v.sort_order limit 1),
                  0) as price_cents
    from pos_product_map p
    join menu_items m on m.id = p.menu_item_id
   where p.restaurant_id = (select id from r)
),
dias as (
  -- Factor de época: uma marisqueira enche no Verão. Sem isto os seis meses
  -- ficam planos e a pergunta "o que mudou em 3 meses" não tem resposta.
  select d::date as dia,
         extract(isodow from d)::int as dow,
         (case extract(month from d)::int
            when 1 then 0.80 when 2 then 0.82 when 3 then 0.88 when 4 then 0.95
            when 5 then 1.00 when 6 then 1.10 when 7 then 1.24 when 8 then 1.24
            when 9 then 1.10 when 10 then 0.98 when 11 then 0.88 else 0.95
          end)::numeric as f
    from generate_series(date_trunc('month', current_date - interval '6 months'),
                         current_date - interval '1 day', interval '1 day') d
),
docs as (
  select row_number() over (order by dias.dia, t.start_time, g) as seq,
         dias.dia, t.id as turn_id, t.start_time
    from dias
    join turns t
      on t.restaurant_id = (select id from r) and t.active
     and dias.dow = any (t.weekdays)
   cross join lateral generate_series(1, greatest(1, round(dias.f *
         (case
            when t.start_time = time '12:30' then case when dias.dow in (6,7) then 12 else 5 end
            when t.start_time = time '19:30' then case when dias.dow in (6,7) then 16 else 8 end
            else 7
          end))::int + ((hashtext(dias.dia::text || t.id::text) % 5 + 5) % 5 - 2))) g
),
stamped as (
  select seq, dia, turn_id,
         (dia + start_time
              + (((hashtext('m' || seq::text) % 105 + 105) % 105) || ' minutes')::interval) as at_local
    from docs
),
linhas as (
  select s.seq, s.dia, s.at_local, pr.menu_item_id, pr.pos_code, pr.pos_description,
         case w.qkind
           when 'pao'    then 2 + ((hashtext('q'||s.seq::text||w.pos_code) % 3 + 3) % 3)
           when 'kg'     then round(0.3 + ((hashtext('q'||s.seq::text||w.pos_code) % 350 + 350) % 350) / 1000.0, 3)
           when 'bebida' then 1 + ((hashtext('q'||s.seq::text||w.pos_code) % 2 + 2) % 2)
           when 'cafe'   then 1 + ((hashtext('q'||s.seq::text||w.pos_code) % 3 + 3) % 3)
           else 1
         end::numeric as qty,
         pr.price_cents
    from stamped s
   cross join pesos w
    join precos pr on pr.pos_code = w.pos_code
   where ((hashtext(s.seq::text || ':' || w.pos_code) % 100000) + 100000) % 100000
         < (w.prob * 100000)::int
)
insert into saft_import_lines (restaurant_id, import_id, invoice_no, invoice_date,
                               invoice_at, pos_code, pos_description, qty,
                               unit_price_cents, menu_item_id, status)
select (select id from r), i.id,
       'FT DEMO/' || to_char(l.dia,'YYYY') || '/' || lpad(l.seq::text, 5, '0'),
       l.dia, l.at_local, l.pos_code, l.pos_description, l.qty,
       l.price_cents, l.menu_item_id, 'matched'
  from linhas l
  join saft_imports i
    on i.restaurant_id = (select id from r)
   and i.filename = 'historico-demo-' || to_char(l.dia, 'YYYY-MM') || '.xml';

update saft_imports i
   set invoices_count = x.docs, lines_count = x.linhas,
       matched_count = x.linhas, unmatched_count = 0, gross_total_cents = x.bruto
  from (select import_id, count(distinct invoice_no) docs, count(*) linhas,
               sum(qty*unit_price_cents)::bigint bruto
          from saft_import_lines group by import_id) x
 where i.id = x.import_id
   and i.filename like 'historico-demo-%';

commit;

-- Verificação obrigatória depois de correr: o estado sagrado tem de estar intacto.
-- select round(stock_qty,3) from ingredients where name ilike '%polvo%';  -- 12.000
-- select count(*) from stock_movements where source = 'saft_import';      -- 0
