-- 0014 — RPC pública do menu expõe `kind` (Reserva com Proximidade v1, 29-07).
-- O "hoje temos" da página de reserva (/r) precisa de distinguir os pratos do
-- dia (kind='daily') dos restantes, para os mostrar apenas quando a reserva é
-- para hoje. A RPC já filtra os daily ao próprio dia (0010/0013); aqui passa
-- só a dizer QUEM é daily. Mesmo padrão da 0013: drop + create + grant.

drop function if exists public.public_menu_by_slug(text);
create function public.public_menu_by_slug(p_slug text)
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
    -- pratos do dia: só saem no próprio dia (fuso PT; v0 sem timezone por tenant)
    and (i.kind = 'standard' or i.service_date = (now() at time zone 'Europe/Lisbon')::date)
  where r.slug = p_slug
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$$;

grant execute on function public.public_menu_by_slug(text) to anon, authenticated;
