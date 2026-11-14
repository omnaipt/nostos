# Sprint 04: verificação independente

Auditor: agente independente (não implementou o código). Data: 2026-11-14.
Branch verificada: `feat/stock-s1` (HEAD `ada1c27`). Base: `origin/main` (`def2202`).

Método: para cada critério de aceitação da `specs/sprint-04.md` procurei evidência
própria. Gates locais corridos nesta sessão. Leitura directa da migração 0031, do
teste pgTAP, do diff da edge `import-saft` e das migrações 0011/0016 (para aferir a
premissa sobre os triggers), e do código da UI. O output do pgTAP
(`specs/sprint-04-pgtap-output.txt`) é aceite como execução; confirmei que cada
teste cobre o critério correspondente.

Nota sobre a base: `origin/main` após `git fetch` é `def2202`, ancestral directo de
HEAD. Logo `git diff origin/main...HEAD` é o conjunto completo de alterações do ramo
(20 ficheiros), que é a lista autoritativa para o âmbito.

Classificação: **entregue** / **parcial** / **em falta**.

---

## Gates de qualidade

| Gate | Resultado | Evidência |
|---|---|---|
| `pnpm typecheck` | **entregue** | exit 0 (`@stoa/web tsc --noEmit` sem erros). |
| `pnpm lint` | **entregue** | exit 0 (sem script `lint` em `@stoa/web`; Turbo 0 tarefas, como nos sprints anteriores). |
| `pnpm test` | **entregue** | exit 0 — **20 ficheiros, 208 testes verdes** (vitest). |
| `pnpm build` | **entregue** | exit 0 (`vite build` OK). |

## Item 1 — Migração 0031: conversão de unidades e peso médio

| Critério | Classe | Evidência |
|---|---|---|
| `ingredients.unit_weight_g numeric(10,3)` opcional, `> 0`, com `comment on` | **entregue** | `0031_stock_formatos.sql:15-19` (check + comment). |
| `public.unit_factor(...)` IMMUTABLE, grandezas + `un`↔peso, null quando impossível | **entregue** | `0031:26-48`; confere exactamente com o contrato (g↔kg, ml↔l, un↔g/kg via peso, else null). |
| Guarda de `stock_movements` aceita unidade diferente quando há conversão (normaliza qty/unit/custo inverso); senão rejeita `grandeza_diferente_do_ingrediente` | **entregue** | `0031:266-277` (ramo sem embalagens). |
| Mesma unidade: comportamento inalterado | **entregue** | `0031:267` só entra no bloco quando `v_unit <> new.unit`; caso igual devolve `new` intacto (como 0011). |
| pgTAP: 2 kg→2000 g, 10 l→10000 ml, 2 un@150→300 g, un sem peso rejeitado, kg em ml rejeitado | **entregue** | `0015_stock_formatos.sql` A1-A5 (linhas 60-103); vitest `tech-sheet-cost.test.ts:92-113` repete os 5 casos. |

## Item 2 — Migração 0031: famílias e artigos de compra

| Critério | Classe | Evidência |
|---|---|---|
| `ingredient_families` (nome único por restaurante sem maiúsculas, RLS, guarda de tenant) | **entregue** | `0031:57-77` (índice `lower(name)`, policy `_member_all`); FK no ingrediente + guarda `ingredient_family_guard` `0031:80-102`. |
| `ingredients.family_id` opcional com guarda de mesmo restaurante | **entregue** | `0031:80-93` (`familia_de_outro_restaurante`). |
| `purchase_items` com todas as colunas e guarda (mesmo restaurante + convertibilidade) | **entregue** | `0031:109-165`; guarda `purchase_item_guard` `0031:139-158` (`ingrediente_de_outro_restaurante`, `formato_incompativel_com_ingrediente`). `catalog_item_id` sem FK. |
| `supplier_product_aliases.purchase_item_id` opcional com guarda (mesmo restaurante + mesmo ingrediente); aliases antigos válidos | **entregue** | `0031:168-194` (recria guarda da 0018; `artigo_de_outro_restaurante_ou_ingrediente`). |
| `stock_movements.purchase_item_id` + `packs`; `packs×pack_qty` convertido; qty tem de coincidir (tol. 0,001) | **entregue** | `0031:197-263` (ramo embalagens: `packs_so_em_purchase`, `packs_exige_artigo`, `qty_nao_coincide_com_embalagens`). |
| Custo médio a 6 meses (0016) continua correcto com entradas por embalagens | **entregue (com observação)** | Arquitecturalmente garantido: `stock_movement_apply`/`revert` da 0016 NÃO são recriados (correm AFTER, vêem qty/custo já normalizados pelo guard). pgTAP exercita o saldo normalizado (B3: `stock_qty=20`) e o custo gravado (B1: 398/l), mas **não assevera `ingredients.cost_per_unit_cents`/`ingredient_avg_cost` após uma entrada por packs**. Ver §Verificações. |
| pgTAP: isolamento entre dois restaurantes; 2×5 l em `l`→10 l e custo/l; mesma entrada em `ml`→10000 ml; duas marcas somam | **entregue** | `0015` B1 (10 l, custo 398), B2 (10000 ml), B3 (`stock_qty=20`), B6 convertibilidade, B7/B8 aliases, e isolamento Owner B (linhas 176-195: não vê/insere/liga artigos do tenant A). `plan(28)` coerente com 28 asserções contadas. |

## Item 3 — Conversão partilhada no cliente e na edge import-saft

| Critério | Classe | Evidência |
|---|---|---|
| `computeLineCostCents`/`computeFoodCost` aceitam peso médio e convertem `un`↔g/kg; testes antigos verdes + novos | **entregue** | `lib/types.ts:193-227` (`unitFactor` espelha o SQL) e `237-256`; `tech-sheet-cost.test.ts` casos novos `un`↔peso (linhas 42-47) e os 5 do item 1. |
| `import-saft` `toIngredientUnit` usa a mesma regra com `unit_weight_g`; `un` contra peso deixa de cair em `unitMismatch`; resto da função intacto | **entregue** | diff `import-saft/index.ts`: só 2 hunks — nova `unitFactor`/`toIngredientUnit` e o `select` passa a ler `unit_weight_g` e a passá-lo. Idempotência intacta (ver §Verificações). |
| Tabela de casos única documentada no topo de cada ficheiro | **entregue** | cabeçalhos iguais em `types.ts:184-192`, `purchase-items.ts:1-3`, `import-saft/index.ts` (comentário da `unitFactor`). |
| Caso-âncora "Azeite Gallo VE 5L, 2 un, 39,80 €" → 10 l a 398 cents/l | **entregue** | `purchase-items.test.ts:86-97` (asserção explícita `qty=10`, `baseCostCents=398`). |

## Item 4 — Entrada de compra por embalagens e leitura de faturas

| Critério | Classe | Evidência |
|---|---|---|
| Linha permite escolher artigo + nº embalagens; qty na unidade do ingrediente e custo por unidade base calculados antes de gravar; entrada directa ainda disponível | **entregue** | `Entradas.tsx` `LineArticleControls` (selector, `packs`, pré-visualização `previewQty`/`previewCost`); submit usa `packEntryQty`/`packEntryBaseCostCents` (`Entradas.tsx:232-274`); ramo de entrada directa preservado. |
| Linha sem artigo: propõe criar artigo com marca/formato/conteúdo lidos da linha, editável; ao confirmar grava alias com `purchase_item_id` | **entregue** | `proposeArticleFromRawName` + formulário de criação; `use-entries.ts` upsert de alias com `purchase_item_id` (linhas 68-79). |
| Segunda fatura do mesmo fornecedor com o mesmo nome propõe o mesmo artigo e embalagens sem intervenção | **entregue** | `Entradas.tsx` `aliasArticleByKey` por `supplier_norm\|raw_name_norm`; `applyParse` preenche `purchaseItemId`/`packs` quando o alias já aprendeu artigo. |
| Despensa: ingrediente mostra artigos e família; criar/editar/desactivar artigos e atribuir família; mesma família aparece junta | **entregue** | `ArticlesPanel.tsx` (família, peso médio, criar/editar/desactivar artigos); `Pantry.tsx` agrupa por família (ordenação) e mostra `familyLabel`, monta `ArticlesPanel`. |
| No ingrediente preenche-se peso médio; ficha deixa de marcar sem custo as linhas `un` contra peso quando existe | **entregue** | `ArticlesPanel.tsx:95-111` (`saveWeight`→`unit_weight_g`); `TechSheetDialog.tsx`/`MenuManager.tsx` passam `unit_weight_g` a `computeFoodCost`/`computeLineCostCents`. |
| Testes de lógica (embalagens + proposta a partir do alias) | **entregue** | `purchase-items.test.ts` (17 casos: `packEntryQty`, `packEntryBaseCostCents`, `parsePackFromText`, `proposeArticleFromRawName`, `proposeEntryFromAlias`). |
| Capturas/passo a passo manual | **entregue (fora do meu âmbito de edição)** | Passo a passo em `TESTING.md` (não editado); capturas visuais ficam para o orquestrador/David (Blockers da spec). Não verifico execução manual. |

## Item 5 — Fecho

| Critério | Classe | Evidência |
|---|---|---|
| Gates verdes com output na spec | **entregue** | confirmado nesta sessão (ver §Gates). |
| pgTAP escrito com `plan(N)` coerente | **entregue** | `0015` `plan(28)`; contei 28 asserções (A1-A5, B1-B8, 4 de isolamento). |
| Contrato em `docs/specs/stock-s1-contract.md` | **entregue** | contrato presente e consistente com a migração (tabelas, colunas, funções, excepções). |
| Commits pequenos em português com prefixo `stock s1:` | **entregue** | `git log`: `a4bf313`, `7c08dc8`, `00fb076`, `ada1c27` todos com prefixo. |

## Verificações específicas pedidas

**1. A 0031 recria `stock_movement_apply`/`revert` a partir da 0016 (não da 0011).**
Classe: **entregue, com ressalva à premissa.** A 0031 **não recria** `stock_movement_apply` nem `stock_movement_revert` — recria **apenas** `stock_movement_guard` (`0031:210-279`). Confirmei que a 0016 (`0016_avg_cost_6m.sql:25-55`) é a última definição destas duas funções (com `ingredient_avg_cost`) e que a 0011 (`0011_stock.sql:66-102`) é a versão antiga (último custo / revert simples). Como a 0031 não lhes toca, mantêm-se na versão da 0016 — ou seja, o risco que o critério pretende evitar (regredir para a 0011) **não se materializa**, e o custo médio continua correcto porque o guard normaliza qty/custo *antes* do AFTER INSERT. Resultado correcto; a formulação "recria a partir da 0016" não é literalmente exacta (não há recriação).

**2. O diff de `import-saft/index.ts` limita-se à conversão e preserva a idempotência por documento (lineNumber).**
Classe: **entregue.** O diff tem só 2 hunks: (a) substitui `toIngredientUnit` por `unitFactor` + wrapper com `unit_weight_g`; (b) `select` passa a incluir `unit_weight_g` e a passá-lo na conversão. A idempotência está intacta e fora do diff: `upsert(..., { onConflict: "restaurant_id,invoice_no,line_number" })` e o parsing de `lineNumber` (`index.ts:178, 525-542`) não são tocados.

**3. Ficheiros fora do âmbito da spec.**
Classe: **nenhum fora de âmbito.** Os 20 ficheiros do diff mapeiam todos para itens da spec:
TESTING.md (it.4/5), MenuManager.tsx + TechSheetDialog.tsx (it.4, food cost com peso), ArticlesPanel.tsx + use-purchase-items.ts (it.4, novos), use-entries.ts + Entradas.tsx + Pantry.tsx (it.4), query-keys.ts (it.4, chaves dos hooks novos), database.types.ts (it.1/2, convenção de tipos à mão), purchase-items.ts + purchase-items.test.ts (it.3/4), types.ts + tech-sheet-cost.test.ts (it.3), import-saft/index.ts (it.3), 0031_stock_formatos.sql (it.1/2), 0015_stock_formatos.sql (it.5), stock-s1-contract.md + sprint-04.md + sprint-04-pgtap-output.txt (it.5/orquestrador). Não há alterações a `0030_saft_idempotencia.sql` nem a seeds/dados de tenant (fora de âmbito respeitado).

**4. Travessão em textos de interface novos e comentários novos.**
Classe: **1 violação (menor).** Grep por `—`/`–`/`―` nas linhas adicionadas:
- **Violação:** `apps/web/src/hooks/use-purchase-items.ts:14` — comentário novo `"...convertíveis — aqui só se reporta o erro ao utilizador."` tem travessão. Viola a regra 26 do repo (comentários sem travessão).
- Textos de interface (JSX) novos em `Entradas.tsx`/`ArticlesPanel.tsx`/`Pantry.tsx`/`TechSheetDialog.tsx`: **sem travessão** (usam `·`, `=`, `…`, `->`).
- Migração 0031, pgTAP 0015, `database.types.ts`, `purchase-items.ts`, `types.ts` (comentários novos): **sem travessão** (usam `->`, `↔`, `×`).
- `TESTING.md` tem `—` em títulos/prosa, mas é documentação (não interface nem comentário de código) e está fora do âmbito de edição pedido.

## Veredicto global

**Aprovado com reservas.**

O sprint está funcionalmente completo e correcto: os quatro gates passam (typecheck,
lint, test 208/208, build), a migração 0031 e o pgTAP cobrem os critérios SQL, a
conversão é consistente entre SQL/cliente/edge (caso-âncora asseverado), o diff da
edge limita-se à conversão preservando a idempotência, e não há ficheiros fora de
âmbito. A premissa sobre `apply`/`revert` resolve-se correctamente (mantidos na 0016,
não regredidos para a 0011).

### Correções necessárias (bloqueantes de convenção, triviais)

1. **Travessão em comentário novo** — `apps/web/src/hooks/use-purchase-items.ts:14`:
   substituir `—` por `-` (ou reescrever a frase) para cumprir a regra 26.

### Observações (não bloqueiam)

2. **Cobertura do pgTAP (item 2, custo médio com packs):** o teste valida o saldo
   normalizado (`stock_qty=20`) e o custo gravado no movimento (398/l) após entradas
   por embalagens, mas não assevera directamente `ingredients.cost_per_unit_cents`
   nem `ingredient_avg_cost` após uma entrada por packs. A correcção está garantida
   por construção (apply da 0016 corre sobre valores já normalizados); uma asserção
   explícita reforçaria a evidência.
