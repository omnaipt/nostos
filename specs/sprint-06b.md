# Sprint 06b: Afinações da entrada de faturas (segunda ronda de teste, 14-11)

Projecto: Nostos Rest (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-fix2` (worktree, branch `feat/rest-entradas-afinacoes` de `origin/main` e234ac1) | Data: 2026-11-14
Estado: concluído (14-11-2026)

Origem: teste do David em produção ao sprint 06, com a fatura FA 2026/0412 de um fornecedor novo (Distribuidora Atlântico Oeste). O sprint 06 passou no essencial: embalagens preservadas, bloqueio de registo, criar ingrediente, etiquetas, grafia. Faltam três afinações.

## Objectivo

Numa fatura de um fornecedor novo, um produto que já tem artigo na despensa resolve-se escolhendo esse artigo, com o preço da fatura preenchido e sem propostas para criar artigos repetidos, e a marca proposta é a marca e não um termo de qualidade.

## Fora de scope

Tudo o que não seja os três itens. Sem migrações, sem alterações à edge `parse-invoice`, sem tocar em ficheiros do ramo `feat/stock-s2`. Não correr `supabase`, `vercel` nem `git push`.

## Itens

### 1. Preço ao escolher um artigo existente (achado 14)

Caso real: linha "AZEITE GALLO V.EXTRA 5 LT", 2 UN a 19,90; ingrediente "Azeite virgem extra" (l) já tem o artigo "gallo · Garrafão 5L" (5 l). Ao escolher esse artigo no seletor da linha, as embalagens ficaram em 2 (certo) mas o preço por embalagem ficou vazio.

- [x] Escolher um artigo existente no seletor preenche o preço por embalagem com o preço unitário da fatura quando a unidade lida é `un`, pela mesma função usada quando o artigo é proposto pela aprendizagem ou criado (`packCostCentsFromInvoice`), sem apagar um preço que o utilizador já tenha escrito. — `existingArticleTransition` (lib/purchase-items.ts), usada por `applyArticle` (Entradas.tsx) com `hasUserCost`.
- [x] Teste unitário da transição com o caso acima (2 embalagens, 19,90, = 10 l, 3,98 €/l). — `existingArticleTransition (06b item 1)` em purchase-items.test.ts.

### 2. Sugerir o artigo existente em vez de propor um novo (achado 12)

No mesmo caso, o ecrã abriu o formulário "Criar artigo" com conteúdo 5 l em vez de usar o artigo existente com o mesmo conteúdo.

- [x] Quando a linha não tem artigo por aprendizagem, mas o ingrediente escolhido tem exatamente um artigo ativo com o mesmo conteúdo convertido (por exemplo 5 l, ou 120 g contra 0,12 kg), esse artigo fica pré-escolhido, com embalagens e preço preenchidos, e o formulário de criação não abre. A linha mostra uma nota discreta "Artigo existente sugerido; confirme". — `articlesMatchingContent` + pré-escolha em `applyParseResult` (Entradas.tsx); nota em `LineArticleControls`.
- [x] Com mais de um artigo compatível, o seletor abre com esses artigos primeiro e o formulário de criação não abre. — `autoCreateArticle` fica `false` com compatíveis; `orderedArticles` põe os compatíveis à frente.
- [x] Sem artigo compatível, mantém-se o comportamento do sprint 06. — `articlesMatchingContent` devolve vazio → `shouldOpenNewArticle` decide como antes.
- [x] Ao registar, o alias do fornecedor novo fica ligado ao artigo escolhido, para a fatura seguinte desse fornecedor vir resolvida. — a pré-escolha define `purchaseItemId`, que `onSubmit` usa no `aliasLearning` (já do sprint 06).

### 3. Marca proposta (achado 13)

Caso real: "AZEITE GALLO V.EXTRA 5 LT" propôs a marca "V.extra".

- [x] A heurística de marca ignora termos de qualidade e de descrição comuns em faturas (virgem, extra, v.extra, v. extra, ve, gourmet, premium, bio, light, natural, posta, lombo, grosso, fino, branco, carolino, agulha, entre outros do mesmo tipo) e abreviaturas com ponto. — `QUALITY_TERMS` + regra do ponto em `proposeArticleForIngredient`, que escolhe a primeira palavra válida antes do conteúdo.
- [x] Testes com: "AZEITE GALLO V.EXTRA 5 LT" dá Gallo; "AZEITE V.EXTRA GALLO GARRAFAO 5L" dá Gallo; "ATUM RAMIREZ POSTA AZEITE 120 GR" dá Ramirez; "MASSA ESPARGUETE MILANEZA 500G" dá Milaneza; "ARROZ CAROLINO CIGALA 1KG" dá Cigala; "SAL MARINHO GROSSO 1KG" dá marca vazia. Os testes do sprint 06 continuam verdes. — `marca proposta (06b item 3)` em purchase-items.test.ts (244 testes verdes).
- [x] O formato "5 LT" é reconhecido como 5 l (e "GR" como g), se ainda não for. — "gr" adicionado a `parsePackFromText` e `CONTENT_RE` ("lt" já existia).

### 4. Fecho

- [x] `pnpm turbo run typecheck test build --force` verde, resumo em Evidência.
- [x] Secção curta em `TESTING.md` com o teste manual: fatura 0412 de um fornecedor novo com o azeite resolvido pelo artigo existente.
- [x] Commits com mensagens começadas por `entradas:`.

## Decisões

- 14-11-2026 (David): sprint 06 validado em produção com a fatura 0412; estas três afinações seguem já.

## Blockers

Nenhum. Nota (fora de scope, para futuro): a composição na UI (pré-escolha no parse,
nota, ordenação do seletor, preenchimento do preço ao escolher) está ligada e verificada
por typecheck + build, mas não há testes de componente; a verificação ponta-a-ponta fica
nos testes manuais de `TESTING.md`.

## Evidência

Gate `pnpm turbo run typecheck test build --force` verde (14-11-2026, Windows, pnpm 10.6
+ Turborepo): typecheck sem erros, **244 testes** verdes (eram 235; +9), `vite build` OK
(mantém o aviso pré-existente de chunk >500 kB). Sem script `lint` no repo.

Alterações, todas dentro do scope (sem migrações, sem tocar na edge `parse-invoice` nem
em `feat/stock-s2`):

- **Item 1** — `lib/purchase-items.ts`: nova `existingArticleTransition` (embalagens por
  `packsOnArticleChange` + preço por `packCostCentsFromInvoice`, sem apagar preço do
  utilizador). `pages/Entradas.tsx`: `applyArticle` passa a usá-la com
  `hasUserCost: line.cost.trim() !== ""`.
- **Item 2** — `lib/purchase-items.ts`: nova `articlesMatchingContent` (artigos com o
  mesmo conteúdo convertido). `pages/Entradas.tsx`: `applyParseResult` pré-escolhe o
  único compatível (embalagens + preço) e não abre a criação; com vários, não abre a
  criação e `orderedArticles` põe-nos à frente; `LineDraft.articleSuggested` + nota
  discreta em `LineArticleControls`. O alias já liga ao artigo escolhido (`onSubmit`).
- **Item 3** — `lib/purchase-items.ts`: `QUALITY_TERMS` + regra de abreviatura com ponto;
  `proposeArticleForIngredient` escolhe a primeira palavra válida antes do conteúdo (em
  vez da última); "gr"→g em `parsePackFromText` e `CONTENT_RE`.

Testes unitários novos em `lib/purchase-items.test.ts` (42 → 51): `existingArticleTransition`
(item 1), `articlesMatchingContent` (item 2), `marca proposta` + leitura de "5 LT"/"120 GR"
(item 3).

Commits (branch `feat/rest-entradas-afinacoes`, sem push):
- `b45bb3d entradas: 06b itens 1 e 2 (preço e artigo existente ao escolher)`
- `182b531 entradas: 06b item 3 (marca proposta ignora termos de qualidade)`
- fecho (esta spec + `TESTING.md`).
