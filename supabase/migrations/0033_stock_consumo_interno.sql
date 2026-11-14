-- 0033 - Stock S2: consumo interno, motivo, abate estimado e modo de consumo.
-- Segundo de tres sprints de stock (S1 formatos; S2 consumo interno; S3
-- inventario). Origem: spec "Nostos Rest: camada de stock" (David, decisoes de
-- 13-11-2026). Depende da 0032 (conversao de unidades) e da 0021/0029 (perfis).
--
-- Objectivo: a refeicao do pessoal, a oferta da casa e o prato estragado saem
-- do stock pelo que realmente gastam, registados pela cozinha e separados das
-- quebras. Ingredientes sem ficha (azeite de mesa, sal) deixam de ser abatidos
-- por vendas quando postos em modo contagem. Abate feito com ficha por validar
-- fica marcado como estimado.

-- == 1) Tipo de movimento internal_use + coerencia de sinal ==================
-- internal_use e sempre negativo (sai do stock, como sale_depletion e waste).
-- Os CHECKs inline da 0011 (nome auto <tabela>_<coluna>_check e o nomeado
-- stock_movements_sign_coherent) sao substituidos acrescentando o novo tipo;
-- os tipos existentes mantem a regra de sinal.
alter table public.stock_movements
  drop constraint if exists stock_movements_kind_check,
  drop constraint if exists stock_movements_sign_coherent;

alter table public.stock_movements
  add constraint stock_movements_kind_check
    check (kind in ('purchase','sale_depletion','adjustment','waste','internal_use')),
  add constraint stock_movements_sign_coherent check (
    (kind = 'purchase' and qty > 0) or
    (kind in ('sale_depletion','waste','internal_use') and qty < 0) or
    (kind = 'adjustment' and qty <> 0)
  );

-- == 2) Motivo e marca de abate estimado =====================================
alter table public.stock_movements
  add column if not exists reason text
    check (reason is null or reason in ('pessoal','oferta','prova','outro')),
  add column if not exists estimated boolean not null default false;
comment on column public.stock_movements.reason is
  'Motivo do consumo interno (pessoal, oferta, prova, outro). Obrigatorio em internal_use, permitido em waste, nulo nos restantes tipos.';
comment on column public.stock_movements.estimated is
  'Verdadeiro quando o abate foi calculado a partir de uma ficha tecnica por validar (rascunho). Falso por defeito.';

-- Coerencia do motivo com o tipo: obrigatorio em internal_use, livre em waste,
-- nulo nos restantes.
alter table public.stock_movements
  add constraint stock_movements_reason_coherent check (
    case
      when kind = 'internal_use' then reason is not null
      when kind = 'waste' then true
      else reason is null
    end
  );

-- == 3) Modo de consumo no ingrediente =======================================
-- ficha: o consumo apura-se abatendo a ficha tecnica (comportamento actual).
-- contagem: o ingrediente nao abate por vendas nem por consumo interno; o
-- consumo apura-se na contagem (Sprint 06). Util para azeite de mesa, sal,
-- guardanapos: ingredientes sem ficha que nao devem sair por cada venda.
alter table public.ingredients
  add column if not exists depletion_mode text not null default 'ficha'
    check (depletion_mode in ('ficha','contagem'));
comment on column public.ingredients.depletion_mode is
  'Como o consumo do ingrediente e apurado: ficha (abate pela ficha tecnica) ou contagem (nao abate por vendas nem consumo interno; apura-se na contagem, Sprint 06).';

-- == 4) Guarda de movimentos: contagem e perfil ==============================
-- Recria a guarda da 0032 acrescentando duas regras no inicio, sem tocar na
-- logica de conversao e embalagens (partida da definicao em vigor da 0032):
--   a) ingrediente em modo contagem nao aceita sale_depletion nem internal_use;
--   b) com utilizador autenticado, internal_use e waste so para owner, gestor
--      ou cozinha; balcao e consultor sao rejeitados. Service role (auth.uid()
--      nulo, edge functions) nao e afectado.
create or replace function public.stock_movement_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_unit      text;
  v_uwg       numeric;
  v_mode      text;
  v_factor    numeric;
  v_pack_qty  numeric;
  v_pack_unit text;
  v_pf        numeric;
  v_expected  numeric;
  v_given     numeric;
begin
  select unit, unit_weight_g, depletion_mode into v_unit, v_uwg, v_mode
    from public.ingredients g
   where g.id = new.ingredient_id and g.restaurant_id = new.restaurant_id;
  if v_unit is null then
    raise exception 'ingrediente_de_outro_restaurante';
  end if;

  -- (a) Modo de consumo: ingrediente em contagem nao abate por vendas nem por
  -- consumo interno (o apuramento e por contagem, Sprint 06).
  if new.kind in ('sale_depletion','internal_use') and v_mode = 'contagem' then
    raise exception 'ingrediente_consumido_por_contagem';
  end if;

  -- (b) Perfil: com utilizador autenticado, consumo interno e quebras so para
  -- owner, gestor ou cozinha. Service role (auth.uid() nulo) nao e afectado.
  if auth.uid() is not null and new.kind in ('internal_use','waste') then
    if coalesce(public.member_role(new.restaurant_id), '') not in ('owner','gestor','cozinha') then
      raise exception 'perfil_sem_permissao';
    end if;
  end if;

  -- Entrada por embalagens: packs x pack_qty do artigo, convertido ao ingrediente.
  if new.packs is not null then
    if new.kind <> 'purchase' then
      raise exception 'packs_so_em_purchase';
    end if;
    if new.purchase_item_id is null then
      raise exception 'packs_exige_artigo';
    end if;
    select pack_qty, pack_unit into v_pack_qty, v_pack_unit
      from public.purchase_items p
     where p.id = new.purchase_item_id
       and p.restaurant_id = new.restaurant_id
       and p.ingredient_id = new.ingredient_id;
    if v_pack_qty is null then
      raise exception 'artigo_de_outro_restaurante_ou_ingrediente';
    end if;
    v_pf := public.unit_factor(v_pack_unit, v_unit, v_uwg);
    if v_pf is null then
      raise exception 'grandeza_diferente_do_ingrediente';
    end if;
    v_expected := new.packs * v_pack_qty * v_pf;
    -- Confere a qty enviada pelo cliente (na sua unidade) contra o esperado.
    v_factor := public.unit_factor(new.unit, v_unit, v_uwg);
    if v_factor is null then
      raise exception 'grandeza_diferente_do_ingrediente';
    end if;
    v_given := new.qty * v_factor;
    if abs(v_given - v_expected) > 0.001 then
      raise exception 'qty_nao_coincide_com_embalagens';
    end if;
    if new.cost_per_unit_cents is not null and v_factor <> 1 then
      new.cost_per_unit_cents := new.cost_per_unit_cents / v_factor;
    end if;
    new.qty := v_expected;
    new.unit := v_unit;
    return new;
  end if;

  -- Sem embalagens: aceita unidade diferente quando ha conversao.
  if v_unit <> new.unit then
    v_factor := public.unit_factor(new.unit, v_unit, v_uwg);
    if v_factor is null then
      raise exception 'grandeza_diferente_do_ingrediente';
    end if;
    new.qty := new.qty * v_factor;
    if new.cost_per_unit_cents is not null then
      new.cost_per_unit_cents := new.cost_per_unit_cents / v_factor;
    end if;
    new.unit := v_unit;
  end if;
  return new;
end $$;
comment on function public.stock_movement_guard() is
  'Guarda BEFORE INSERT de stock_movements: tenant, modo de consumo (contagem nao abate), perfil (internal_use/waste so owner/gestor/cozinha com utilizador), conversao de unidades e entrada por embalagens. 0033.';
