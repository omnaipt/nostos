# Verificação independente — Sprint 05 (Stock S2)

Auditor: agente independente (não implementou o código). Data: 2026-11-14.
Branch: `feat/stock-s2` (HEAD 28c480f). Base: `origin/main` (d4a34d4).

Método: para cada critério de aceitação da `specs/sprint-05.md` recolhi evidência
própria — gates (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, corridos
sem cache turbo), leitura da migração 0033, do teste pgTAP
`0016_stock_consumo_interno.sql`, do diff da edge `import-saft` contra `origin/main`
e do código da interface. A corrida do pgTAP (39/39,
`specs/sprint-05-pgtap-output.txt`) é aceite como evidência dos itens SQL; confirmei
a cobertura asserção a asserção.

Classificação por critério: **entregue** / **parcial** / **em falta**.

---

## Gates (evidência própria, sem cache)

| Gate | Comando corrido | Resultado |
|---|---|---|
| Typecheck | `npx tsc --noEmit` em `apps/web` (cache turbo contornado) | ✅ sem erros (`TYPECHECK_OK`) |
| Testes | `npx vitest run` | ✅ **22 ficheiros, 221 testes** verdes; inclui `consumo.test.ts` (6) e `saft-deplete.test.ts` (7) |
| Build | `pnpm build` → `vite build` (corrida fresca, 1836 módulos, 12,78 s) | ✅ OK; aviso de chunk >500 kB **pré-existente** |
| Lint | `pnpm lint` | ⚠️ **sem script `lint`** em `@stoa/web` (condição pré-existente a este sprint; ver reserva R2) |

O número 221 bate certo com a Evidência da spec. O aviso de chunk existe em `main`.

---

## Item 1 — Migração 0033 (tipos, motivo, estimado, modo de consumo, guardas)

| Critério | Classe | Evidência |
|---|---|---|
| `kind` aceita `internal_use` (sempre negativo); coerência de sinal actualizada sem afectar os tipos existentes | entregue | 0033 L17-28: drop+recreate de `kind_check` e `sign_coherent`; `internal_use` no grupo `qty < 0` com `purchase>0`/`adjustment<>0` intactos. pgTAP A1 (entra), A2 (positivo rejeitado 23514) |
| `reason` opcional com domínio; obrigatório em `internal_use`, livre em `waste`, nulo nos restantes | entregue | 0033 L31-49: CHECK de domínio + `reason_coherent` (CASE por kind). pgTAP A3 (sem motivo→23514), A4 (domínio→23514), A5/A6 (waste com/sem), A7 (purchase+motivo→23514) |
| `estimated boolean not null default false` | entregue | 0033 L34. pgTAP A1b (default false) e A8b (grava true) |
| `ingredients.depletion_mode` default `'ficha'`, {ficha,contagem}, com `comment on` | entregue | 0033 L56-60 (CHECK + `comment on`). pgTAP A0 (default ficha) |
| Guarda modo de consumo: `sale_depletion`/`internal_use` em `contagem` → `ingrediente_consumido_por_contagem` | entregue | 0033 L104-106. pgTAP A9 (sale_depletion, P0001) e A10 (internal_use, P0001) |
| Guarda de perfil: com `auth.uid()`, `internal_use`/`waste` só owner/gestor/cozinha; service role não afectado | entregue | 0033 L89-93. pgTAP gestor/cozinha (lives), balcao/consultor (`perfil_sem_permissao`), service role (lives) |

**0033 recria a guarda da 0032 sem perder nada (verificado linha a linha):** comparei
`stock_movement_guard` da 0032 (`0032_stock_formatos.sql` L210-279) com a da 0033. Os
blocos de **entrada por embalagens** (packs × pack_qty × `unit_factor`, conferência de
`qty`, normalização de `cost_per_unit_cents` por `v_factor`, `new.qty := v_expected`) e
de **conversão sem embalagens** são **idênticos byte-a-byte** (0033 L108-157 ≡ 0032
L228-277). As únicas diferenças são aditivas: a leitura do ingrediente passa a trazer
`depletion_mode`, e acrescentam-se a guarda de perfil (b) e o check de contagem (a).
Nenhuma normalização ou conversão da 0032 foi removida.

**Reordenação da guarda de perfil (iteração 3) não abre caminho cross-tenant:** a guarda
(b) corre antes da leitura do ingrediente (0033 L89-93) mas **só lança excepções, nunca
devolve `new` com sucesso** — ou levanta `perfil_sem_permissao`, ou cai para a leitura
seguinte. Análise dos caminhos para um membro de **outro** restaurante a escrever no
restaurante A:
- `internal_use`/`waste`: `member_role(A)` devolve null para quem não é membro de A →
  `coalesce(...,'')` fora de {owner,gestor,cozinha} → `perfil_sem_permissao`. Bloqueado.
- `sale_depletion`/`purchase`/`adjustment`: a guarda (b) não se aplica; cai na leitura
  `where g.id = new.ingredient_id and g.restaurant_id = new.restaurant_id` sob RLS →
  `v_unit null` → `ingrediente_de_outro_restaurante`. Bloqueado.
- Além disso a política RLS de INSERT em `stock_movements` (0011) exige pertença ao
  tenant, independente da guarda.
Conclusão: a reordenação muda apenas **qual** excepção é devolvida ao consultor/balcao,
não **se** o movimento é travado. Não enfraquece o isolamento de tenant.

**plan(39) coerente:** contei as asserções do ficheiro (A: 18, B: 17, C: 4) = 39,
igual ao `plan(39)` e ao output do orquestrador.

## Item 2 — RPC `register_dish_consumption`

| Critério | Classe | Evidência |
|---|---|---|
| Assinatura, `SECURITY INVOKER`, `p_kind∈{internal_use,waste}`, `p_portions>0` | entregue | 0033 L177-205 (`security invoker`; `kind_invalido`/`doses_invalidas`). pgTAP B5 |
| Expande a ficha: `-(portions×qty÷servings)` convertido por `unit_factor`, `estimated=(status='rascunho')`, motivo, nota, `source='manual'` | entregue | 0033 L219-263. pgTAP B1 (6 doses/2 servings: Massa −300, Molho −150, Queijo −60; estimated false), B2 (rascunho → estimated true) |
| Linhas livres, sem conversão e contagem não geram movimento e voltam em `nao_abatidas`; quantidade nula idem | entregue | 0033 L228-252 (`linha_livre`/`contagem`/`sem_conversao`/`quantidade_nula`). pgTAP B3 (2 em `nao_abatidas`; contagem com 0 movimentos). `sem_conversao`/`quantidade_nula` cobertos no cliente (`consumo.test.ts`) |
| Prato sem ficha → `prato_sem_ficha`, nada gravado; atómico | entregue | 0033 L212-214. pgTAP B4 (P0001 + contagem de `stock_movements` inalterada) |
| Grants: `authenticated` sim; `anon`/`public` não | entregue | 0033 L279-280. pgTAP B7 (has_function_privilege) |
| Perfil `balcao` travado | entregue | Pela `stock_movement_guard` (INVOKER). pgTAP B6 (`perfil_sem_permissao`) |

## Item 3 — Edge `import-saft`

| Critério | Classe | Evidência |
|---|---|---|
| `sale_depletion` com `estimated=true` quando a ficha está em rascunho (agregado: estimado se ALGUMA contribuinte em rascunho) | entregue | `deplete.ts` L107,132,139 (`cur.estimated = cur.estimated \|\| isDraft`). `index.ts` selecciona `status`; move `estimated: d.estimated`. `saft-deplete.test.ts` ("estimado se ALGUMA ficha…") |
| Ingredientes em `contagem` não abatem; aparecem em `consumoPorContagem` ao lado de `unitMismatch` | entregue | `deplete.ts` L113-116; `index.ts` report `consumoPorContagem`. `saft-deplete.test.ts` ("não abate… lista-os em consumoPorContagem") |
| Idempotência por documento (`lineNumber`, 0030) e conversão de unidades (S1) intactas | entregue | Diff não toca o `upsert` com `onConflict:"restaurant_id,invoice_no,line_number", ignoreDuplicates:true` (`index.ts` L489-494) nem a limpeza idempotente por `note` (L176-182); `unitFactor`/`toIngredientUnit` migraram verbatim para `deplete.ts` L20-44 |

**Diff contra `origin/main` (resumo):** `index.ts` apenas (a) importa `computeDepletions`/
`Sheet` de `./deplete.ts`, (b) remove as cópias locais de `unitFactor`/`toIngredientUnit`
(agora em `deplete.ts`), (c) acrescenta `status` e `depletion_mode` aos `select`, (d)
substitui o laço de agregação inline pela chamada pura, (e) acrescenta `estimated` ao
movimento e `consumoPorContagem` ao report. Nenhuma alteração ao staging/idempotência.

## Item 4 — Interface

| Critério | Classe | Evidência |
|---|---|---|
| Registar consumo interno acessível a owner/gestor/cozinha; modos por prato e por ingrediente; pré-visualização do que sai e do que não abate | entregue | `Pantry.tsx` L66,117-119 (botão só a owner/gestor/cozinha); `ConsumoInternoDialog.tsx` (toggle Por prato/Por ingrediente; `preview` L241-279) |
| Mesmo formulário regista quebra de prato inteiro (`waste`) | entregue | `ConsumoInternoDialog.tsx` L209-214 (opção "Quebra (prato estragado)") |
| Lista de movimentos filtrável por tipo; consumo interno e quebras distinguíveis; total mensal em euros **só ao owner** | entregue | `Pantry.tsx` L455-467 (filtro inc. `internal_use`/`waste`); total em `{role === "owner" && (…)}` L177-184; `useInternalUseThisMonth`/`internalUseTotalCents` |
| Campo "Modo de consumo" no ingrediente com frase de ajuda | entregue | `Pantry.tsx` `DepletionModeField` L533-580 (Select + ajuda L574-578) |
| Fila "Fichas por validar": rascunhos ordenados por unidades vendidas 90d (saft_import_lines matched), acesso à ficha, **visível a owner e gestor** | entregue | `Margins.tsx` `FichasPorValidar` L138-186; `if (role !== "owner" && role !== "gestor") return null` L150; `orderFichasPorValidar` + `useUnitsSoldByItem` (status matched, 90d) |
| Movimentos estimados marcados | entregue | `Pantry.tsx` L504-508 (selo "estimado") |

Evidência de testes (item 4): `consumo.test.ts` cobre `previewDishConsumption`
(quantidades exactas, estimado, linha livre/contagem/sem conversão, quantidade residual),
`orderFichasPorValidar` (ordem desc + empate alfabético) e `internalUseTotalCents`.
Passos manuais em `TESTING.md` §5.1–5.6 (numerados).

## Item 5 — Reserva do sprint 04

| Critério | Classe | Evidência |
|---|---|---|
| Asserção explícita: após entrada por embalagens, `cost_per_unit_cents` e `ingredient_avg_cost` por unidade base | entregue | pgTAP grupo C (L317-329): 2 garrafões de 5 l (pack `l`) num ingrediente em `ml` a 398 c/l → `stock_qty = 10000 ml`, `cost_per_unit_cents = 0,398/ml`, `ingredient_avg_cost = 0,398/ml`. Três `is(...)` explícitos |

## Item 6 — Fecho

| Critério | Classe | Evidência |
|---|---|---|
| Gates verdes | parcial | typecheck/test/build ✅; `pnpm lint` sem script (reserva R2) |
| pgTAP escrito com `plan(N)` coerente | entregue | `plan(39)` = 39 asserções contadas |
| Contrato `stock-s2-contract.md` | entregue | presente e coerente com 0033/tipos |
| Secção em `TESTING.md` com testes manuais numerados | entregue | `TESTING.md` L308+ (§5.1–5.6) |
| Commits pequenos por item, em português, prefixo `stock s2:` | entregue | histórico `feat/stock-s2` (6 commits iniciais por item + correcções de pgTAP) |

---

## Verificações específicas pedidas

1. **0032→0033 sem perda / reordenação sem buraco de tenant** — confirmado (ver Item 1).
2. **RPC INVOKER, respeita perfil, usa `unit_factor`, não grava sem ficha** — confirmado:
   `security invoker` (L186), guarda de perfil aplica-se ao caller (B6), `unit_factor`
   L240, `prato_sem_ficha` antes de qualquer insert (B4).
3. **Diff import-saft preserva idempotência (lineNumber) e conversão S4** — confirmado
   (Item 3; `upsert onConflict` e `unitFactor` intactos).
4. **Total mensal só ao owner; fila de fichas só a owner e gestor** — confirmado
   (`Pantry.tsx` L177; `Margins.tsx` L150).
5. **Item 5 coberto por asserção explícita** — confirmado (grupo C do pgTAP).
6. **Ficheiros fora de âmbito** — o diff contra `origin/main` tem 18 ficheiros, **todos
   previstos pela spec**: migração 0033, teste 0016, `deplete.ts`+`import-saft/index.ts`
   (item 3), `ConsumoInternoDialog.tsx`/`use-consumo.ts`/`consumo.ts`/`consumo.test.ts`/
   `query-keys.ts`/`stock.ts`/`Margins.tsx`/`Pantry.tsx`/`saft-deplete.test.ts` (item 4),
   `database.types.ts` (tipos à mão, previsto), `TESTING.md`/`stock-s2-contract.md`/
   `sprint-05.md`/`sprint-05-pgtap-output.txt` (item 6). Nenhum ficheiro fora de scope.
   (A `specs/sprint-05-verification.md` é este relatório de auditoria, não entra na
   avaliação.)
7. **Travessão e Acordo Ortográfico de 1990 nos textos novos** — ver reservas R1/R3.

---

## Reservas

- **R1 (menor) — travessão em texto de interface novo.**
  `ConsumoInternoDialog.tsx:47` usa travessão (—) na `description` do diálogo, visível ao
  utilizador: *"…prova ou prato estragado — sai do stock…"*. A convenção do repo
  (CLAUDE.md / spec: "textos de interface … sem travessão") não é cumprida neste texto.
  Há ainda travessões em **comentários novos** (`deplete.ts:4`, `Margins.tsx:136`,
  `saft-deplete.test.ts:2`) e nos documentos (`TESTING.md`, contrato, spec). Atenuante:
  é o **estilo de facto de todo o repositório** — o irmão `parse-invoice/match.ts:3` tem
  o comentário idêntico com travessão, e dezenas de ficheiros pré-existentes usam — em
  comentários e como marcador "—" de valor vazio. Correção sugerida (opcional): trocar o
  travessão da `description` por dois-pontos ou ponto na string de interface.

- **R2 (menor, pré-existente) — gate `pnpm lint` inexistente.**
  `@stoa/web` não tem script `lint`; o gate "lint verde" do CLAUDE.md não é verificável.
  Não foi introduzido por este sprint (igual nos sprints anteriores). A spec declara-o
  honestamente na Evidência.

- **R3 — Acordo Ortográfico de 1990 nos textos de interface: cumprido.**
  Revistos os textos de interface novos (`ConsumoInternoDialog.tsx`, rótulos de
  `consumo.ts`, textos novos de `Pantry.tsx` e `Margins.tsx`): seguem o AO90 (ex.:
  "técnica", "está", "última", "não abatido"), sem consoantes mudas nem formas pré-AO90.
  Nota: comentários novos mantêm formas pré-AO90 ("directo" em `use-consumo.ts:8`),
  coerente com o estilo pré-AO90 dos comentários em todo o repo; fora do âmbito do
  critério (que incide sobre textos de interface).

---

## Veredicto global

**APROVADO COM RESERVAS.**

Todos os critérios de aceitação dos itens 1 a 5 estão **entregues**, com evidência
própria: migração 0033 recria a guarda da 0032 sem perder conversão/normalização e com a
reordenação de perfil a não abrir caminho cross-tenant; a RPC é `SECURITY INVOKER`,
respeita o perfil, usa `unit_factor` e não grava sem ficha; o diff da edge preserva a
idempotência por `lineNumber` e a conversão de unidades; o total mensal é só do owner e a
fila de fichas só de owner/gestor; o item 5 tem asserção explícita; o pgTAP tem
`plan(39)` coerente e cobre cada critério SQL; gates typecheck/test/build verdes (221
testes); nenhum ficheiro fora de âmbito.

As reservas são menores e não bloqueiam:
1. Travessão num texto de interface novo (`ConsumoInternoDialog.tsx:47`) e em comentários
   novos — não conforme à convenção, mas alinhado com o estilo de facto do repositório.
2. Gate `pnpm lint` inexistente (condição pré-existente, não introduzida por este sprint).

### Correções necessárias

Nenhuma bloqueante. Sugestões (opcionais, para conformidade estrita com a convenção):
- Substituir o travessão na `description` de `ConsumoInternoDialog.tsx:47` por um
  separador sem travessão (dois-pontos ou ponto).
- (Fora de scope do sprint) decidir se se acrescenta um script `lint` a `@stoa/web`, para
  o gate deixar de ser inverificável nos próximos sprints.
