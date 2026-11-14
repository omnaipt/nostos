# Contrato Stock S1 (migration 0032)

Para os Sprints 05 (consumo interno) e 06 (inventário com parciais) consumirem
sem adivinhar. Fonte de verdade: `supabase/migrations/0032_stock_formatos.sql` e
os tipos em `apps/web/src/integrations/supabase/database.types.ts`.

## Conversão de unidades

Função `public.unit_factor(p_from text, p_to text, p_unit_weight_g numeric default null) returns numeric` (IMMUTABLE):

- Devolve o multiplicador de `p_from` para `p_to` dentro da mesma grandeza.
- Massa: `g`↔`kg` (0.001 / 1000). Volume: `ml`↔`l` (0.001 / 1000). `un`↔`un` = 1.
- Entre `un` e `g`/`kg` usa `p_unit_weight_g` (gramas por unidade): `un→g = w`,
  `un→kg = w/1000`, `g→un = 1/w`, `kg→un = 1000/w`.
- Devolve `null` quando a conversão não é possível: massa contra volume, `un`
  contra volume, ou `un` contra peso sem `p_unit_weight_g` (> 0).
- `un` contra volume fica para o S3 (densidade, `density_g_per_ml`, fora do S1).

Espelho no cliente: `unitFactor` em `apps/web/src/lib/types.ts`. Espelho na edge:
`unitFactor`/`toIngredientUnit` em `supabase/functions/import-saft/index.ts`. A
tabela de casos é única e está documentada no topo de cada ficheiro.

## Colunas novas

### `ingredients`
- `unit_weight_g numeric(10,3)` opcional, `> 0` quando preenchido. Peso médio por
  unidade (cebola, limão, alho). Permite converter linhas em `un` contra ingredientes
  ao peso. `null` = sem conversão `un`↔peso.
- `family_id uuid` opcional, FK para `ingredient_families(id)` `on delete set null`.
  Guarda `ingredients_family_guard`: a família tem de ser do mesmo restaurante
  (excepção `familia_de_outro_restaurante`).

### `supplier_product_aliases`
- `purchase_item_id uuid` opcional, FK para `purchase_items(id)` `on delete set null`.
  Guarda (recriada de 0018): o artigo é do mesmo restaurante e aponta para o mesmo
  `ingredient_id` do alias (excepção `artigo_de_outro_restaurante_ou_ingrediente`).
  Aliases antigos sem artigo continuam válidos.

### `stock_movements`
- `purchase_item_id uuid` opcional, FK para `purchase_items(id)` `on delete set null`.
- `packs numeric(12,3)` opcional, `> 0`. Quando preenchido num `purchase`: a `qty`
  gravada é `packs × pack_qty` convertida para a unidade do ingrediente; exige
  `purchase_item_id`; se o cliente enviar também `qty`, as duas têm de coincidir
  (tolerância 0,001) ou o movimento é rejeitado (`qty_nao_coincide_com_embalagens`).

## Tabelas novas

### `ingredient_families`
`id`, `restaurant_id`, `name` (1..120, único por restaurante sem distinção de
maiúsculas), `created_at`, `updated_at`. RLS `ingredient_families_member_all`.

### `purchase_items`
Formatos concretos (marca, embalagem, conteúdo) de um ingrediente.

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `restaurant_id` | uuid | FK restaurants, cascade |
| `ingredient_id` | uuid | FK ingredients, cascade, obrigatório |
| `supplier_norm` | text | opcional (1..160), mesma normalização da 0018 |
| `brand` | text | opcional |
| `label` | text | opcional, texto livre do formato ("Garrafão 5 L") |
| `pack_qty` | numeric(12,3) | `> 0` |
| `pack_unit` | text | `g`/`kg`/`ml`/`l`/`un` |
| `tare_g` | numeric(10,3) | opcional, `>= 0` |
| `ean` | text | opcional |
| `supplier_code` | text | opcional |
| `catalog_item_id` | uuid | reservado à fase 2 (catálogo partilhado), sem FK, sempre null no S1 |
| `active` | boolean | default true |
| `created_at`/`updated_at` | timestamptz | |

Guarda `purchase_items_tenant_guard` (`purchase_item_guard`): o ingrediente é do
mesmo restaurante (`ingrediente_de_outro_restaurante`) e `unit_factor(pack_unit,
unidade do ingrediente, unit_weight_g)` não é null (`formato_incompativel_com_ingrediente`).
RLS `purchase_items_member_all`.

## Triggers de movimentos (recriados)

`stock_movement_guard` (BEFORE INSERT) passa a:
1. Entrada por embalagens (`packs` não nulo): valida `kind = purchase` e
   `purchase_item_id`; calcula `qty = packs × pack_qty × unit_factor(pack_unit,
   unidade, unit_weight_g)`; confere a `qty` enviada; normaliza `qty`/`unit` para a
   unidade do ingrediente e `cost_per_unit_cents` na proporção inversa.
2. Sem embalagens mas unidade diferente da do ingrediente: se `unit_factor` não é
   null, normaliza `qty`, `unit` e `cost_per_unit_cents`; senão rejeita
   (`grandeza_diferente_do_ingrediente`).
3. Mesma unidade: comportamento inalterado (0011/0016).

`stock_movement_apply`/`stock_movement_revert` (0016) NÃO mudaram: correm AFTER e
já vêem `qty`/`cost_per_unit_cents` normalizados, por isso o custo médio a 6 meses
(`ingredient_avg_cost`) continua correcto com entradas por embalagens.

## Excepções (P0001) introduzidas/usadas

`grandeza_diferente_do_ingrediente`, `packs_so_em_purchase`, `packs_exige_artigo`,
`qty_nao_coincide_com_embalagens`, `formato_incompativel_com_ingrediente`,
`familia_de_outro_restaurante`, `artigo_de_outro_restaurante_ou_ingrediente`.

## Fora do S1 (para o S05/S06 não assumir)

- `density_g_per_ml` e conversão `un`↔volume: Sprint 06.
- Consumo interno, modo de consumo por ingrediente, marca de abate estimado: Sprint 05.
- Catálogo partilhado entre restaurantes: só a coluna `catalog_item_id` (null, sem FK).
