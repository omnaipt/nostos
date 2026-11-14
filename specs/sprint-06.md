# Sprint 06: Correções da entrada de faturas (achados da bateria de 14-11)

Projecto: Nostos Rest (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-fix` (worktree, branch `feat/rest-correcoes-entradas` de `origin/main` d4a34d4) | Data: 2026-11-14
Estado: implementado (itens 1–10); validação visual/manual pendente

Origem: teste manual do David ao sprint 04 em produção (nostos.pt, tenant Lota do Cais), 14-11-2026, com duas faturas de teste do mesmo fornecedor. A aprendizagem por fornecedor funcionou (a segunda fatura trouxe ingrediente, artigo e embalagens certos). Os achados abaixo são o que impede a entrada de faturas de ser usável numa cozinha e de ser mostrada ao revendedor. Este sprint passa à frente do stock S3 (contagens), que passa a sprint 07.

## Objectivo

Uma fatura lida pela aplicação regista-se com a quantidade e o preço certos sem reescrever nada, mesmo num fornecedor novo: as linhas detetadas como embalagem abrem já por embalagens, nenhum passo apaga a quantidade da fatura, o preço por embalagem vem da fatura, e um produto que ainda não existe na despensa cria-se na própria linha. Os campos têm nome, os avisos desaparecem quando a linha fica resolvida, e os textos seguem o Acordo Ortográfico.

## Fora de scope

- Alterar o prompt, o modelo ou o formato de resposta da edge `parse-invoice`. Se uma correção o exigir, registar em Blockers.
- Migrações de base de dados. Se uma correção exigir uma, registar em Blockers.
- Consumo interno, modo de consumo e contagens (sprints 05 e 07). Não tocar nos ficheiros novos do ramo `feat/stock-s2`.
- Limpar os dados de teste do tenant demo.
- Aplicar em produção, deploy, `supabase`, `vercel`, `git push`.

## Itens (por ordem de gravidade)

### 1. A quantidade da fatura nunca se perde (achado 11, grave)

Hoje, ao criar ou escolher um artigo numa linha em entrada direta, `LineArticleControls` faz `onChange({ purchaseItemId, packs: line.packs || "1" })`. Como a entrada direta guarda a quantidade em `line.qty`, as embalagens ficam em 1 e uma fatura de 24 latas regista 1.

- [x] Ao passar de entrada direta para um artigo (criado ou escolhido), as embalagens partem da quantidade da fatura (`line.qty`) quando a unidade lida da fatura é `un` ou quando a quantidade foi lida como número de embalagens; nos restantes casos, convertem a quantidade para embalagens pelo conteúdo do artigo (por exemplo, 10 kg com artigo de 1 kg dá 10 embalagens), arredondando só se o resultado for inteiro e deixando o campo vazio e assinalado se não for.
- [x] Ao voltar de um artigo para entrada direta, a quantidade parte das embalagens convertidas para a unidade do ingrediente.
- [x] Nunca há valor por omissão de 1 embalagem quando existe uma quantidade lida.

Evidência: testes unitários da função de transição (extrair para `lib/purchase-items.ts`) com os casos 24 un para artigo de 1 un (24), 10 kg para artigo de 1 kg (10), 10 l para artigo de 5 l (2), 7 kg para artigo de 5 kg (vazio e assinalado).

### 2. Linha com embalagem detetada não se regista com a quantidade errada (achado 5, grave)

Hoje uma linha "AZEITE GALLO GARRAFAO 5L, 2 un" sem artigo abre em entrada direta com 2 no campo de quantidade de um ingrediente em litros e regista 2 l.

- [x] Quando a linha tem conteúdo de embalagem detetável no nome (`parsePackFromText`) ou a fatura vem em `un` para um ingrediente em massa ou volume, e não há artigo, a linha abre com o formulário de novo artigo já aberto e proposto, em vez de entrada direta.
- [x] Enquanto uma linha tiver unidade da fatura não convertível para a do ingrediente e não tiver artigo, o botão Registar entrada fica bloqueado para essa linha, com a razão escrita na linha ("Escolha ou crie o artigo, ou indique a quantidade em litros").
- [x] Em entrada direta, o campo de quantidade mostra sempre a unidade do ingrediente na etiqueta.

Evidência: testes da função que decide o modo inicial da linha e da validação de registo.

### 3. O preço vem da fatura (achado 6, alto)

A edge devolve `unit_cost_cents_ex_vat` por linha; o ecrã só preenche o custo quando o servidor o converteu (`fill_cost_cents`).

- [x] Em linhas por embalagens (artigo proposto pelo alias, escolhido ou criado), o preço por embalagem é preenchido com o preço unitário da fatura quando a unidade da fatura é `un`.
- [x] Em entrada direta, mantém-se o comportamento atual (`fill_cost_cents`), e quando só existe o preço unitário numa unidade convertível, converte-se pela `unitFactor`.
- [x] O preço preenchido é editável e a pré-visualização do custo por unidade base atualiza-se.
- [x] Se o resultado de `parse-invoice` que chega ao cliente não trouxer o preço unitário original da linha, registar em Blockers com o nome do campo em falta (não alterar a edge).

Evidência: testes com as duas faturas de teste do David (azeite 2 × 19,90 dá 3,98 €/l; arroz 10 × 1,29 dá 1,29 €/kg; atum 24 × 1,65 dá 1,65 €/un).

### 4. Criar ingrediente na própria linha (achado 9, grave)

- [x] Uma linha da fatura sem ingrediente correspondente tem a ação "Criar ingrediente", com o nome proposto a partir da linha (sem marca nem formato quando se distinguem, por exemplo "SAL MARINHO GROSSO 1KG" dá "Sal marinho grosso") e a unidade proposta a partir do conteúdo (kg para massa, l para volume, un quando não há conteúdo), ambos editáveis.
- [x] Depois de criado, o ingrediente fica escolhido na linha, aparece nas listas das outras linhas sem recarregar a página, e a linha segue para a proposta de artigo quando há embalagem.
- [x] Só `owner`, `gestor` e `cozinha` veem a ação (o mesmo critério de quem gere a despensa).

Evidência: teste da função de proposta de nome e unidade com os nomes das faturas de teste; passos manuais em `TESTING.md`.

### 5. Proposta de artigo coerente com a unidade do ingrediente (achados 7 e 10)

- [x] Para um ingrediente contado em `un` sem peso médio, a proposta de artigo vem com conteúdo 1 `un` e o formato lido do nome (por exemplo "Lata 120 g").
- [x] A mensagem de formato não convertível diz o que fazer: "Este ingrediente conta-se em <unidade>. Use um conteúdo em <unidades possíveis>, ou preencha o peso médio do ingrediente."
- [x] A proposta separa a marca e o formato quando o nome o permite (heurística simples: o formato é o conteúdo detetado com a palavra de embalagem que o antecede, se existir; a marca é a palavra imediatamente antes do conteúdo ou da embalagem quando não faz parte do nome do ingrediente). Quando não for seguro, a marca fica vazia e o formato curto ("Embalagem 1 kg"), nunca o nome inteiro da linha.

Evidência: testes com "ARROZ CAROLINO CIGALA 1KG", "AZEITE V.EXTRA GALLO GARRAFAO 5L", "ATUM POSTA AZEITE RAMIREZ 120G", "SAL MARINHO GROSSO 1KG".

### 6. Avisos atualizados (achado 8)

- [x] Os avisos de unidade ("fatura em un, catálogo em l, sem conversão") e de diferença de formato desaparecem quando a linha fica resolvida (artigo escolhido e convertível, ou quantidade direta coerente). A nota da leitura original pode ficar acessível de forma discreta, mas não como aviso.

### 7. Campos com nome (achado 2)

- [x] Os campos de cada linha têm etiqueta visível e permanente por cima: "Embalagens" e "Preço por embalagem (s/IVA)" em modo artigo; "Quantidade (<unidade>)" e "Preço por <unidade> (s/IVA)" em entrada direta. O texto dentro da caixa deixa de ser a única indicação.

### 8. Números e grafia (achados 3 e 4)

- [x] Quantidades e saldos mostram vírgula decimal em todo o `apps/web` (usar uma função de formatação única com `pt-PT`).
- [x] Passagem de grafia pelo Acordo Ortográfico de 1990 em todo o texto visível de `apps/web/src` (por exemplo: actual para atual, actualizam para atualizam, directa para direta, acção para ação, correcto para correto, selecção para seleção, recepção para receção). Só texto visível ao utilizador; não mudar nomes de variáveis, chaves, rotas nem valores gravados na base de dados. Listar no contrato as substituições feitas.

### 9. Barra de navegação (achado 1)

- [x] Em ecrãs de 1280 a 1920 px de largura, todos os itens da barra de topo ficam acessíveis, incluindo Clientes e Definições (por exemplo, menu "Mais" para os itens que não cabem). Em telemóvel mantém-se o comportamento atual.

### 10. Fecho

- [x] `pnpm typecheck`, `pnpm test`, `pnpm build` verdes (com `--force` no turbo), output resumido em Evidência.
- [x] Secção deste sprint em `TESTING.md` com o roteiro manual que repete o teste do David: fatura 1187 (fornecedor novo, com criação de ingrediente e de artigos), fatura 1243 (aprendizagem), com os saldos esperados.
- [x] Commits pequenos por item, mensagens começadas por `entradas:`.

## Decisões

- 14-11-2026 (David): corrigir os achados da bateria antes de avançar para as contagens.
- 14-11-2026 (orquestrador): achado 11 confirmado no código antes do sprint (`Entradas.tsx`, criação de artigo repõe as embalagens a 1). Achado 6: a edge devolve `unit_cost_cents_ex_vat` e o ecrã só usa `fill_cost_cents`.
- 14-11-2026 (orquestrador): sprint sem migrações; o sprint 05 (stock S2) está auditado em paralelo e será integrado depois deste.

## Blockers

- Nenhum bloqueador de implementação. Nota ao item 3 (fora de scope — não se
  tocou na edge): o resultado de `parse-invoice` que chega ao cliente **traz** o
  preço unitário original por linha (`MatchedLine.unit_cost_cents_ex_vat`) e a
  unidade lida (`unit`), por isso o preço por embalagem foi preenchido no cliente
  sem alterar a edge. Não foi preciso registar campo em falta.
- Gates: `pnpm lint` não executa tarefas (`@stoa/web` não tem script `lint`); não
  é regressão deste sprint. Os gates exigidos (typecheck/test/build) ficam verdes.
- A validação **visual/manual** (faturas 1187 e 1243, barra 1280–1920 px, avisos a
  desaparecer, etiquetas) fica pendente — roteiro numerado em `TESTING.md`. Não é
  automatizável nesta sessão (sem browser); a implementação compila e os gates passam.

## Evidência

Gates (`pnpm exec turbo run typecheck test build --force`, Windows/pnpm 10.6), 14-11-2026:

- **Typecheck**: `@stoa/web` `tsc --noEmit` sem erros.
- **Testes**: 20 ficheiros, **235 testes** verdes (baseline 208 + 27 novos).
- **Build**: `vite build` OK (aviso pré-existente de chunk >500 kB, não bloqueia).

Cobertura por item:
- **Itens 1–5** (lógica): funções puras em `lib/purchase-items.ts` + testes em
  `lib/purchase-items.test.ts` (17 → 42 testes) e `canManagePantry` em
  `lib/roles.test.ts` (item 4). Casos-âncora da spec todos verdes:
  - Item 1: `packsFromDirectQty` 24 un→24, 10 kg→10, 10 l→2, 7 kg→vazio+assinalado;
    `packsOnArticleChange` azeite 2 un→2 embalagens.
  - Item 2: `shouldOpenNewArticle` e `lineBlockReason` (mensagem "…em litros.").
  - Item 3: `packCostCentsFromInvoice` (azeite 19,90; arroz 1,29; atum 1,65) +
    `packEntryBaseCostCents` (3,98 €/l; 1,29 €/kg; 1,65 €/un).
  - Item 4: `proposeIngredientFromRawName` ("SAL MARINHO GROSSO 1KG" → "Sal marinho
    grosso"/kg) e `canManagePantry`.
  - Item 5: `proposeArticleForIngredient` (atum un→1 un + "120 g"; azeite Gallo/
    "Garrafão 5 L"; arroz Cigala/"Embalagem 1 kg"; sal marca vazia) e
    `unconvertibleFormatMessage`.
- **Itens 6, 7** (UI de `Entradas.tsx`): avisos suprimidos quando a linha fica
  resolvida; etiquetas permanentes ("Embalagens", "Preço por embalagem (s/IVA)",
  "Quantidade (<un>)", "Preço por <un> (s/IVA)"). Compila; verificação visual em `TESTING.md`.
- **Item 8** — números: `formatQty` (pt-PT, vírgula) aplicado nos pontos em falta
  (`Inventario.tsx`, `KitchenSheet.tsx`); os restantes ecrãs já o usavam.
  — grafia (AO90), substituições feitas em texto visível de `apps/web/src`:
  actual/actualizar/actualizada/actualizam/actualizado → atual/atualiz…;
  recepção/recepções → receção/receções; acção/acções → ação/ações;
  activo/activa/activos/inactivo/inactiva → ativo/ativa/ativos/inativo/inativa;
  desactivar/desactivado/desactivadas → desativar/desativado/desativadas;
  correctiva → corretiva; exactamente/exacta → exatamente/exata;
  inspecção → inspeção; retroactivo → retroativo. Não se alteraram nomes de
  variáveis, rotas (`/haccp/recepcao`), chaves, códigos internos
  (`encomendas_inactivas`) nem as strings ES/FR do `i18n.ts`.
- **Item 9** (`AppShell.tsx`): menu "Mais" medido por `ResizeObserver` em ≥1280 px;
  scroll horizontal mantido em telemóvel. Compila; verificação visual em `TESTING.md`.

Commits (prefixo `entradas:`): funções puras (itens 1–3,5); `canManagePantry` (item 4);
wiring do ecrã (itens 1–7); números e grafia (item 8); barra de navegação (item 9);
fecho (item 10).
