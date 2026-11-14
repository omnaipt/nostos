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
  -- (b) Perfil primeiro: com utilizador autenticado, consumo interno e quebras
  -- so para owner, gestor ou cozinha. Avaliado antes da leitura do ingrediente
  -- para que balcao e consultor sejam travados com perfil_sem_permissao mesmo
  -- quando a RLS do ingrediente nao os deixa le-lo (consultor nao e membro
  -- operacional, 0029). Nao enfraquece a guarda de tenant: o ingrediente de
  -- outro restaurante continua a ser rejeitado a seguir, pela leitura abaixo.
  -- Service role (auth.uid() nulo, edge functions) nao e afectado.
  if auth.uid() is not null and new.kind in ('internal_use','waste') then
    if coalesce(public.member_role(new.restaurant_id), '') not in ('owner','gestor','cozinha') then
      raise exception 'perfil_sem_permissao';
    end if;
  end if;

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

-- == 5) RPC de consumo por prato =============================================
-- Expande a ficha tecnica de um prato e gera os movimentos de consumo interno
-- ou de quebra, pelo que a ficha diz que cada dose gasta. SECURITY INVOKER: a
-- RLS e as guardas (modo de consumo, perfil) aplicam-se ao caller; o abate de
-- um balcao e travado pela guarda da stock_movement_guard.
--
-- Por cada linha ligada a um ingrediente gera um movimento com quantidade
--   -(p_portions x linha.qty / servings)
-- convertida pela unit_factor para a unidade do ingrediente, com estimated
-- igual a (ficha em rascunho), o motivo e a nota. Linhas livres, linhas sem
-- conversao possivel e ingredientes em modo contagem nao geram movimento e
-- voltam listados em nao_abatidas com o motivo de cada uma. Prato sem ficha:
-- erro prato_sem_ficha, nada gravado. Atomico: ou entram todos os movimentos
-- validos, ou nenhum se houver erro.
create or replace function public.register_dish_consumption(
  p_restaurant_id uuid,
  p_menu_item_id  uuid,
  p_portions      numeric,
  p_kind          text,
  p_reason        text,
  p_note          text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sheet     public.tech_sheets%rowtype;
  v_servings  numeric;
  v_estimated boolean;
  v_line      record;
  v_factor    numeric;
  v_qty_conv  numeric;
  v_abatidas  jsonb := '[]'::jsonb;
  v_nao       jsonb := '[]'::jsonb;
  v_count     int := 0;
begin
  if p_kind not in ('internal_use','waste') then
    raise exception 'kind_invalido';
  end if;
  if p_portions is null or p_portions <= 0 then
    raise exception 'doses_invalidas';
  end if;

  -- Ficha do prato, sob a RLS do caller (so ve as do seu restaurante).
  select * into v_sheet
    from public.tech_sheets s
   where s.menu_item_id = p_menu_item_id
     and s.restaurant_id = p_restaurant_id;
  if v_sheet.id is null then
    raise exception 'prato_sem_ficha';
  end if;

  v_servings := greatest(coalesce(v_sheet.servings, 1), 1);
  v_estimated := (v_sheet.status = 'rascunho');

  for v_line in
    select tsi.ingredient_id, tsi.name as line_name, tsi.qty, tsi.unit,
           g.name as ing_name, g.unit as ing_unit, g.unit_weight_g, g.depletion_mode
      from public.tech_sheet_ingredients tsi
      left join public.ingredients g on g.id = tsi.ingredient_id
     where tsi.tech_sheet_id = v_sheet.id
     order by tsi.sort_order
  loop
    -- Linha livre: sem ingrediente da despensa, nao abate.
    if v_line.ingredient_id is null then
      v_nao := v_nao || jsonb_build_object(
        'ingredient_id', null, 'name', v_line.line_name, 'motivo', 'linha_livre');
      continue;
    end if;
    -- Ingrediente em modo contagem: apura-se na contagem, nao abate.
    if v_line.depletion_mode = 'contagem' then
      v_nao := v_nao || jsonb_build_object(
        'ingredient_id', v_line.ingredient_id, 'name', v_line.ing_name, 'motivo', 'contagem');
      continue;
    end if;
    -- Conversao para a unidade do ingrediente.
    v_factor := public.unit_factor(v_line.unit, v_line.ing_unit, v_line.unit_weight_g);
    if v_factor is null then
      v_nao := v_nao || jsonb_build_object(
        'ingredient_id', v_line.ingredient_id, 'name', v_line.ing_name, 'motivo', 'sem_conversao');
      continue;
    end if;
    v_qty_conv := round(p_portions * v_line.qty / v_servings * v_factor, 3);
    if v_qty_conv <= 0 then
      -- Arredondado a 0: nao gera movimento.
      v_nao := v_nao || jsonb_build_object(
        'ingredient_id', v_line.ingredient_id, 'name', v_line.ing_name, 'motivo', 'quantidade_nula');
      continue;
    end if;

    insert into public.stock_movements
      (restaurant_id, ingredient_id, kind, qty, unit, reason, note, estimated, source)
    values
      (p_restaurant_id, v_line.ingredient_id, p_kind, -v_qty_conv, v_line.ing_unit,
       p_reason, p_note, v_estimated, 'manual');

    v_count := v_count + 1;
    v_abatidas := v_abatidas || jsonb_build_object(
      'ingredient_id', v_line.ingredient_id, 'name', v_line.ing_name,
      'qty', -v_qty_conv, 'unit', v_line.ing_unit, 'estimated', v_estimated);
  end loop;

  return jsonb_build_object(
    'menu_item_id', p_menu_item_id,
    'kind', p_kind,
    'portions', p_portions,
    'estimated', v_estimated,
    'movimentos', v_count,
    'abatidas', v_abatidas,
    'nao_abatidas', v_nao
  );
end $$;
comment on function public.register_dish_consumption(uuid, uuid, numeric, text, text, text) is
  'Expande a ficha tecnica de um prato e gera movimentos internal_use/waste pelo que cada dose gasta. SECURITY INVOKER. Linhas livres, sem conversao e ingredientes em contagem voltam em nao_abatidas. Prato sem ficha: erro prato_sem_ficha. 0033.';

revoke all on function public.register_dish_consumption(uuid, uuid, numeric, text, text, text) from public, anon;
grant execute on function public.register_dish_consumption(uuid, uuid, numeric, text, text, text) to authenticated;
