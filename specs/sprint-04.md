# Sprint 04: Stock S1, unidades, artigos de compra e formatos

Projecto: Nostos Rest (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-stock` (worktree, branch `feat/stock-s1` de `origin/main` 0093316) | Data: 2026-11-14
Estado: planeado

Spec de produto de origem: "Spec Nostos Rest: camada de stock" (Claude Docs, 13-11-2026, decisões do David fechadas a 13-11). Este é o primeiro de três sprints (S1 unidades e formatos; S2 consumo interno; S3 inventário com parciais). Origem do pedido: reunião com o revendedor Inforantunes (WinRest e ZS Rest).

## Objectivo

Uma fatura com "Azeite Gallo VE 5L, 2 un, 39,80 €" passa a entrar como 10 l de azeite virgem extra a 3,98 €/l, sem contas à mão. O azeite de qualquer marca soma no mesmo ingrediente; o formato de mesa é outro ingrediente, ligado ao primeiro por uma família. Uma linha de ficha técnica "1 cebola" liga-se a um ingrediente comprado ao quilo e abate stock, desde que o ingrediente tenha peso médio por unidade.

## Fora de scope

- Consumo interno, modo de consumo por ingrediente, marca de abate estimado (Sprint 05).
- Sessões de contagem, parciais, densidades na contagem, relatório de desvio (Sprint 06). A coluna `density_g_per_ml` NÃO entra neste sprint.
- Integração com ZS Rest ou WinRest; catálogo partilhado entre restaurantes (só a coluna `catalog_item_id` nula, reservada).
- Aplicar a migração em produção, correr `supabase` contra o projecto remoto, deploy de edge functions, `vercel`, `git push`. Tudo isto é do orquestrador depois do gate do David.
- Alterar ficheiros do ramo `feat/omnai-console-admin-nostos`, incluindo `0030_saft_idempotencia.sql` (ver Decisões).
- Tocar em dados do tenant demo (Lota do Cais) ou de qualquer tenant existente. A semente de demonstração com artigos de compra é Sprint 06.
- Redesenho visual de ecrãs. A UI nova segue os componentes e tokens existentes.

## Convenções deste repo que se aplicam

- Migração nova: `supabase/migrations/0031_stock_formatos.sql`. Teste pgTAP novo: `supabase/tests/0015_stock_formatos.sql`, no estilo de `0014_haccp.sql` e `0009_supplier_aliases.sql` (`begin; select plan(N); ... select * from finish(); rollback;`, UUIDs fixos, simulação de utilizador com `set local role authenticated` e `request.jwt.claims`).
- Multi-tenant: toda a tabela nova tem `restaurant_id`, RLS pelo padrão `*_member_all` com `public.is_restaurant_member` e trigger de guarda de tenant como os da 0011 e 0018. Funções expostas: `grant execute ... to authenticated`, revogar de `anon` e `public`; funções de gatilho sem grant.
- Comentários em português, sem travessão. Cada tabela e função com `comment on`.
- Tipos: acrescentar à mão em `apps/web/src/integrations/supabase/database.types.ts` as tabelas e colunas novas, espelhando a migração. O orquestrador regenera os tipos depois de aplicar.
- Verificação local: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` todos verdes no fim. Não há Postgres local: o pgTAP é escrito e revisto pelo executor; a execução é feita pelo orquestrador dentro de uma transacção com rollback.
- Antes de recriar uma função SQL existente (`create or replace`), partir da definição em `origin/main` e registar em Decisões qualquer diferença intencional.

## Itens

### 1. Migração 0031: conversão de unidades e peso médio por unidade

- [x] `ingredients` ganha `unit_weight_g numeric(10,3)` opcional (> 0 quando preenchido), com `comment on` a explicar o uso (cebola, limão, alho).
- [x] Função `public.unit_factor(p_from text, p_to text, p_unit_weight_g numeric default null) returns numeric` (IMMUTABLE): devolve o multiplicador de `p_from` para `p_to` dentro da mesma grandeza (g e kg; ml e l; un e un); entre `un` e `g` ou `kg` usa `p_unit_weight_g`; devolve null quando a conversão não é possível (massa contra volume, ou `un` sem peso médio).
- [x] O trigger de guarda de `stock_movements` (0011) passa a aceitar um movimento em unidade diferente da do ingrediente quando `unit_factor` não é null: normaliza `qty` e `unit` para a unidade do ingrediente antes de gravar (e ajusta `cost_per_unit_cents` na mesma proporção, inversa). Quando é null, continua a rejeitar, com a excepção `grandeza_diferente_do_ingrediente`.
- [x] Movimentos existentes e o trigger de aplicação ao saldo (0011) não mudam de comportamento para movimentos já na unidade do ingrediente.

Evidência exigida: pgTAP com casos 2 kg em ingrediente em `g` (2000 g), 10 l em ingrediente em `ml`, 2 `un` em ingrediente em `g` com peso médio 150 (300 g), 2 `un` sem peso médio (rejeitado), 1 kg em ingrediente em `ml` (rejeitado).

### 2. Migração 0031: famílias e artigos de compra

- [x] Tabela `ingredient_families` (`id`, `restaurant_id`, `name`, timestamps), nome único por restaurante sem distinção de maiúsculas, RLS e guarda de tenant.
- [x] `ingredients.family_id` opcional, com guarda: a família pertence ao mesmo restaurante.
- [x] Tabela `purchase_items`: `ingredient_id` (obrigatório), `supplier_norm` (opcional, mesma normalização da 0018), `brand`, `label` (texto livre do formato, por exemplo "Garrafão 5 L"), `pack_qty numeric(12,3) > 0`, `pack_unit` (g, kg, ml, l, un), `tare_g` opcional (≥ 0), `ean` opcional, `supplier_code` opcional, `catalog_item_id uuid` nulo (reservado à fase 2, sem FK), `active`, timestamps. Guarda: o ingrediente é do mesmo restaurante e `unit_factor(pack_unit, unidade do ingrediente, unit_weight_g)` não é null.
- [x] `supplier_product_aliases.purchase_item_id` opcional, com guarda: o artigo é do mesmo restaurante e aponta para o mesmo `ingredient_id` do alias. Aliases antigos sem artigo continuam válidos.
- [x] `stock_movements` ganha `purchase_item_id` opcional e `packs numeric(12,3)` opcional (> 0). Quando `packs` vem preenchido num `purchase`, a quantidade gravada é `packs × pack_qty` convertida para a unidade do ingrediente; se o cliente enviar também `qty`, as duas têm de coincidir (tolerância 0,001) ou o movimento é rejeitado.
- [x] O custo médio a 6 meses (0016) continua correcto com movimentos gravados por embalagens (calcula sobre `qty` e `cost_per_unit_cents` normalizados).

Evidência exigida: pgTAP com isolamento entre dois restaurantes para as duas tabelas novas e para os campos novos (não se lê, não se insere, não se liga artigo de outro restaurante); entrada de 2 embalagens de 5 l num ingrediente em `l` grava 10 l e custo por litro correcto; a mesma entrada num ingrediente em `ml` grava 10 000 ml; duas marcas (dois artigos) do mesmo ingrediente somam no mesmo `stock_qty`.

### 3. Conversão partilhada no cliente e na edge `import-saft`

- [x] `computeLineCostCents` e `computeFoodCost` (`apps/web/src/lib/types.ts`) aceitam o peso médio por unidade do ingrediente e convertem `un` contra `g` ou `kg`; os testes existentes continuam verdes e há testes novos para os casos do item 1.
- [x] `supabase/functions/import-saft/index.ts`: `toIngredientUnit` passa a usar a mesma regra, incluindo `unit_weight_g`; ingredientes que hoje caem em `unitMismatch` por serem `un` contra peso deixam de cair quando o peso médio existe. O resto da função não muda.
- [x] A regra de conversão do cliente e a da edge têm os mesmos casos de teste (podem ser duas implementações; a tabela de casos é uma só, documentada no topo de cada ficheiro).

Evidência exigida: `pnpm test` verde com os testes novos; diff da edge restrito à conversão.

### 4. Entrada de compra por embalagens e leitura de faturas

- [x] No registo de entrada de compra (ecrã existente), cada linha permite escolher um artigo de compra do ingrediente e indicar o número de embalagens; a quantidade na unidade do ingrediente e o custo por unidade base aparecem calculados antes de gravar. A entrada directa em quantidade (sem artigo) continua disponível.
- [x] Linha sem artigo conhecido: o ecrã propõe criar um artigo com marca, formato e conteúdo lidos da linha da fatura (o que `parse-invoice` já devolve no nome do produto), editável antes de confirmar. Ao confirmar, o alias do fornecedor fica gravado com `purchase_item_id`.
- [x] Segunda fatura do mesmo fornecedor com o mesmo nome de linha propõe o mesmo artigo e as mesmas embalagens sem intervenção.
- [x] Na despensa, um ingrediente mostra os seus artigos de compra e a família; é possível criar, editar e desactivar artigos e atribuir família. Ingredientes da mesma família aparecem juntos.
- [x] No ingrediente é possível preencher o peso médio por unidade; a ficha técnica deixa de assinalar como sem custo as linhas `un` contra peso quando ele existe.

Evidência exigida: testes de componente ou de hook para o cálculo de embalagens e para a proposta de artigo a partir do alias; capturas de ecrã ou descrição passo a passo em `TESTING.md` para o teste manual.

Notas: não alterar o prompt nem o modelo de `parse-invoice` neste sprint. Se a extracção de marca e formato precisar de mudar a edge, registar em Blockers.

### 5. Fecho

- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verdes, com o output resumido colado na secção de evidência deste ficheiro.
- [x] `supabase/tests/0015_stock_formatos.sql` escrito, com `plan(N)` coerente com o número de testes.
- [x] Contrato curto em `docs/specs/stock-s1-contract.md`: tabelas, colunas, funções e regras de conversão, para os Sprints 05 e 06 consumirem sem adivinhar.
- [x] Commits pequenos por item, mensagens em português começadas por `stock s1:`.

## Decisões

- 13-11-2026 (David): ficha técnica em `rascunho` abate stock; o movimento passa a ser marcado como estimado no Sprint 05. Verificado a 14-11: `import-saft` já abate sem filtrar o estado da ficha.
- 13-11-2026 (David): perfil `cozinha` regista consumo interno e quebras; contagens são preenchidas pela cozinha e aplicadas só por `owner` ou `gestor` (Sprints 05 e 06).
- 13-11-2026 (David): peso médio por unidade entra neste sprint, em vez de deixar `un` sem conversão.
- 13-11-2026 (David): cadência de contagem ligada à importação de vendas (Sprint 06).
- 14-11-2026 (orquestrador): a migração é a 0031. O ramo `feat/omnai-console-admin-nostos` tem `0030_saft_idempotencia.sql`, já aplicada em produção a 09-09 com o registo `0025_saft_idempotencia`, e só toca em `saft_import_lines`. Não há conflito de tabelas, mas o número 0030 fica-lhe reservado.
- 14-11-2026 (orquestrador): a migração não é aplicada em produção durante o sprint; aplica-se só depois do gate do David e depois de comparar as funções recriadas com `pg_get_functiondef` em produção.

## Blockers

Nenhum bloqueio de implementação. Notas para o orquestrador/David:

- Itens 1 e 2 (SQL): não há Postgres local (convenção do repo). O pgTAP
  `supabase/tests/0015_stock_formatos.sql` (`plan(28)`) foi escrito e revisto; a
  execução com `supabase test db` é do orquestrador, dentro de transacção com
  rollback, antes do gate do David. A evidência local é o pgTAP + os testes
  vitest da conversão partilhada (item 3), que exercem a mesma tabela de casos.
- Item 4: capturas de ecrã do teste manual ficam pendentes (recolha visual pelo
  orquestrador/David). O passo a passo está em `TESTING.md`. A lógica testável
  (cálculo de embalagens e proposta de artigo a partir do alias) tem testes de
  unidade a passar (`src/lib/purchase-items.test.ts`).
- `parse-invoice` não foi alterado (prompt/modelo intactos, como pedido). A
  proposta de artigo lê o conteúdo (pack_qty/pack_unit) do nome do produto já
  devolvido; a extracção fina de marca fica para edição manual no ecrã.

## Evidência

Gates locais (Windows, pnpm 10.6 + Turborepo), 2026-11-14:

- `pnpm typecheck` -> `@stoa/web` `tsc --noEmit` sem erros. **PASS**
- `pnpm test` -> 20 ficheiros, **208 testes** verdes (vitest). **PASS**
  (nota: um primeiro `pnpm test` abortou com OOM do Node sob o Turbo quando a cwd
  estava num subdirectório fundo; ao correr da raiz do repo passou de forma
  estável. Flake de ambiente, não do código.)
- `pnpm build` -> `vite build` OK (aviso pré-existente de chunk >500 kB). **PASS**
- `pnpm lint` -> 0 tarefas (sem script `lint` em `@stoa/web`, como nos sprints
  anteriores). Inócuo.

Testes novos:
- `src/lib/tech-sheet-cost.test.ts` (22): `unitFactor` e `computeLineCostCents`
  com peso médio por unidade. Casos do item 1: 2 kg->2000 g, 10 l->10000 ml,
  2 un a 150 g/un->300 g, un sem peso->null, kg contra ml->null.
- `src/lib/purchase-items.test.ts` (17): cálculo de embalagens
  (`packEntryQty`/`packEntryBaseCostCents`), proposta de artigo
  (`proposeArticleFromRawName`/`parsePackFromText`) e proposta a partir do alias
  (`proposeEntryFromAlias`). Caso-âncora: "Azeite Gallo VE 5L, 2 un, 39,80" ->
  10 l a 398 cents/l.

pgTAP `supabase/tests/0015_stock_formatos.sql` (`plan(28)`): conversões do item 1,
entradas por embalagens em l e ml, custo por litro, soma de duas marcas no mesmo
`stock_qty`, qty que não bate com packs, guarda de convertibilidade do artigo,
famílias, aliases ligados a artigo e isolamento multi-tenant. Execução pelo
orquestrador (ver Blockers).

Contrato: `docs/specs/stock-s1-contract.md`. Passo a passo manual do item 4 e
quadro de gates: `TESTING.md` (secção Sprint 04).

Commits (branch `feat/stock-s1`):
- `stock s1: migração 0031 (conversão de unidades, famílias e artigos de compra)`
- `stock s1: conversão partilhada no cliente e na edge import-saft`
- `stock s1: cálculo de embalagens e proposta de artigo (lógica pura + testes)`
- `stock s1: entrada por embalagens e despensa com artigos, famílias e peso médio`
- `stock s1: fecho (contrato, TESTING e evidência da spec)`
