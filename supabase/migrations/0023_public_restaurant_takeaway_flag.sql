-- 0023 — A RPC pública do restaurante passa a devolver takeaway_enabled.
--
-- Bug apanhado pelo David em 30-07: com o take-away ligado nas Definições, a
-- página /m/<slug>/levar dizia "take-away indisponível de momento" e o botão
-- "Encomendar para levar" nunca aparecia no menu público.
--
-- Causa: a 0022 acrescentou restaurants.takeaway_enabled e ensinou a
-- public_menu_by_slug a expor os ids das variantes, mas esqueceu-se desta RPC.
-- O frontend público lê o flag daqui (PublicTakeaway §54 e PublicMenu §209),
-- recebia undefined e concluía, correctamente para o que via, que o módulo
-- estava desligado. Lição para o futuro: quando uma coluna passa a comandar
-- comportamento público, verificar TODAS as RPCs `public_*` que a servem.
--
-- Acrescentar uma coluna OUT muda o tipo de retorno, por isso o Postgres exige
-- drop + create. A coluna nova vai no FIM, logo é aditiva para quem lê por nome
-- (o supabase-js devolve objectos), e a assinatura de entrada não muda.
drop function if exists public.public_restaurant_by_slug(text);

create function public.public_restaurant_by_slug(p_slug text)
returns table (
  name             text,
  phone            text,
  slug             text,
  logo_url         text,
  theme            text,
  takeaway_enabled boolean
)
language sql stable security definer set search_path = public as $$
  select r.name, r.phone, r.slug, r.logo_url, r.theme, r.takeaway_enabled
  from public.restaurants r where r.slug = p_slug;
$$;
grant execute on function public.public_restaurant_by_slug(text) to anon, authenticated;
