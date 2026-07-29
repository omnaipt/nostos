-- 0019 — Parse do menu (onboarding): payload do draft + publicação transaccional.
--
-- SINALIZADO (prompt parse-menu §7 previa "sem migração nova"): menu_imports
-- (0010) NÃO tinha coluna para guardar o rascunho — o desenho do staging
-- assumia-a. Entra aqui como jsonb; de resto o 0010 chega.
--
-- publish_menu_import é a peça transaccional da aceitação 5: "Publicar
-- ementa" (ecrã do Zé) chama-a com o payload EDITADO pelo dono; falha a meio
-- = nada publicado, draft intacto. O parse nunca publica sozinho.

alter table public.menu_imports
  add column if not exists payload jsonb;

-- Alergénios de declaração obrigatória UE (Reg. 1169/2011) — espelho da lista
-- do frontend/generate-tech-sheet; sugestões fora desta lista são descartadas.
create or replace function public.publish_menu_import(
  p_restaurant_id uuid,
  p_import_id uuid,
  p_menu jsonb
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_import public.menu_imports%rowtype;
  v_cat jsonb;
  v_item jsonb;
  v_variant jsonb;
  v_cat_id uuid;
  v_item_id uuid;
  v_cat_sort int;
  v_item_sort int;
  v_price_type text;
  v_price int;
  v_name text;
  v_allergens text[];
  v_allowed_allergens constant text[] := array[
    'gluten','crustaceos','ovos','peixe','amendoins','soja','leite',
    'frutos_casca','aipo','mostarda','sesamo','sulfitos','tremoco','moluscos'];
  v_cats_created int := 0;
  v_cats_reused int := 0;
  v_items_created int := 0;
  v_variants_created int := 0;
  v_idx int;
begin
  -- security invoker: sob RLS, import de outro tenant é invisível.
  select * into v_import from public.menu_imports
   where id = p_import_id and restaurant_id = p_restaurant_id;
  if not found then
    raise exception 'import_invalido';
  end if;
  if v_import.status <> 'review' then
    raise exception 'import_nao_esta_em_revisao';
  end if;
  if p_menu is null or jsonb_typeof(p_menu->'categories') <> 'array' then
    raise exception 'payload_invalido';
  end if;

  for v_cat in select * from jsonb_array_elements(p_menu->'categories') loop
    v_name := nullif(trim(v_cat->>'name'), '');
    if v_name is null then
      raise exception 'categoria_sem_nome';
    end if;

    -- Reimportar ACRESCENTA: reutiliza a categoria activa com o mesmo nome
    -- (case-insensitive); senão cria no fim da ordenação.
    select id into v_cat_id from public.menu_categories
     where restaurant_id = p_restaurant_id and active
       and lower(label) = lower(v_name)
     limit 1;
    if v_cat_id is null then
      select coalesce(max(sort_order), -1) + 1 into v_cat_sort
        from public.menu_categories where restaurant_id = p_restaurant_id;
      insert into public.menu_categories (restaurant_id, label, active, sort_order)
      values (p_restaurant_id, v_name, true, v_cat_sort)
      returning id into v_cat_id;
      v_cats_created := v_cats_created + 1;
    else
      v_cats_reused := v_cats_reused + 1;
    end if;

    select coalesce(max(sort_order), -1) + 1 into v_item_sort
      from public.menu_items where category_id = v_cat_id;

    for v_item in select * from jsonb_array_elements(v_cat->'items') loop
      v_name := nullif(trim(v_item->>'name'), '');
      if v_name is null then
        raise exception 'item_sem_nome';
      end if;
      v_price_type := coalesce(v_item->>'price_type', 'fixed');
      if v_price_type not in ('fixed','per_kg','market','variants') then
        raise exception 'price_type_invalido: %', v_name;
      end if;
      v_price := (v_item->>'price_cents')::int;
      -- Coerência da 0010, com erro LEGÍVEL antes do constraint: o ecrã de
      -- revisão obriga a resolver; se escapar, aborta-se a publicação inteira.
      if v_price_type in ('fixed','per_kg') and v_price is null then
        raise exception 'preco_em_falta: %', v_name;
      end if;
      if v_price_type in ('market','variants') then
        v_price := null;
      end if;

      -- Alergénios: SUGESTÃO do parse — entram no campo mas allergens_confirmed
      -- fica false (selo "por confirmar" no ecrã do Zé); fora da lista UE caem.
      select coalesce(array_agg(distinct a), '{}') into v_allergens
        from jsonb_array_elements_text(coalesce(v_item->'allergens_suggested', '[]'::jsonb)) a
       where a = any(v_allowed_allergens);

      insert into public.menu_items
        (restaurant_id, category_id, name, description, price_type, price_cents,
         serves, allergens, allergens_confirmed, source, import_id,
         needs_review, review_note, active, sort_order)
      values
        (p_restaurant_id, v_cat_id, v_name,
         nullif(trim(coalesce(v_item->>'description', '')), ''),
         v_price_type, v_price,
         (v_item->>'serves')::int,
         v_allergens, false, 'parsed', p_import_id,
         coalesce((v_item->>'needs_review')::boolean, false),
         nullif(trim(coalesce(v_item->>'note', '')), ''),
         true, v_item_sort)
      returning id into v_item_id;
      v_items_created := v_items_created + 1;
      v_item_sort := v_item_sort + 1;

      if v_price_type = 'variants' then
        if jsonb_typeof(v_item->'variants') <> 'array'
           or jsonb_array_length(v_item->'variants') = 0 then
          raise exception 'variants_em_falta: %', v_name;
        end if;
        v_idx := 0;
        for v_variant in select * from jsonb_array_elements(v_item->'variants') loop
          if nullif(trim(v_variant->>'label'), '') is null then
            raise exception 'variante_sem_label: %', v_name;
          end if;
          insert into public.menu_item_variants
            (restaurant_id, item_id, label, price_cents, serves, sort_order, is_default)
          values
            (p_restaurant_id, v_item_id,
             trim(v_variant->>'label'),
             (v_variant->>'price_cents')::int,
             (v_variant->>'serves')::int,
             v_idx,
             v_idx = 0); -- 1ª variante = dose principal (margem/Gap E)
          v_variants_created := v_variants_created + 1;
          v_idx := v_idx + 1;
        end loop;
      end if;
    end loop;
  end loop;

  update public.menu_imports
     set status = 'published',
         items_count = v_items_created,
         payload = p_menu
   where id = p_import_id;

  return jsonb_build_object(
    'categories_created', v_cats_created,
    'categories_reused', v_cats_reused,
    'items_created', v_items_created,
    'variants_created', v_variants_created);
end $$;

revoke execute on function public.publish_menu_import(uuid, uuid, jsonb) from anon;
grant execute on function public.publish_menu_import(uuid, uuid, jsonb) to authenticated;
