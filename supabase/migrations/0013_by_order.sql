-- 0013 — Pratos por encomenda (v1 da Reserva com Proximidade, David 29-07).
-- Um prato `by_order` é de confeção lenta/por encomenda: aparece no menu
-- público com nota própria e, sobretudo, no "hoje temos" da página de reserva
-- como pré-pedido ("encomende já; confirmamos consigo"). O pedido anexa-se à
-- reserva via p_notes (0004), que já existe — nenhuma mudança em reservations.

alter table public.menu_items
  add column if not exists by_order boolean not null default false;

-- RPC pública passa a expor by_order (assinatura muda: drop + create + grant,
-- mesmo padrão da 0010). O resto do corpo é idêntico ao da 0010.
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
  by_order         boolean
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
         i.sort_order, i.available, i.by_order
  from public.restaurants r
  join public.menu_categories c on c.restaurant_id = r.id and c.active
  left join public.menu_items i on i.category_id = c.id and i.active
    -- pratos do dia: só saem no próprio dia (fuso PT; v0 sem timezone por tenant)
    and (i.kind = 'standard' or i.service_date = (now() at time zone 'Europe/Lisbon')::date)
  where r.slug = p_slug
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$$;

grant execute on function public.public_menu_by_slug(text) to anon, authenticated;
