-- 0019 — Identidade da casa: logo white-label + tema das superfícies públicas
-- (decisões David 29-07). O logo do restaurante entra em todo o lado (fichas,
-- menu público, /r, backoffice, mensagens); o tema muda SÓ o que o cliente vê
-- (/m, /r, email) — o backoffice mantém-se costeiro nostos.

alter table public.restaurants
  add column if not exists logo_url text,
  add column if not exists theme text not null default 'costeiro'
    check (theme in ('costeiro','ardosia','trattoria','horta','carvao','editorial'));

comment on column public.restaurants.logo_url is
  'URL público do logo (bucket restaurant-logos, path {restaurant_id}/logo.*). 29-07-2026.';
comment on column public.restaurants.theme is
  'Tema curado das superfícies públicas (/m, /r, email). 6 conjuntos completos de tokens, AA verificado. 29-07-2026.';

-- ── Bucket de logos: leitura pública, escrita só por membros do tenant ───────
insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;

drop policy if exists "restaurant_logos_public_read" on storage.objects;
create policy "restaurant_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'restaurant-logos');

-- Path convencionado {restaurant_id}/logo.{ext}: o 1º segmento é o tenant e a
-- guarda usa o helper canónico is_restaurant_member (SECURITY DEFINER, 0001).
drop policy if exists "restaurant_logos_member_insert" on storage.objects;
create policy "restaurant_logos_member_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'restaurant-logos'
    and public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "restaurant_logos_member_update" on storage.objects;
create policy "restaurant_logos_member_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "restaurant_logos_member_delete" on storage.objects;
create policy "restaurant_logos_member_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'restaurant-logos'
    and public.is_restaurant_member(((storage.foldername(name))[1])::uuid)
  );

-- ── RPC pública do restaurante passa a expor logo_url + theme ────────────────
-- (mudança de assinatura: drop + create + grant, padrão da 0013/0014.)
drop function if exists public.public_restaurant_by_slug(text);
create function public.public_restaurant_by_slug(p_slug text)
returns table (name text, phone text, slug text, logo_url text, theme text)
language sql security definer stable set search_path = public as $$
  select r.name, r.phone, r.slug, r.logo_url, r.theme
  from public.restaurants r where r.slug = p_slug;
$$;

grant execute on function public.public_restaurant_by_slug(text) to anon, authenticated;
