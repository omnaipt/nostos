-- 0025 — Menu digital multilingue (PT base, EN/ES/FR traduzidos).
--
-- Decisão do David (02-08-2026): o menu público tem de se adaptar ao idioma do
-- aparelho de quem o abre. Cascais, Sintra e Mafra vivem de turismo e o menu é
-- a primeira coisa que um estrangeiro vê da casa.
--
-- Desenho, e as razões:
--
-- 1. O PORTUGUÊS É A BASE e não uma tradução. As colunas existentes
--    (`menu_items.name`, `.description`, `menu_categories.label`,
--    `menu_item_variants.label`) continuam a ser a verdade. As traduções vivem
--    à parte e caem para o português sempre que faltarem. Consequência
--    importante: uma tradução em falta nunca deixa um buraco no menu.
--
-- 2. UMA TABELA para as três entidades traduzíveis em vez de três tabelas
--    quase iguais. O `entity_type` paga-se com um check; três tabelas pagavam-se
--    com três políticas de RLS, três hooks e três ecrãs.
--
-- 3. O PÚBLICO SÓ VÊ O QUE FOI VALIDADO. A IA escreve o rascunho, o dono valida,
--    e só aí a tradução chega ao cliente. É o mesmo princípio já aplicado à
--    importação de ementa e às fichas técnicas: nada gerado por IA é publicado
--    sem passar pelo olho de quem responde pela casa. Uma tradução errada numa
--    ementa é um erro que o cliente vê à mesa.

create table public.menu_translations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entity_type   text not null check (entity_type in ('item', 'category', 'variant')),
  entity_id     uuid not null,
  lang          text not null check (lang in ('en', 'es', 'fr')),
  name          text,
  description   text,
  source        text not null default 'ai' check (source in ('ai', 'manual')),
  status        text not null default 'rascunho' check (status in ('rascunho', 'validada')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, entity_type, entity_id, lang)
);

create index menu_translations_lookup_idx
  on public.menu_translations (restaurant_id, lang, status, entity_type);

alter table public.menu_translations enable row level security;

create policy "menu_translations_member_all" on public.menu_translations
  for all
  using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

comment on table public.menu_translations is
  'Traduções do menu. O português vive nas tabelas de origem e é o fallback. Só linhas com status=validada chegam ao menu público.';

-- ---------------------------------------------------------------------------
-- Menu público com idioma. `p_lang` tem default 'pt', portanto chamadas antigas
-- (só com o slug) continuam a funcionar sem alteração: a app já publicada não
-- parte enquanto o frontend novo não sair.

drop function if exists public.public_menu_by_slug(text);

create or replace function public.public_menu_by_slug(p_slug text, p_lang text default 'pt')
returns table (
  category_id      uuid,
  category_label   text,
  category_sort    integer,
  item_id          uuid,
  item_name        text,
  item_description text,
  price_cents      integer,
  price_type       text,
  serves           integer,
  allergens        text[],
  variants         jsonb,
  item_sort        integer,
  available        boolean,
  by_order         boolean,
  kind             text
)
language sql stable security definer set search_path to 'public' as $function$
  with tr as (
    select t.entity_type, t.entity_id, t.name, t.description
      from public.menu_translations t
      join public.restaurants r2 on r2.id = t.restaurant_id
     where r2.slug = p_slug
       and t.lang = p_lang
       and t.status = 'validada'
  )
  select c.id,
         coalesce(tc.name, c.label),
         c.sort_order,
         i.id,
         coalesce(ti.name, i.name),
         coalesce(ti.description, i.description),
         i.price_cents, i.price_type, i.serves, i.allergens,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id',          v.id,
                    'label',       coalesce(tv.name, v.label),
                    'price_cents', v.price_cents,
                    'unit',        v.unit,
                    'serves',      v.serves)
                    order by v.sort_order)
           from public.menu_item_variants v
           left join tr tv on tv.entity_type = 'variant' and tv.entity_id = v.id
          where v.item_id = i.id
         ), '[]'::jsonb),
         i.sort_order, i.available, i.by_order, i.kind
  from public.restaurants r
  join public.menu_categories c on c.restaurant_id = r.id and c.active
  left join tr tc on tc.entity_type = 'category' and tc.entity_id = c.id
  left join public.menu_items i on i.category_id = c.id and i.active
    and (i.kind = 'standard' or i.service_date = (now() at time zone 'Europe/Lisbon')::date)
  left join tr ti on ti.entity_type = 'item' and ti.entity_id = i.id
  where r.slug = p_slug
  -- Ordenação pelos campos ORIGINAIS de propósito: a ementa tem a mesma ordem
  -- em todos os idiomas, e o dono reconhece o seu menu em qualquer um deles.
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$function$;

grant execute on function public.public_menu_by_slug(text, text) to anon, authenticated;

-- Idiomas realmente disponíveis nesta casa: os que têm pelo menos um PRATO
-- traduzido e validado. O selector no menu público só mostra estes, para não
-- oferecer uma bandeira que abre uma ementa metade em português.
create or replace function public.public_menu_langs(p_slug text)
returns text[]
language sql stable security definer set search_path to 'public' as $function$
  select coalesce(array_agg(distinct t.lang order by t.lang), '{}'::text[])
    from public.menu_translations t
    join public.restaurants r on r.id = t.restaurant_id
   where r.slug = p_slug
     and t.status = 'validada'
     and t.entity_type = 'item';
$function$;

grant execute on function public.public_menu_langs(text) to anon, authenticated;

-- Progresso das traduções, para o ecrã de revisão do backoffice.
create or replace function public.menu_translation_progress(p_restaurant uuid)
returns table (lang text, rascunhos int, validadas int, total_itens int)
language sql stable set search_path to 'public' as $function$
  select l.lang,
         count(*) filter (where t.status = 'rascunho')::int,
         count(*) filter (where t.status = 'validada')::int,
         (select count(*)::int from public.menu_items i
           where i.restaurant_id = p_restaurant and i.active)
    from (values ('en'), ('es'), ('fr')) as l(lang)
    left join public.menu_translations t
      on t.lang = l.lang
     and t.restaurant_id = p_restaurant
     and t.entity_type = 'item'
   group by l.lang
   order by l.lang;
$function$;

grant execute on function public.menu_translation_progress(uuid) to authenticated;
