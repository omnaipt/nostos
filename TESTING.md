# TESTING — STOA / Nostos

Estado de testes do repositório. Actualizado durante a verificação do Sprint 01
(HACCP v1 backend) a 2026-09-07.

## Testado automaticamente (com resultados)

Corrido nesta máquina (Windows, pnpm 10.6 + Turborepo). Resultados de 2026-09-07:

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ 1 package (`@stoa/web`), `tsc --noEmit` sem erros |
| Testes unitários | `pnpm test` | ✅ 14 ficheiros, **135 testes** verdes (vitest) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB, não bloqueia) |
| Lint | `pnpm lint` | ⚠️ **0 tarefas** — `@stoa/web` não tem script `lint` configurado |

Notas:
- Os gates correram por cache hit do Turbo (FULL TURBO): os inputs de `apps/web`
  não mudaram neste sprint (que é só backend/SQL), logo o verde anterior mantém-se.
- O gate de `lint` é actualmente inócuo (sem script no package). Recomenda-se
  adicionar `lint` a `@stoa/web` para o gate ter efeito. Não é regressão deste sprint.

### pgTAP (base de dados)

`supabase/tests/0014_haccp.sql` (`plan(85)`, relógio controlado via `haccp_now()`).

- **Não corrido nesta máquina**: não há Postgres local e a instrução é não o instalar.
- Corrido pelo **orquestrador** em Postgres 16 + pgTAP 1.3 + stub Supabase, sobre a
  migração `0029` aplicada limpa sobre as 28 anteriores: **85/85 ok**.
- Output completo em `specs/sprint-01-pgtap-output.txt` (usado como evidência).
- Para reproduzir num ambiente com Supabase CLI: `supabase test db` (requer 0001..0029).

## Verificação da spec

Spec: `specs/sprint-01.md`. Relatório item a item: `specs/sprint-01-verification.md`.

Veredicto por item (todos com evidência de código + asserção pgTAP correspondente):

| Item | Título | Veredicto |
|---|---|---|
| 1 | Role `consultor` e funções de pertença | entregue |
| 2 | Retenção e quota no tenant | entregue |
| 3 | Pontos de controlo e defaults por tipo | entregue |
| 4 | Registos de temperatura imutáveis e ancorados ao turno | entregue |
| 5 | Não conformidades e verificação de eficácia | entregue |
| 6 | Fornecedores, recepção e recusas | entregue |
| 7 | Estado por turno, lacunas e registos em bloco | entregue |
| 8 | Contrato e higiene de grants | entregue (1 desvio documentado) |

Desvio único (documentado, não bloqueia): `haccp_now()` mantém EXECUTE a PUBLIC
(não revogado de public/anon), porque é chamada por funções SECURITY INVOKER e pela
vista `haccp_nc_status`. Detalhe no item 8 do relatório de verificação.

## Testes manuais pendentes

Estes só se validam contra um Postgres real com o stack Supabase (RLS, `auth.uid()`,
storage). Correr depois de aplicar a `0029` a um branch de desenvolvimento Supabase.

1. **Aplicar a migração ao branch de desenvolvimento**
   1. `supabase db push` (ou aplicar `0029_haccp_v1.sql` ao branch remoto de dev).
   2. Confirmar que aplica sem erro sobre o schema existente (0001..0028).
   3. Regenerar `apps/web/src/integrations/supabase/database.types.ts` (fora de scope do executor; é o orquestrador).

2. **Correr o pgTAP no ambiente alvo**
   1. `supabase test db` no ambiente com pgTAP 1.3.
   2. Confirmar 85/85 ok e comparar com `specs/sprint-01-pgtap-output.txt`.
   3. Verificar em particular a semente de `storage.objects` (colunas NOT NULL do schema de storage do ambiente podem diferir — ver Blockers da spec).

3. **RLS do consultor (smoke manual)**
   1. Criar um utilizador com role `consultor` num restaurante de teste.
   2. Autenticado como consultor, confirmar leitura de `restaurants`, `turns`, `restaurant_members` e das tabelas HACCP.
   3. Confirmar 0 linhas (sem erro) em `reservations`, `menu_items`, `ingredients`.
   4. Confirmar que consegue inserir em `haccp_nc_verifications` mas NÃO em `haccp_temperature_readings` nem `haccp_nonconformities` nem `suppliers`.

4. **Janela de registo com relógio real**
   1. Configurar um ponto de controlo e um turno.
   2. Antes de `opens_at`, chamar `haccp_record_temperature` e esperar `haccp_fora_da_janela`.
   3. Dentro da janela, registar e confirmar `sync_mode='online'` e `recorded_at` de servidor.
   4. Registo diferido com `captured_at` na janela antes das 06:00 do dia seguinte → `sync_mode='deferred'`.

5. **Storage e quota**
   1. Fazer upload de um objecto para `haccp-evidence/{restaurant_id}/...` como membro.
   2. Confirmar que `haccp_storage_usage_bytes` reflecte o tamanho.
   3. Baixar `haccp_photo_quota_mb` abaixo do uso e confirmar que o próximo INSERT no bucket é recusado pela policy.

6. **Purga (owner)**
   1. Semear registos com `service_date` a 25 meses (via `haccp.seed`).
   2. Como owner, chamar `haccp_purge_expired` e confirmar as contagens devolvidas.
   3. Confirmar que os registos dentro da retenção sobrevivem e que um não-owner recebe `nao_autorizado`.

## Veredicto

**Sprint 01 entregue.** Os 8 itens estão implementados conforme a spec, com
evidência de código e cobertura de asserções pgTAP (85/85 no ambiente do
orquestrador). Gates de web verdes (typecheck, test 135, build); lint sem tarefa
configurada (nota, não regressão). Um único desvio documentado e justificado
(`haccp_now()` sem revoke de public). Nada em `apps/web` foi alterado, como exigido
pelo scope. Pendente: aplicação da migração ao ambiente Supabase e a bateria de
testes manuais acima, que requerem Postgres real e não foram executáveis nesta máquina.

---

# Sprint 02 — HACCP v1 (UI)

Actualizado a 2026-09-07. Spec: `specs/sprint-02.md`.

## Gates (2026-09-07, Windows, pnpm 10.6 + Turborepo)

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `tsc --noEmit` sem erros |
| Testes unitários | `pnpm test` | ✅ 17 ficheiros, **163 testes** verdes (eram 135; +24 em 3 ficheiros HACCP novos, +4 casos em `roles.test.ts`) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB, não bloqueia) |
| Lint | `pnpm lint` | ⚠️ 0 tarefas — `@stoa/web` continua sem script `lint` (não é regressão) |

Ficheiros de teste novos: `haccp-keypad.test.ts` (10), `haccp-offline-queue.test.ts`
(7), `haccp-photo.test.ts` (7).

## Teste manual da fila offline (item 4, modo avião)

Só validável num telemóvel real com rede a falhar. Passos:

1. Autenticar como `cozinha`, abrir `/haccp` e um turno com janela aberta em
   `/haccp/registar/:turnId`.
2. Activar modo avião no telemóvel (`navigator.onLine === false`).
3. Registar uma temperatura: o ponto fica com o registo em fila (toast "Sem rede:
   registo em fila para sincronizar") e o banner do hub mostra "1 registo por
   sincronizar". Confirmar que o ponto NÃO aparece como conforme.
4. Desactivar o modo avião: no evento `online` a fila esvazia por ordem; o registo
   é aceite com `sync_mode='deferred'` e o banner desaparece.
5. Caso limite (cutoff): manter offline até depois das 06:00 do dia seguinte e só
   então voltar a ter rede → o servidor devolve `haccp_fora_da_janela`; a UI
   descarta o item da fila e mostra toast persistente "1 registo de &lt;ponto&gt;
   não foi aceite: a janela fechou antes de sincronizar. Fica em falta."

A lógica pura da fila (FIFO, remove idempotente, markAttempt) está coberta por
`haccp-offline-queue.test.ts`; o passo manual valida a integração com o evento
`online` e o servidor.

## Capturas de ecrã (pendentes do orquestrador)

As capturas 390 px pedidas nos itens 2, 3, 5, 6, 7 e 8 (`specs/evidence/s02-*.png`)
não foram geradas: dependem do harness Puppeteer/Edge em `C:\dev\stoa-e2e-tmp` com
login (credenciais de `env.mjs`) e de dados reais num tenant de desenvolvimento, que
não existe (o executor não escreve em produção). Registado em Blockers da spec como
"capturas com dados pendentes do orquestrador".

## Verificação independente (auditor, 2026-09-07)

Relatório item a item: `specs/sprint-02-verification.md`. Gates reproduzidos nesta
máquina na forma simples: **typecheck ✅, test 163 ✅, build ✅**.

Veredicto por item:

| Item | Título | Veredicto |
|---|---|---|
| 1 | Role consultor, navegação e rotas | entregue (ressalva: consultor alcança páginas de escrita por URL directo; RLS protege) |
| 2 | Hub `/haccp`: estado do turno | entregue, capturas pendentes |
| 3 | Registar em dois toques (A2) | entregue, capturas pendentes; display de rectificação "corrigido: X → Y (nota)" parcial |
| 4 | Fila offline com sincronização diferida | parcial (não finge conformidade ✓; faltam chip por-ponto "por sincronizar" e os dois instantes captado/recebido) |
| 5 | Não conformidades e verificação (C1) | entregue, capturas pendentes |
| 6 | Recepção e recusa (B1, B2) | entregue, capturas pendentes |
| 7 | Pontos de controlo (A1) e fornecedores | entregue, capturas pendentes |
| 8 | Definições: cartão HACCP (NG7 exacto) | entregue, capturas pendentes |
| 9 | Gates e evidência | entregue (scope OK exceto `TESTING.md` na raiz, doc) |

Verificações-chave: (b) `recorded_at`/`recorded_by` nunca enviados pelo cliente —
**PASS**; (c) fila offline não finge conformidade — **PASS**; (d) texto NG7 exacto
— **PASS**; (a) consultor só acede a `/haccp/*` — **PASS**, mas "nunca vê botões de
escrita" tem ressalva (páginas `/haccp/registar` e `/haccp/recepcao` acessíveis por
URL directo, sem link na app, protegidas pela RLS); (e) scope respeitado exceto
`TESTING.md` (documentação na raiz, fora da lista literal do item 9).

---

# Sprint 03 — HACCP: dossiê, vista mensal, alertas, anti-métrica, semente

Actualizado a 2026-09-07. Spec: `specs/sprint-03.md`.

## Gates (2026-09-07, Windows, pnpm 10.6 + Turborepo)

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `tsc --noEmit` sem erros |
| Testes unitários | `pnpm test` | ✅ 19 ficheiros, **183 testes** verdes (eram 163; +20: `haccp-stats.test.ts` 11, `haccp-alerts.test.ts` 7, +2 em `haccp-offline-queue`) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB, não bloqueia) |

## Semente de demonstração (item 6, aplicada pelo orquestrador)

`supabase/seed/haccp_demo_lota_do_cais.sql` validada em Postgres 16 local com stub
Supabase (corrida duas vezes: **idempotente**) e aplicada ao tenant demo em produção,
com o mesmo resultado: **409 registos, 3 desvios, 1 diferido, 1 rectificação, 6
recepções, 1 recusa, 3 NC, 1 verificação, 8 células em falta, 1 grupo de burst**. O
executor/auditor não tem Postgres local nem acesso ao remoto; validou por leitura
(idempotência, datas relativas, 2 membros, só objectos do contrato).

## Capturas de ecrã (pendentes do orquestrador)

`s03-dossie-ecra.png`, `s03-dossie-print.pdf` (ou PNG da pré-visualização, com pelo
menos uma linha EM FALTA, um desvio e uma recusa), `s03-mensal.png`, `s03-dashboard.png`,
`s03-hub-burst.png`. Dependem do harness Puppeteer/Edge com login e da semente aplicada
ao tenant demo — fora do alcance do executor/auditor, como no Sprint 02.

## Verificação independente (auditor, 2026-09-07)

Relatório item a item: `specs/sprint-03-verification.md`. Gates reproduzidos nesta
máquina na forma simples: **typecheck ✅, test 183 ✅, build ✅**.

Veredicto por item:

| Item | Título | Veredicto |
|---|---|---|
| 1 | Dossiê para inspecção `/haccp/dossie` (E1) | entregue, capturas pendentes |
| 2 | Vista mensal por ponto de controlo (A3) | entregue, captura pendente |
| 3 | Alertas in-app (A3 e C1) | entregue, captura pendente |
| 4 | Anti-métrica: registos em bloco | entregue, captura pendente |
| 5 | Ajuda de primeira utilização | entregue |
| 6 | Semente de demonstração | validada (orquestrador + leitura) |
| 7 | Copy sem travessão | entregue (ressalva: 1 "—" em comentário do seed SQL, fora da lista literal) |
| 8 | Gates e evidência | entregue, capturas pendentes |

Verificações-chave: (a) impressão não esconde EM FALTA e imprime-o a negrito —
**PASS**; (b) nota de retenção + "não substitui o plano HACCP" no dossiê — **PASS**;
(c) nenhum alerta por email/push (só in-app, `<Link>`) — **PASS**; (d) grep de "—" no
conjunto de ficheiros do item 7 — **vazio/PASS** (ressalva: 1 ocorrência em comentário
do seed SQL, fora da lista); (e) `git diff --name-only HEAD~1` todo dentro do scope
HACCP — **PASS**.

---

# Sprint 04 — Stock S1 (unidades, artigos de compra e formatos)

Verificado nesta máquina (Windows, pnpm 10.6 + Turborepo) a 2026-11-14.

## Automático (com resultados)

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `@stoa/web`, `tsc --noEmit` sem erros |
| Testes unitários | `pnpm test` | ✅ 20 ficheiros, **208 testes** verdes (vitest) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB) |
| Lint | `pnpm lint` | ⚠️ 0 tarefas (sem script `lint` em `@stoa/web`, como nos sprints anteriores) |

Testes novos deste sprint:
- `src/lib/tech-sheet-cost.test.ts` — casos de `unitFactor` e de `computeLineCostCents`
  com peso médio por unidade (item 1/3): 2 kg→2000 g, 10 l→10000 ml, 2 un a 150 g/un→300 g,
  un sem peso→null, kg↔ml→null.
- `src/lib/purchase-items.test.ts` — **cálculo de embalagens** (`packEntryQty`,
  `packEntryBaseCostCents`) e **proposta de artigo a partir do alias**
  (`proposeEntryFromAlias`), incluindo o caso-âncora "Azeite Gallo VE 5L, 2 un,
  39,80 €" → 10 l a 398 cents/l, e a proposta de artigo a partir do nome da fatura
  (`proposeArticleFromRawName`/`parsePackFromText`).

### pgTAP (base de dados)

`supabase/tests/0015_stock_formatos.sql` (`plan(28)`).

- **Não corrido nesta máquina**: não há Postgres local e a instrução é não o instalar.
- Escrito e revisto pelo executor; execução pelo **orquestrador** com `supabase test db`
  (requer 0001..0018 + 0032), dentro de transacção com rollback.
- Cobre: conversão kg→g, l→ml, un→g com peso médio, un sem peso (rejeitado),
  kg→ml (rejeitado); entrada por 2 embalagens de 5 l em ingrediente em l (10 l) e em
  ml (10000 ml); custo por litro preservado; duas marcas somam no mesmo `stock_qty`;
  qty que não bate com packs (rejeitado); guarda de convertibilidade do artigo;
  famílias (ligação e rejeição de família de outro restaurante); aliases ligados a
  artigo; isolamento multi-tenant das tabelas e campos novos.

## Manual (passo a passo) — item 4

Pré-requisito: despensa com pelo menos um ingrediente (ex.: "Azeite" em `l`,
"Cebola" em `g`). Login como `owner` ou `gestor`.

### 4.1 Entrada por embalagens (ecrã Entradas de compra)
1. Abrir **Entradas de compra**. Numa linha, escolher o ingrediente "Azeite".
2. No selector de artigo da linha, se ainda não houver artigo, clicar **Novo artigo**:
   a proposta vem preenchida (formato = nome da linha; conteúdo = 5 L se o nome o
   trouxer). Confirmar marca/formato/conteúdo e **Guardar artigo**.
3. Com o artigo escolhido, indicar **2** embalagens e o custo por embalagem (ex.: 19,90).
   A linha mostra, antes de gravar, **= 10 l** e **398 €.../l** (custo por unidade base).
4. **Registar entrada**. Na Despensa, o saldo do Azeite sobe 10 l e o custo médio reflecte
   os 398 cents/l. A entrada por **quantidade directa** (sem artigo) continua disponível.

### 4.2 Proposta de artigo a partir do alias (segunda fatura)
1. Carregar uma fatura (PDF/foto) de um fornecedor. Numa linha sem artigo conhecido,
   o ecrã propõe criar o artigo a partir do nome do produto; confirmar.
2. Registar a entrada: fica gravado o alias do fornecedor **com** `purchase_item_id`.
3. Carregar nova fatura do **mesmo fornecedor** com o **mesmo nome de linha**: a linha
   aparece já com o **mesmo artigo** e as **mesmas embalagens** (= qty da fatura), sem
   intervenção. Rever e registar.

### 4.3 Despensa — artigos, família e peso médio
1. Na **Despensa**, abrir um ingrediente (clicar na linha).
2. No painel "Artigos de compra e família": criar/editar/desactivar artigos (marca,
   formato, conteúdo), atribuir ou criar **família**, e preencher o **peso médio por
   unidade (g)**.
3. Ingredientes da **mesma família** aparecem juntos na lista da despensa (a família
   aparece por baixo do nome).

### 4.4 Peso médio e ficha técnica
1. Num ingrediente comprado ao peso (ex.: "Cebola" em `g`), preencher peso médio 150 g.
2. Numa ficha técnica com uma linha "1 un" ligada a esse ingrediente, a linha **deixa**
   de aparecer como sem custo: o custo passa a ser calculado (1 un = 150 g).

Capturas de ecrã: pendentes (a recolher pelo orquestrador/David na validação visual).

---

# Sprint 06 — Correções da entrada de faturas (14-11-2026)

## Testado automaticamente (com resultados)

Corrido nesta máquina (Windows, pnpm 10.6 + Turborepo), `turbo run ... --force`:

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `@stoa/web`, `tsc --noEmit` sem erros |
| Testes unitários | `pnpm test` | ✅ 20 ficheiros, **235 testes** verdes (eram 208; +27) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB) |
| Lint | `pnpm lint` | ⚠️ 0 tarefas — `@stoa/web` continua sem script `lint` |

Testes novos (todos em funções puras, a evidência dos itens 1–5):
- `lib/purchase-items.test.ts` (17 → 42): `packsFromDirectQty` (24 un→24, 10 kg→10,
  10 l→2, 7 kg→vazio+assinalado), `packsOnArticleChange` (azeite 2 un→2 embalagens),
  `shouldOpenNewArticle` / `lineBlockReason`, `packCostCentsFromInvoice`
  (azeite 19,90; arroz 1,29; atum 1,65), `proposeIngredientFromRawName`
  (SAL MARINHO GROSSO 1KG → "Sal marinho grosso"/kg), `proposeArticleForIngredient`
  (atum un→1 un + "120 g"; azeite → Gallo/"Garrafão 5 L"; arroz → Cigala/"Embalagem 1 kg";
  sal → marca vazia), `unconvertibleFormatMessage`.
- `lib/roles.test.ts` (13 → 15): `canManagePantry` (owner/gestor/cozinha sim; balcão/consultor não).

## Testes manuais pendentes — repete o teste do David (passos numerados)

Pré-requisito: login como `owner`/`gestor`/`cozinha`, tenant de demonstração (Lota do Cais).
As duas faturas de teste são do mesmo fornecedor novo.

### A. Fatura 1187 (fornecedor novo — cria ingrediente e artigos)
1. Abrir **Entradas de compra** e carregar a fatura 1187 (PDF/foto). O formulário
   pré-preenche-se; rever as linhas.
2. Linha **ATUM POSTA ... RAMIREZ 120G**, ingrediente novo: clicar **Criar ingrediente**
   — proposta "Atum posta ... ramirez"/`un` (editar nome para "Atum" e unidade `un`).
   Criar. O ingrediente fica escolhido e aparece nas outras linhas sem recarregar.
3. A linha segue para a proposta de artigo (há conteúdo): o artigo vem **1 un** com
   formato "Embalagem 120 g" (não 120 g de conteúdo, porque o atum conta-se à unidade).
   Preço por embalagem = **1,65** (vem da fatura, em `un`). Guardar artigo.
4. Confirmar **24** embalagens (quantidade da fatura, não 1). Pré-visualização: **24 un**
   a **1,65 €/un**.
5. Linha **ARROZ CAROLINO CIGALA 1KG**: criar ingrediente "Arroz carolino"/`kg`; artigo
   "Embalagem 1 kg", marca Cigala, preço **1,29**; **10** embalagens → **10 kg** a **1,29 €/kg**.
6. Linha **AZEITE V.EXTRA GALLO GARRAFAO 5L**: criar ingrediente "Azeite"/`l`; artigo
   "Garrafão 5 L", marca Gallo, preço **19,90**; **2** embalagens → **10 l** a **3,98 €/l**.
7. Confirmar que **nenhum aviso de unidade** fica visível nas linhas já resolvidas e que
   os campos têm etiqueta por cima ("Embalagens", "Preço por embalagem (s/IVA)").
8. **Registar entrada**. Saldos esperados na Despensa: Atum **+24 un** (1,65 €/un),
   Arroz **+10 kg** (1,29 €/kg), Azeite **+10 l** (3,98 €/l).

### B. Fatura 1243 (aprendizagem — mesmo fornecedor)
1. Carregar a fatura 1243 (mesmo fornecedor, mesmos nomes de linha).
2. Cada linha aparece já com o **mesmo ingrediente e o mesmo artigo** aprendidos da 1187,
   e com as **embalagens = quantidade da fatura** e o preço por embalagem da fatura, sem
   reescrever nada.
3. **Registar entrada**. Os saldos sobem pela quantidade da 1243 e o custo médio
   actualiza-se.

### C. Bloqueio de registo (item 2)
1. Numa linha em que a fatura vem em `un` para um ingrediente em `l`/`kg` **sem artigo**,
   confirmar que aparece a razão "Escolha ou crie o artigo, ou indique a quantidade em
   litros." e que **Registar entrada** não grava essa linha até resolver.

### D. Barra de navegação (item 9)
1. Em ecrã de **1280–1920 px** (owner/gestor), confirmar que todos os itens são
   alcançáveis: os que não cabem na barra ficam no menu **Mais** (incl. Clientes e
   Definições). Em **telemóvel**, a barra mantém o scroll horizontal.

Capturas de ecrã: pendentes (validação visual pelo orquestrador/David).

# Sprint 06b — Afinações da entrada de faturas (14-11-2026)

## Testado automaticamente (com resultados)

Gate `pnpm turbo run typecheck test build --force` (Windows, pnpm 10.6 + Turborepo):

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `@stoa/web`, `tsc --noEmit` sem erros |
| Testes unitários | `pnpm test` | ✅ 20 ficheiros, **249 testes** verdes (eram 235; +14, dos quais +5 na iteração 2 do item 3b) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB) |
| Lint | — | ⚠️ `@stoa/web` continua sem script `lint` (0 tarefas) |

Testes novos (funções puras em `lib/purchase-items.test.ts`, 42 → 51):
- **Item 1 — `existingArticleTransition`**: caso real "AZEITE GALLO V.EXTRA 5 LT",
  2 UN a 19,90 com artigo existente de 5 l → **2 embalagens** e **19,90 €/embalagem**
  (via `packCostCentsFromInvoice`), e `packEntryQty`/`packEntryBaseCostCents` confirmam
  **10 l a 3,98 €/l (398 cents/l)**; não apaga um preço já escrito (`hasUserCost`);
  fora de `un` dá embalagens pela conversão e sem preço por embalagem.
- **Item 2 — `articlesMatchingContent`**: um artigo de 5 l é o único compatível com
  "5 LT"; conteúdos iguais em unidades diferentes batem certo (120 g contra 0,12 kg);
  devolve todos quando há mais do que um; vazio sem conteúdo legível ou sem compatível.
- **Item 3 — marca proposta**: "AZEITE GALLO V.EXTRA 5 LT"→Gallo,
  "AZEITE V.EXTRA GALLO GARRAFAO 5L"→Gallo, "ATUM RAMIREZ POSTA AZEITE 120 GR"→Ramirez,
  "MASSA ESPARGUETE MILANEZA 500G"→Milaneza, "ARROZ CAROLINO CIGALA 1KG"→Cigala,
  "SAL MARINHO GROSSO 1KG"→vazio; `parsePackFromText` lê "5 LT" como 5 l e "120 GR"
  como 120 g. Os testes do sprint 06 continuam verdes.
- **Item 3b (iteração 2) — `invoiceAlreadyRegistered`** (51 → 56 testes): mesmo fornecedor +
  número já registado bloqueia (incl. maiúsculas/acentos/espaços a mais); número diferente
  do mesmo fornecedor e mesmo número de outro fornecedor **não** bloqueiam; sem entradas
  nunca bloqueia. A note do bloqueio vem de `purchaseEntryNote`, a mesma que o registo grava.

A lógica das três afinações está coberta ao nível das funções puras e ligada na UI
(verificada por typecheck + build). A composição na UI (`Entradas.tsx`: pré-escolha no
parse, nota discreta, ordenação do seletor, preenchimento do preço ao escolher) não tem
teste de componente automatizado — fica para teste manual abaixo.

## Testes manuais pendentes — repete o teste do David (passos numerados)

Pré-requisito: login como `owner`/`gestor`/`cozinha`. O ingrediente "Azeite virgem
extra" (l) já tem o artigo "gallo · Garrafão 5L" (5 l) na despensa. A fatura **FA
2026/0412** é de um **fornecedor novo** (Distribuidora Atlântico Oeste) e inclui a linha
"AZEITE GALLO V.EXTRA 5 LT", **2 UN a 19,90**.

### A. Azeite resolvido pelo artigo existente (itens 1, 2 e 3)
1. Abrir **Entradas de compra** e carregar a fatura 0412. O formulário pré-preenche-se.
2. Na linha do azeite, confirmar que **NÃO** abriu o formulário "Criar artigo" e que o
   artigo **"gallo · Garrafão 5L"** aparece já **escolhido** no seletor, com a nota
   discreta **"Artigo existente sugerido; confirme"**.
3. Confirmar **2 embalagens** e **preço por embalagem = 19,90**; a pré-visualização
   mostra **= 10 l** a **3,98 €/l**.
4. Se existisse mais do que um artigo de 5 l para este ingrediente, confirmar (num tenant
   com esse caso) que o seletor abre com **esses artigos primeiro** e a criação não abre.
5. Apagar o preço e voltar a escolher o artigo no seletor: o preço **19,90** volta a
   preencher-se; escrever um preço à mão e trocar de artigo: o preço escrito **não é
   apagado**.
6. **Registar entrada**. O saldo do azeite sobe **+10 l** (3,98 €/l) e o custo médio
   actualiza-se.

### B. Aprendizagem do fornecedor novo (item 2, último ponto)
1. Carregar outra fatura do **mesmo fornecedor** com a mesma linha de azeite.
2. Confirmar que a linha vem já com o **mesmo artigo** resolvido (o alias ligou-se ao
   artigo escolhido em A), sem reescrever nada.

### C. Marca proposta (item 3) — quando se cria artigo
1. Numa linha cujo ingrediente **não** tenha artigo compatível (ex.: outro azeite),
   confirmar que a marca proposta no formulário "Criar artigo" é **Gallo** e não
   "V.extra".

### D. Fatura já registada bloqueia o registo (item 3b)
1. Com a fatura 0412 já registada em A, voltar a **Entradas de compra** e tentar registar
   outra entrada com o **mesmo fornecedor** (Distribuidora Atlântico Oeste) e o **mesmo
   número** (FA 2026/0412).
2. Confirmar que ao **Registar entrada** aparece o erro **"Esta fatura já está registada…"**
   (explica a unicidade e aponta a nota de crédito) e que **nenhum** movimento é gravado
   (a lista de entradas recentes não ganha nova entrada).
3. Mudar só o número (ex.: FA 2026/0413) ou só o fornecedor: o registo deixa de estar
   bloqueado.

Capturas de ecrã: pendentes (validação visual pelo orquestrador/David).
