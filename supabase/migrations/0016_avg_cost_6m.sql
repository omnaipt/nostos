-- 0016 — Custo médio ponderado a 6 meses (Gap C, decisão David 29-07).
-- Substitui o "último custo" da 0011: o custo corrente do ingrediente passa a
-- ser a média das compras (stock_movements kind=purchase com custo) PONDERADA
-- pela quantidade, numa janela de 6 meses. Com uma só compra, média = último —
-- nada muda até haver segunda compra. O food cost das fichas (0006) consome
-- ingredients.cost_per_unit_cents e apanha a média de borla.

create or replace function public.ingredient_avg_cost(p_ingredient_id uuid)
returns numeric
language sql stable set search_path = public as $$
  select sum(qty * cost_per_unit_cents) / nullif(sum(qty), 0)
    from public.stock_movements
   where ingredient_id = p_ingredient_id
     and kind = 'purchase'
     and cost_per_unit_cents is not null
     and created_at >= now() - interval '6 months';
$$;

grant execute on function public.ingredient_avg_cost(uuid) to authenticated;

-- Apply (substitui a versão da 0011): compra com custo RECALCULA a média em
-- vez de sobrepor o último. O AFTER INSERT já vê o movimento novo na janela.
-- coalesce defensivo: se a janela vier vazia (ex.: created_at futuro por erro
-- de relógio), cai no custo da própria compra em vez de null.
create or replace function public.stock_movement_apply()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.ingredients
     set stock_qty = stock_qty + new.qty,
         cost_per_unit_cents = case
           when new.kind = 'purchase' and new.cost_per_unit_cents is not null
             then coalesce(public.ingredient_avg_cost(new.ingredient_id),
                           new.cost_per_unit_cents)
           else cost_per_unit_cents end
   where id = new.ingredient_id;
  return new;
end $$;

-- Revert (substitui a versão da 0011): apagar uma compra com custo também
-- recalcula a média (o AFTER DELETE já não vê a linha apagada). Se não restar
-- compra na janela, mantém o custo actual — pior um custo dormente que um
-- null a partir as fichas. Em operação normal não se apaga (limpezas admin).
create or replace function public.stock_movement_revert()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.ingredients
     set stock_qty = stock_qty - old.qty,
         cost_per_unit_cents = case
           when old.kind = 'purchase' and old.cost_per_unit_cents is not null
             then coalesce(public.ingredient_avg_cost(old.ingredient_id),
                           cost_per_unit_cents)
           else cost_per_unit_cents end
   where id = old.ingredient_id;
  return old;
end $$;
