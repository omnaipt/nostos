# Sprint 06 — Verificação independente

Auditor independente (não implementou o código). Base: `specs/sprint-06.md`.
Branch: `feat/rest-correcoes-entradas` vs `origin/main`. Data: 2026-11-14.

Método: gates próprios (`pnpm exec turbo run typecheck test build --force`), leitura
das funções novas em `apps/web/src/lib`, e diff de `apps/web/src` contra `origin/main`.
Cada critério classificado como **entregue** / **parcial** / **em falta** com evidência
numa linha. Nada foi corrigido; `TESTING.md` e a spec não foram tocados.

## Gates (evidência própria)

`pnpm exec turbo run typecheck test build --force` (Windows, pnpm 10.6), 14-11-2026:

- **typecheck** — `@stoa/web tsc --noEmit` sem erros. **entregue**
- **test** — 20 ficheiros, **235 testes verdes** (inclui `purchase-items.test.ts` 42 e
  `roles.test.ts` 15). **entregue**
- **build** — `vite build` OK (só o aviso pré-existente de chunk > 500 kB). **entregue**
- **lint** — `@stoa/web` não tem script `lint` (0 tarefas); não é regressão, coincide
  com o Blocker declarado na spec.

## Critérios de aceitação

### Item 1 — a quantidade da fatura nunca se perde
- **entregue.** `packsFromDirectQty`/`packsOnArticleChange` em `lib/purchase-items.ts:155-197`;
  testes com os casos-âncora da spec (24 un→24, 10 kg→10, 10 l→2, 7 kg→vazio+assinalado;
  azeite 2 un→2 embalagens) em `purchase-items.test.ts:132-206`, todos verdes.
- Volta a entrada directa converte embalagens→unidade (`backToDirect`, `Entradas.tsx:793-804`). **entregue.**
- Sem valor por omissão de 1: confirmado abaixo (verificação específica). **entregue.**

### Item 2 — linha com embalagem detetada não regista a quantidade errada
- **entregue.** `shouldOpenNewArticle` e `lineBlockReason` (`purchase-items.ts:203-231`),
  usados em `Entradas.tsx:208-215` (abre novo artigo) e `Entradas.tsx:292-301`/`511-518`
  (bloqueio + razão). Mensagem exacta "…indique a quantidade em litros." testada
  (`purchase-items.test.ts:253-257`). Etiqueta com unidade do ingrediente: `Entradas.tsx:978`.

### Item 3 — o preço vem da fatura
- **entregue.** `packCostCentsFromInvoice` (`purchase-items.ts:237-244`) + `packEntryBaseCostCents`;
  usados em `Entradas.tsx:197-205` (preenchimento) e `778-787` (ao escolher artigo).
  Testes com as faturas do David: azeite 1990→398 c/l, arroz 129→129 c/kg, atum 165→165 c/un
  (`purchase-items.test.ts:272-287`). Pré-visualização editável em `Entradas.tsx:944-963`.
  Nota do Blocker (o cliente recebe `unit_cost_cents_ex_vat` e `unit`) confirmada no código.

### Item 4 — criar ingrediente na própria linha
- **entregue.** `proposeIngredientFromRawName` (`purchase-items.ts:254-272`), testada com
  "SAL MARINHO GROSSO 1KG"→"Sal marinho grosso"/kg (`purchase-items.test.ts:295-319`).
  `CreateIngredientInline` (`Entradas.tsx:1002-1090`) com nome/unidade editáveis; depois de
  criado fica escolhido e segue para proposta de artigo quando há embalagem
  (`Entradas.tsx:588-597`). Gating de perfil e refetch verificados abaixo.

### Item 5 — proposta de artigo coerente com a unidade
- **entregue.** `proposeArticleForIngredient`/`unconvertibleFormatMessage`
  (`purchase-items.ts:277-341`), usadas em `Entradas.tsx:741`/`908-912`. Testes com os 4
  nomes da spec (ARROZ CAROLINO CIGALA 1KG, AZEITE V.EXTRA GALLO GARRAFAO 5L,
  ATUM POSTA AZEITE RAMIREZ 120G, SAL MARINHO GROSSO 1KG) em `purchase-items.test.ts:321-363`:
  atum un→1 un + "120 g" + marca Ramirez; azeite Gallo/"Garrafão 5 L"; arroz Cigala/"Embalagem 1 kg";
  sal marca vazia. Verdes.

### Item 6 — avisos atualizados
- **entregue (lógica); validação visual pendente.** `lineResolved` + `resolved`
  (`Entradas.tsx:153-163`, `519-527`) suprimem âmbar, `blockReason` e `parseNote` quando a
  linha fica resolvida. Verificado por leitura; render visual não testado nesta sessão.

### Item 7 — campos com nome
- **entregue.** `FieldLabel` (`Entradas.tsx:708-715`) com etiquetas permanentes
  "Embalagens", "Preço por embalagem (s/IVA)", "Quantidade (<unidade>)",
  "Preço por <unidade> (s/IVA)" (`Entradas.tsx:918-992`).

### Item 8 — números e grafia
- **entregue.** `formatQty` (pt-PT) aplicado onde faltava: `Inventario.tsx:175`,
  `KitchenSheet.tsx:96`. Grafia AO90 só em texto visível (ver verificação específica).

### Item 9 — barra de navegação
- **entregue (lógica); validação visual pendente.** `AppShell.tsx`: barra de desktop
  (≥1280 px) com `ResizeObserver` que mede o overflow para um menu "Mais"
  (`AppShell.tsx:101-205`); telemóvel mantém scroll horizontal (`AppShell.tsx:65`, `xl:hidden`).
  Medição real 1280–1920 px não testável sem browser.

### Item 10 — fecho
- **entregue.** Gates verdes (acima); secção do sprint em `TESTING.md` (fatura 1187 e 1243);
  commits com prefixo `entradas:` (histórico do ramo).

## Verificações específicas pedidas

1. **Testes usam os casos das faturas e testam as funções do ecrã (não cópias).**
   **Confirmado.** Os casos-âncora da spec estão nos testes (itens 1,3,4,5 acima). O ecrã
   importa exactamente as mesmas funções de `@/lib/purchase-items` e `@/lib/roles`
   (`Entradas.tsx:14,33-44`) — não há reimplementação local.

2. **Nenhum caminho deixa as embalagens em 1 quando havia quantidade lida.**
   **Confirmado.** O bug antigo (`packs: line.packs || "1"`) desapareceu. Os três caminhos
   para artigo usam `packsOnArticleChange` (`Entradas.tsx:770`, select e criação) ou, no
   pré-preenchimento, `packs: hasArticle && l.qty != null ? String(l.qty) : ""`
   (`Entradas.tsx:222`). Nenhum usa 1 por omissão; quando não dá inteiro fica vazio e
   assinalado (`packsFlagged`).

3. **O bloqueio do item 2 não impede linhas válidas nem faturas sem leitura automática.**
   **Confirmado.** `lineBlockReason` devolve `null` quando `invoiceUnit == null`
   (`purchase-items.ts:226`) — linhas manuais nunca bloqueiam — e quando há artigo ou a
   unidade converte. Em `onSubmit` só bloqueia o caso un→massa/volume sem artigo
   (`Entradas.tsx:292-301`).

4. **Criar ingrediente respeita perfis e aparece nas outras linhas sem recarregar.**
   **Confirmado.** A acção só aparece com `mayManagePantry` = `canManagePantry(role)` →
   owner/gestor/cozinha (`roles.ts:71-73`, `Entradas.tsx:584`), testado em `roles.test.ts:4-14`.
   `useCreateIngredient` invalida `queryKeys.ingredients` no `onSuccess`
   (`use-ingredients.ts:42-60`), pelo que a lista refaz-se e o ingrediente surge nas outras
   linhas sem reload.

5. **A passagem de grafia só mudou texto visível.**
   **Confirmado.** Alterações (todas em JSX/labels/mensagens zod/toasts/alt/confirm):
   `HaccpLayout` "Receção"; `NonconformityForm` "Ação imediata/sobre a causa"; `Haccp`
   "ação corretiva"/"inspeção"/"retroativo"; `HaccpDossie`/`HaccpDossiePrint` "inspeção"/
   "Receções"/"Ação…"; `HaccpFornecedores` "receção"/"receções"/"(inativo)"/"Ativo";
   `HaccpNcDetail` "ação"/"receção"/"Ação…"; `HaccpPontos` "(inativo)"/"Desativar"/"ativos";
   `HaccpRecepcao` "Receção…"/"Registar receção"/"ação mais tarde"; `HaccpRegistar`
   "ação corretiva"/"Registar ação…"; `KitchenSheet` "atualizada". Hooks `use-takeaway`/
   `use-team`/`haccp-status` só textos de erro ("ativo"/"ativas"/"ação registada…").
   `i18n.ts`: mudou **só** o valor PT de `errEncomendasInactivas`; as strings EN/ES/FR e a
   chave mantiveram-se (`i18n.ts:322,466,610`).
   - **Não** se alteraram nomes de variáveis/identificadores (`active`, `activeRestaurant`,
     `activeTurns`), rotas (`/haccp/recepcao` mantém-se; só o label mudou), IDs de campo
     (`nc-immediate`, `nc-root`), nomes de colunas DB (`immediate_action`, `root_cause_action`,
     `receptions_count`) nem as strings ES/FR.
   - **Palavras pré-AO90 que ficaram em texto visível ao utilizador:** nenhuma encontrada.
     As ocorrências remanescentes de actual/directa/acção/selecção/recepção/exacto/activo em
     `apps/web/src` estão todas em comentários, identificadores, ficheiros de teste, logs de
     consola (`reservation-message.ts:59`) ou nas strings ES/FR — nenhuma em texto renderizado.

6. **parse-invoice e migrations intactos.**
   **Confirmado.** `git diff origin/main...HEAD -- supabase` vazio: nenhuma alteração a
   `supabase/functions/parse-invoice` nem a `supabase/migrations`. (`Entradas.tsx` apenas
   *importa* `norm`/`normalizeUnit` do módulo partilhado da edge, sem o modificar.)

7. **Travessão (—, U+2014) em texto de interface novo ou comentário novo.**
   **Desvio encontrado (comentários).** Duas linhas de **comentário novo** em
   `lib/purchase-items.ts` usam travessão:
   - `purchase-items.ts:149` — "…para o dono confirmar — NUNCA o valor por omissão de 1."
   - `purchase-items.ts:202` — "…artigo escolhido — em vez de uma entrada directa…"
   (origin/main não tinha travessões neste ficheiro). Os restantes travessões em código
   (`Entradas.tsx:54,167,351,432,690`; `AppShell.tsx:16,84`) **já existiam** em `origin/main`
   e não são novos — o `"—"` em `Entradas.tsx:690` é um placeholder de valor vazio pré-existente
   que só reentrou no diff por causa da mudança `formatQty`. Travessões em `TESTING.md` e na
   spec são documentação, fora do âmbito da regra (interface/comentários).
   Nenhum travessão **novo** em texto de interface.

## Veredicto global

**APROVADO COM RESERVAS.**

Os 10 itens estão entregues com evidência própria: gates verdes (235 testes), as funções
testadas são as que o ecrã usa, nenhum caminho repõe embalagens a 1, o bloqueio não trava
linhas válidas nem manuais, a criação de ingrediente está corretamente gated e refaz a
lista, a grafia mexeu só em texto visível sem tocar em rotas/chaves/DB/ES-FR, e
parse-invoice/migrations ficaram intactos.

Correções necessárias:

1. **(cosmética, regra de casa)** Remover o travessão dos dois comentários novos
   `lib/purchase-items.ts:149` e `:202` (substituir por hífen/reticências ou reescrever).
   Não é defeito funcional nem critério de aceitação da spec.

Reservas (não bloqueiam, já reconhecidas no Blocker da spec):

- Itens 6, 7 e 9 (UI) estão verificados por leitura e compilação; a **validação
  visual/manual** (faturas 1187/1243, avisos a desaparecer, etiquetas, barra 1280–1920 px)
  não é automatizável nesta sessão (sem browser) e continua pendente conforme `TESTING.md`.
