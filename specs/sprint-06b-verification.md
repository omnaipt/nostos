# Verificação independente — Sprint 06b (afinações da entrada de faturas)

Auditor: revisão independente (não implementei este código). Data: 2026-11-14.
Branch: `feat/rest-entradas-afinacoes`. Base de comparação: `origin/main`.
Método: gate próprio + leitura das funções de `apps/web/src/lib` e do diff de
`apps/web/src` contra `origin/main`. Não corrigi nada; não toquei em TESTING.md,
na spec, em supabase, vercel ou git push.

## Gate (evidência própria)

`pnpm turbo run typecheck test build --force` — **verde** (corrido nesta sessão,
Windows, turbo 2.9.18):
- typecheck: sem erros.
- test: 22 ficheiros, **262 testes** passam; `purchase-items.test.ts` com **56 testes**.
- build: `vite build` OK (mantém o aviso pré-existente de chunk > 500 kB).
- Sem script `lint` no repo (confirmado).

Ficheiros alterados vs `origin/main` (6): `TESTING.md`, `specs/sprint-06b.md`,
`apps/web/src/hooks/use-entries.ts`, `apps/web/src/lib/purchase-items.ts`,
`apps/web/src/lib/purchase-items.test.ts`, `apps/web/src/pages/Entradas.tsx`.
**Sem alterações** a `supabase/functions/parse-invoice` nem `supabase/migrations`.

## Critérios de aceitação

### Item 1 — preço ao escolher artigo existente

- **Entregue** — `existingArticleTransition` (purchase-items.ts:223) deriva embalagens
  por `packsOnArticleChange` e preço por `packCostCentsFromInvoice`, sem apagar preço
  do utilizador (`hasUserCost`). O ecrã usa-a em `applyArticle` (Entradas.tsx:836,
  `hasUserCost: line.cost.trim() !== ""`) e na pré-escolha do parse (Entradas.tsx:221).
- **Entregue** — teste `existingArticleTransition (06b item 1)` (test.ts:214): 2 un a 1990,
  artigo 5 l → packs "2", packCostCents 1990; confirma 10 l e 398 cents/l. Casos extra:
  não apaga preço do utilizador; fora de `un` cai na conversão sem preço.

### Item 2 — sugerir artigo existente em vez de propor novo

- **Entregue** — `articlesMatchingContent` (purchase-items.ts:256) com 1 compatível:
  `applyParseResult` pré-escolhe (id, embalagens, preço) e `autoCreateArticle` fica
  `false` (Entradas.tsx:213-262); nota "Artigo existente sugerido; confirme."
  em `LineArticleControls` (Entradas.tsx:932).
- **Entregue** — com >1 compatível: `autoCreateArticle` fica `false` (compatible.length===0
  é condição para abrir) e `orderedArticles` põe os compatíveis à frente (Entradas.tsx:919).
- **Entregue** — sem compatível: `articlesMatchingContent` devolve `[]` →
  `shouldOpenNewArticle` decide como no sprint 06 (Entradas.tsx:235).
- **Entregue** — alias liga ao artigo pré-escolhido: `aliasItems` inclui
  `purchaseItemId: l.purchaseItemId || null` (Entradas.tsx:410), alimentado pela pré-escolha.
- **Entregue** — testes `articlesMatchingContent (06b item 2)` (test.ts:265): 1 compatível,
  120 g = 0,12 kg, >1 compatível, vazio.

### Item 3 — marca proposta

- **Entregue** — `QUALITY_TERMS` + regra do ponto em `proposeArticleForIngredient`
  (purchase-items.ts:145, 399-405): escolhe a 1.ª palavra válida antes do conteúdo.
  Mesma função usada pelo ecrã (Entradas.tsx importa de `@/lib/purchase-items`).
- **Entregue** — teste `marca proposta (06b item 3)` (test.ts:457) com os 6 nomes da spec:
  Gallo, Gallo, Ramirez, Milaneza, Cigala, "" (vazio para SAL MARINHO GROSSO). Verdes.
- **Entregue** — "5 LT"→5 l e "GR"→g em `parsePackFromText`/`CONTENT_RE`
  (purchase-items.ts:50-56, 155); teste test.ts:471.

### Item 3b — fatura já registada bloqueia o registo

- **PARCIAL** — ver secção dedicada abaixo. A regra de normalização e a chave partilhada
  estão corretas; a verificação corre só sobre as 300 entradas mais recentes carregadas
  no cliente, pelo que uma fatura antiga pode passar.
- **Entregue** (chave partilhada) — `purchaseEntryNote` (purchase-items.ts:466) usada por
  `useCreatePurchaseEntry` (use-entries.ts:48) e por `invoiceAlreadyRegistered`; o valor
  gravado é idêntico ao anterior (`Fatura {fornecedor} {nº}`.trim()), logo não diverge.
- **Entregue** (discriminação) — testes `invoiceAlreadyRegistered (06b item 3b)` (test.ts:477):
  bloqueia mesmo fornecedor+nº; ignora maiúsculas/acentos/espaços; não bloqueia nº diferente
  nem o mesmo nº de outro fornecedor; lista vazia nunca bloqueia.

### Item 4 — fecho

- **Entregue** — gate verde (acima). TESTING.md e commits `entradas:` existem (não verificados
  quanto a conteúdo por estarem fora do âmbito de código; não os alterei).

## Verificações específicas pedidas

### Testes usam os casos das faturas de teste e as mesmas funções do ecrã

- **Confirmado.** As funções testadas são as que o ecrã importa de `@/lib/purchase-items`
  (não cópias): `existingArticleTransition`, `articlesMatchingContent`, `invoiceAlreadyRegistered`,
  `purchaseEntryNote`, `proposeArticleForIngredient`, `parsePackFromText`. Verificado nos
  imports de `Entradas.tsx` e `use-entries.ts`.
- Casos da spec presentes nos testes: 24 un → 24 embalagens (test.ts:137); 10 kg/1 kg → 10
  (:144); 10 l/5 l → 2 (:151); 7 kg/5 kg vazio e assinalado (:158); azeite 2×19,90 → 398 cents/l
  (:233, :375); arroz 10×1,29 → 129 cents/kg (:376); atum 24×1,65 → 165 cents/un (:378);
  propostas de nome/unidade/marca/formato para ARROZ CAROLINO CIGALA 1KG, AZEITE V.EXTRA GALLO
  GARRAFAO 5L, ATUM POSTA AZEITE RAMIREZ 120G, SAL MARINHO GROSSO 1KG (:387-468).

### Nenhum caminho deixa embalagens em 1 havendo quantidade lida

- **Confirmado.** Os dois caminhos de passagem a artigo (escolher no seletor, Entradas.tsx:914-915;
  criar, Entradas.tsx:890-891) passam por `applyArticle`, que usa `existingArticleTransition` →
  `packsOnArticleChange`. Com fatura em `un` as embalagens são `invoiceQty`; caso contrário
  `packsFromDirectQty`, que devolve "" assinalado (nunca 1) quando não dá inteiro. Não há
  default de 1 em nenhum ramo.

### Bloqueio do item 2 não impede linhas válidas nem faturas sem leitura automática

- **Confirmado.** `lineBlockReason` (purchase-items.ts:291) só bloqueia quando a unidade da
  fatura não converte **e** não há artigo; com artigo escolhido, unidade convertível, ou sem
  unidade lida (`invoiceUnit == null`, caso das faturas sem parse) devolve `null`. Testes test.ts:345-361.

### Criar ingrediente respeita perfis e aparece sem recarregar

- **Confirmado.** O `CreateIngredientInline` só renderiza com `mayManagePantry`
  (Entradas.tsx:637), `canManagePantry` = owner | gestor | cozinha (roles.ts:71); balcão e
  consultor ficam de fora. `useCreateIngredient` tem `onSuccess: invalidate` que invalida
  `queryKeys.ingredients` (use-ingredients.ts:30, 59) → refetch → as outras linhas (que lêem
  do mesmo `ingredientsQuery.data`) mostram o novo ingrediente sem reload.

### Passagem de grafia — só texto visível?

- **Não aplicável a este diff.** O diff 06b **não contém** uma passagem de grafia: não altera
  `i18n.ts` (textos ES/FR intactos), nem nomes de variáveis, chaves, rotas ou valores gravados
  na BD. O único valor potencialmente "gravado" tocado — a `note` em `use-entries.ts` — passou
  a vir de `purchaseEntryNote`, mas o valor é **idêntico** (`Fatura {fornecedor} {nº}`.trim()),
  logo sem mudança de dados.
- **Texto visível novo:** as duas strings de interface novas ("Esta fatura já está registada…"
  e "Artigo existente sugerido; confirme.") estão em grafia pós-Acordo, sem palavras pré-Acordo.
- Palavras pré-Acordo em `apps/web/src` (varrimento global): existem muitas ocorrências, mas
  em **identificadores** (`useActiveRestaurant`, campo `active`, `contacto` como chave),
  **comentários** (estilo pt-PT pré-Acordo da casa) e `database.types.ts`/`i18n.ts` — nenhuma
  introduzida por este diff em texto visível. Sem regressão de grafia atribuível ao 06b.

### Sem alterações a parse-invoice nem migrations

- **Confirmado** — `git diff --stat origin/main...HEAD` não lista nada em
  `supabase/functions/parse-invoice` nem `supabase/migrations`.

### Travessão em textos/comentários novos

- **Falha (menor).** Dois **comentários novos** contêm travessão `—`:
  - `apps/web/src/lib/purchase-items.ts` (bloco do item 2): "…ingrediente — por exemplo 5 l…".
  - `apps/web/src/pages/Entradas.tsx` (guarda do item 3b): "…único por fornecedor e série — uma…".
  - Os **textos de interface** novos estão limpos (sem travessão).

## Item 3b em detalhe (prioridade)

- **Normalização:** `normNote` = minúsculas sem acentos + espaços colapsados sobre
  `purchaseEntryNote(fornecedor, nº)` (purchase-items.ts:470-480). Compara fornecedor **e**
  número na mesma string. Correto para o requisito (minúsculas, acentos, espaços).
- **Fonte da comparação:** `onSubmit` passa `(entriesQuery.data ?? []).map(g => g.note)`
  (Entradas.tsx:324). `entriesQuery` = `useRecentPurchaseEntries`, que faz
  `select * … order created_at desc .limit(300)` (use-entries.ts:109-120). **Não consulta a
  BD direcionada à fatura**; usa apenas as 300 entradas mais recentes já carregadas no cliente.
- **Classificação: PARCIAL.** Uma fatura registada há mais tempo, empurrada para fora das 300
  entradas mais recentes por entradas posteriores, **não é apanhada** e pode ser re-registada —
  o que contraria a decisão do David ("bloquear sempre"). A própria spec reconhece o limite no
  Blocker, mas o critério pede bloqueio incondicional.
- **Consulta direta que resolve sem migração:** em `onSubmit`, antes de gravar, consultar a BD
  filtrando pelo número da fatura e não pela lista limitada, p.ex.:
  ```ts
  const { data } = await supabase
    .from("stock_movements")
    .select("note")
    .eq("restaurant_id", restaurantId)
    .eq("kind", "purchase").eq("source", "invoice")
    .eq("source_ref", invoiceNo.trim());   // nº exato, varre toda a tabela
  const dup = invoiceAlreadyRegistered(supplier.trim(), invoiceNo.trim(),
                                       (data ?? []).map(r => r.note));
  ```
  `source_ref` guarda o número da fatura (use-entries.ts:58), pelo que o `.eq` devolve o
  conjunto pequeno de movimentos com esse número (qualquer idade), e a comparação normalizada
  do fornecedor fecha a verificação — sem índice novo nem migração.

## Item 1/2 — caso do azeite com fornecedor novo

- **Confirmado.** Artigo existente de 5 l pré-escolhido (2 embalagens, 19,90 preenchido,
  10 l a 3,98 €/l): `articlesMatchingContent("…5 LT", [5 l])` devolve o único (test.ts:268);
  `existingArticleTransition` com `invoiceUnit:"un", invoiceQty:2, cost:1990` → packs "2",
  packCostCents 1990, 10 l, 398 cents/l (test.ts:218-234). O ecrã reproduz isto em
  `applyParseResult` (Entradas.tsx:216-262). Fornecedor novo: o alias passa a ligar ao artigo
  escolhido via `purchaseItemId` em `aliasItems` (Entradas.tsx:410).

## Item 3 — marcas para os seis nomes

- **Confirmado** (test.ts:462-468): AZEITE GALLO V.EXTRA 5 LT → **Gallo**; AZEITE V.EXTRA GALLO
  GARRAFAO 5L → **Gallo**; ATUM RAMIREZ POSTA AZEITE 120 GR → **Ramirez**; MASSA ESPARGUETE
  MILANEZA 500G → **Milaneza**; ARROZ CAROLINO CIGALA 1KG → **Cigala**; SAL MARINHO GROSSO 1KG
  → **""** (vazio). Gate confirma verdes.

## Veredicto global

**Aprovado com reservas.**

O núcleo funcional (itens 1, 2, 3 e as peças de suporte do 3b) está entregue, testado com os
casos da spec, e ligado às mesmas funções no ecrã; gate verde; âmbito respeitado (sem tocar em
parse-invoice, migrations, i18n ou feat/stock-s2). As reservas:

### Correções necessárias

1. **Item 3b (parcial → fechar o buraco):** a verificação de duplicado depende das 300 entradas
   recentes; uma fatura antiga pode re-registar-se, contra a decisão "bloquear sempre". Trocar a
   fonte da comparação por uma consulta direta à BD por `source_ref` (nº da fatura) no `onSubmit`,
   conforme o snippet acima — sem migração.

### Correções menores (opcionais, de estilo)

2. **Travessão em comentários novos:** remover o `—` dos dois comentários novos
   (`purchase-items.ts` bloco do item 2; `Entradas.tsx` guarda do item 3b) para cumprir a regra
   de não usar travessão em comentários novos. Não afeta funcionalidade.
