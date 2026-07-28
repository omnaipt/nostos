# Schema do menu v2 — evolução do 0005 para aguentar menus reais

Base: `0005_menu_digital.sql` (em produção). Tem `menu_categories` e `menu_items` com um só `price_cents`, `allergens text[]`, `active` (rascunho/publicado) e `available` (stock). Isto é o que falta, ligado a cada achado do teste dos 3 menus. Não é reescrever, é acrescentar.

## O que falta e porquê (cada campo vem de um caso real)

| Necessidade | Veio de | Solução |
|---|---|---|
| Variantes de preço (½ dose/dose, 2 pax/½ dose) | Os Sagrados; Marisqueira | tabela `menu_item_variants` + `price_type='variants'` |
| Preço por kg | Robalo (Sugestão); Mariscos (Marisqueira) | `price_type='per_kg'` |
| Preço de mercado, sem número | Percebes "consultar preçário" | `price_type='market'`, `price_cents null` |
| Serve N pessoas | "Lulas... 2 pessoas" | `serves` no item e na variante |
| Código do restaurante ("16","73") | Os Sagrados | `external_ref` (não público) |
| Saber que um item veio de parse e precisa de olho | todos | `source`, `needs_review` |
| Alergénios gerados, não lidos | nenhum menu os traz | `allergens_confirmed` |

Nota: os **vinhos** que aparecem no Os Sagrados não entram aqui. Ficam no módulo separado do sommelier, e o parser deve rotear a secção de vinhos para lá.

## DDL proposto (migração 0010, esboço)

```sql
-- 0010 — Menu v2: variantes, unidades e metadados de revisão (evolui 0005).

-- 1) Campos novos no item -----------------------------------------------------
alter table public.menu_items
  add column if not exists price_type text not null default 'fixed'
    check (price_type in ('fixed','per_kg','market','variants')),
  add column if not exists serves int check (serves is null or serves > 0),
  add column if not exists external_ref text,                 -- código do menu do dono
  add column if not exists source text not null default 'manual'
    check (source in ('manual','parsed')),
  add column if not exists needs_review boolean not null default false,
  add column if not exists allergens_confirmed boolean not null default false;

-- Regra preço x tipo (via trigger, porque 'variants' depende de outra tabela):
--   fixed    -> price_cents NOT NULL  (preço por dose/prato)
--   per_kg   -> price_cents NOT NULL  (preço por kg)
--   market   -> price_cents NULL      (mostra "a consultar")
--   variants -> price_cents NULL      (preços em menu_item_variants)

-- 2) Variantes ----------------------------------------------------------------
create table if not exists public.menu_item_variants (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  label         text not null,                     -- "½ dose","dose","2 pax"
  price_cents   int  check (price_cents is null or price_cents >= 0),
  unit          text not null default 'dose'
    check (unit in ('dose','kg','unit','person')),
  serves        int  check (serves is null or serves > 0),
  sort_order    int  not null default 0,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists menu_item_variants_item_idx
  on public.menu_item_variants(item_id);

-- 3) Guardas e triggers (mesmo padrão do 0005) --------------------------------
-- tenant guard: a variante e o item têm de ser do mesmo restaurante
create or replace function public.menu_variant_item_same_restaurant()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.menu_items i
     where i.id = new.item_id and i.restaurant_id = new.restaurant_id
  ) then raise exception 'variante_de_outro_restaurante'; end if;
  return new;
end $$;
create trigger menu_item_variants_tenant_guard
  before insert or update on public.menu_item_variants
  for each row execute function public.menu_variant_item_same_restaurant();

create trigger menu_item_variants_touch before update on public.menu_item_variants
  for each row execute function public.touch_updated_at();

-- 4) RLS (mesmo member_all) ---------------------------------------------------
alter table public.menu_item_variants enable row level security;
create policy menu_item_variants_member_all on public.menu_item_variants
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- 5) RPC pública: incluir tipo, serve e variantes agregadas -------------------
create or replace function public.public_menu_by_slug(p_slug text)
returns table (
  category_id uuid, category_label text, category_sort int,
  item_id uuid, item_name text, item_description text,
  price_cents int, price_type text, serves int,
  allergens text[], variants jsonb, item_sort int, available boolean
)
language sql security definer stable set search_path = public as $$
  select c.id, c.label, c.sort_order,
         i.id, i.name, i.description,
         i.price_cents, i.price_type, i.serves, i.allergens,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'label', v.label, 'price_cents', v.price_cents,
                    'unit', v.unit, 'serves', v.serves)
                    order by v.sort_order)
           from public.menu_item_variants v where v.item_id = i.id
         ), '[]'::jsonb),
         i.sort_order, i.available
  from public.restaurants r
  join public.menu_categories c on c.restaurant_id = r.id and c.active
  left join public.menu_items i on i.category_id = c.id and i.active
  where r.slug = p_slug
  order by c.sort_order, c.label, i.sort_order nulls last, i.name nulls last;
$$;
```

## Prova: os casos difíceis do teste, mapeados

| Caso real | Como fica no schema |
|---|---|
| Lulas com molho vinagrete, 2 pessoas, 25,00 | item `price_type=fixed`, `price_cents=2500`, `serves=2` |
| Robalo ao sal, 48,50/kg | item `price_type=per_kg`, `price_cents=4850` |
| Bacalhau à Sagrados, ½ 15,50 / dose 31,00 | item `price_type=variants` + 2 variantes: `½ dose`=1550, `dose`=3100 |
| Garoupa cozida, só 24,00 (½ ou dose?) | item `variants` + 1 variante `dose`=2400, `needs_review=true` |
| Linha tapada a marcador | não se cria; o import regista "1 item ilegível" para o dono |
| Sapateira recheada, Kg/38,00 | item `price_type=per_kg`, `price_cents=3800` |
| Percebes, consultar preçário | item `price_type=market`, `price_cents=null` |
| Arroz de marisco, 2 pax 41 / ½ dose 24 | item `variants` + `2 pax`=4100 (serves 2), `½ dose`=2400 |
| Códigos 16, 73 no menu do dono | `external_ref='16'` (guardado, não mostrado ao público) |
| Sem alergénios no papel | `allergens='{}'`, `allergens_confirmed=false`, `needs_review=true` até o dono confirmar os inferidos |

## Como o schema serve o enrollment e a revisão

O parse cria items com `source='parsed'`, `active=false` (ficam fora do menu público, são rascunho) e `needs_review=true` onde a confiança é baixa. O ecrã de revisão filtra por `needs_review` e mostra primeiro o que é duvidoso. Ao aprovar, o dono põe `active=true`, limpa `needs_review` e marca `allergens_confirmed=true`. A RPC pública já só devolve `active`, por isso nada meio-cozido chega ao cliente. Os campos `active` e `available` do 0005 mantêm o significado que já tinham.

Opcional, se quiseres rasto do concierge: uma tabela `menu_imports` (ficheiro de origem, estado, contagem de itens e de flags) para auditares cada enrollment. Não é preciso para funcionar, ajuda a medir a qualidade do parse ao longo do tempo.

## Decisões em aberto (a tua chamada)

1. **Híbrido vs só-variantes.** Propus híbrido: item simples guarda o preço em `price_cents`, só os complexos usam a tabela de variantes. Vantagem: o caso comum lê-se sem join e não mexe nos dados já em produção. Custo: dois caminhos no código de leitura. A alternativa purista (todo o item tem variantes, mesmo o simples com uma só) é mais limpa conceptualmente mas obriga a migrar tudo e a fazer sempre join. Para um v0 já em produção, recomendo o híbrido.

2. **Alergénios: uma flag ou proveniência por alergénio.** Propus uma só flag `allergens_confirmed`. Chega para o v1. Granularidade por alergénio (qual foi inferido, qual foi confirmado) só se um cliente exigir rigor legal ao detalhe.

3. **Guardar os códigos do dono (`external_ref`).** Recomendo guardar. Ajuda o dono a reconhecer os pratos na revisão e a reconciliar com o sistema dele, mesmo que nunca apareçam ao cliente.

4. **Redundância `per_kg` no item vs `unit` na variante.** O kg pode viver nos dois sítios. Mantive `per_kg` ao nível do item para o caso simples e `unit` na variante para o caso com doses. É uma pequena redundância consciente, em troca de leitura simples do caso comum.
