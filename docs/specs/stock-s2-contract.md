# Contrato Stock S2 (migration 0033)

Para o Sprint 06 (inventário com contagens) e o resto da app consumirem sem
adivinhar. Fonte de verdade: `supabase/migrations/0033_stock_consumo_interno.sql`
e os tipos em `apps/web/src/integrations/supabase/database.types.ts`. Depende do
contrato do S1 (`docs/specs/stock-s1-contract.md`).

## Colunas novas

### `stock_movements`
- `reason text` opcional, valores `pessoal`, `oferta`, `prova`, `outro`.
  Coerência com o tipo (constraint `stock_movements_reason_coherent`):
  obrigatório quando `kind = 'internal_use'`, permitido em `waste`, tem de ser
  nulo nos restantes tipos.
- `estimated boolean not null default false`. `true` quando o abate foi
  calculado a partir de uma ficha técnica em `rascunho` (por validar).

### `ingredients`
- `depletion_mode text not null default 'ficha'`, valores `ficha` e `contagem`.
  `ficha`: o consumo apura-se abatendo a ficha técnica (comportamento actual).
  `contagem`: o ingrediente **não** abate por `sale_depletion` nem por
  `internal_use`; o gasto apura-se na contagem (Sprint 06). Para azeite de mesa,
  sal, guardanapos.

## Tipo de movimento novo

`stock_movements.kind` passa a aceitar `internal_use` (além de `purchase`,
`sale_depletion`, `adjustment`, `waste`). Coerência de sinal
(`stock_movements_sign_coherent`): `internal_use` é sempre negativo, como
`sale_depletion` e `waste`. `purchase` positivo; `adjustment` ≠ 0.

## Guardas de movimento (recriadas na 0033)

`stock_movement_guard` (BEFORE INSERT) acrescenta duas regras à versão da 0032,
antes da lógica de conversão/embalagens (que fica intacta):

1. **Modo de consumo**: um `sale_depletion` ou `internal_use` num ingrediente em
   `depletion_mode = 'contagem'` é rejeitado com `ingrediente_consumido_por_contagem`.
2. **Perfil**: quando há utilizador autenticado (`auth.uid()` não nulo), um
   `internal_use` ou `waste` só é aceite para `owner`, `gestor` ou `cozinha`;
   `balcao` e `consultor` são rejeitados com `perfil_sem_permissao`. Chamadas
   sem utilizador (edge functions com service role) **não** são afectadas — o
   abate do SAF-T (`sale_depletion`) e qualquer escrita por service role passam.

`stock_movement_apply`/`stock_movement_revert` (0016) não mudaram.

## RPC de consumo por prato

`public.register_dish_consumption(p_restaurant_id uuid, p_menu_item_id uuid,
p_portions numeric, p_kind text, p_reason text, p_note text) returns jsonb`

- `SECURITY INVOKER`: a RLS e as guardas (modo de consumo, perfil) aplicam-se ao
  caller. Um `balcao` é travado pela `stock_movement_guard` (`perfil_sem_permissao`).
- `p_kind` em `internal_use` ou `waste` (senão `kind_invalido`); `p_portions > 0`
  (senão `doses_invalidas`).
- Expande a ficha técnica do prato: por cada linha ligada a um ingrediente gera
  um `stock_movements` com `qty = -(p_portions × linha.qty ÷ servings)`
  convertida pela `unit_factor` para a unidade do ingrediente, `estimated =
  (ficha.status = 'rascunho')`, `reason = p_reason`, `note = p_note`,
  `source = 'manual'`.
- Linhas livres (`linha_livre`), linhas sem conversão possível (`sem_conversao`),
  ingredientes em modo `contagem` (`contagem`) e quantidades que arredondam a
  zero (`quantidade_nula`) não geram movimento e voltam em `nao_abatidas` com o
  motivo.
- Prato sem ficha técnica: erro `prato_sem_ficha`, nada gravado. Atómico: ou
  entram todos os movimentos válidos, ou nenhum se houver erro.
- Grants: `authenticated` sim; `anon` e `public` não.

Forma do `jsonb` devolvido:

```json
{
  "menu_item_id": "...", "kind": "internal_use", "portions": 6,
  "estimated": false, "movimentos": 3,
  "abatidas": [{ "ingredient_id": "...", "name": "Massa", "qty": -300, "unit": "g", "estimated": false }],
  "nao_abatidas": [{ "ingredient_id": null, "name": "Sal grosso", "motivo": "linha_livre" }]
}
```

## Edge `import-saft`

- Os `sale_depletion` levam `estimated = true` quando a ficha do prato está em
  `rascunho`. Agregando por (fatura, ingrediente), o abate é estimado se
  **alguma** das fichas que contribuem estiver em rascunho.
- Ingredientes em `depletion_mode = 'contagem'` não são abatidos; aparecem no
  resumo da importação em `consumoPorContagem` (lista de nomes), ao lado do
  `unitMismatch`.
- A lógica pura vive em `supabase/functions/import-saft/deplete.ts`
  (`computeDepletions`), partilhada e testada por vitest
  (`apps/web/src/lib/saft-deplete.test.ts`). Idempotência por documento
  (`lineNumber`, 0030) e conversão de unidades (S1) intactas.

## Espelhos puros no cliente (`apps/web/src/lib`)

- `consumo.ts`: `previewDishConsumption` (espelha a RPC para a pré-visualização
  do consumo por prato), `orderFichasPorValidar` (fila de fichas por validar,
  ordenada pelas unidades vendidas 90d), `internalUseTotalCents` (total do mês
  ao custo médio), `CONSUMPTION_REASONS` / `REASON_LABEL` /
  `NAO_ABATIDA_MOTIVO_LABEL`.
- `stock.ts`: `MOVEMENT_KIND_LABEL` ganha `internal_use` = "Consumo interno".

## Excepções (P0001) introduzidas

`ingrediente_consumido_por_contagem`, `perfil_sem_permissao`, `prato_sem_ficha`,
`kind_invalido`, `doses_invalidas`.

## Fora do S2 (para o S06 não assumir)

- Sessões de contagem, parciais, densidade, relatório de desvio e o tipo de
  movimento `count_consumption`: Sprint 06. O modo `contagem` do S2 só impede o
  abate por vendas/consumo interno; o apuramento por contagem é do S06.
- `density_g_per_ml` e conversão `un`↔volume: Sprint 06.
