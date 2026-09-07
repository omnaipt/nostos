# Sprint 02: HACCP v1, interface de cozinha e de gestão (registo, estado do turno, NC, recepção, pontos, fornecedores)

Projecto: Nostos (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-haccp` (branch `feat/haccp-s2`, empilhada sobre `feat/haccp-s1`) | Data: 2026-09-07
Estado: planeado

Depende do Sprint 01 (migração 0029 aplicada ao remoto e `apps/web/src/integrations/supabase/database.types.ts` regenerado pelo orquestrador ANTES deste sprint arrancar). Contrato: `docs/specs/haccp-v1-contract.md`. Spec de produto: `docs/specs/haccp-spec-produto-sofia-02ago2026.md` (épicos A1, A2, A3, B1, B2, C1).

## Objectivo

Um colaborador de cozinha abre o Nostos no telemóvel, vê o que falta verificar no turno actual, regista uma temperatura em dois toques (ou fica em fila se não houver rede), é obrigado a registar a acção correctiva quando há desvio, regista uma recepção de mercadoria com fotografia e recusa quando aplicável. O gerente configura pontos de controlo e fornecedores e vê o estado do dia. Tudo dentro do backoffice existente (AppShell, RoleGate, tokens Costeiro), em português, mobile-first.

## Fora de scope

- Dossiê PDF, vista mensal por ponto, alertas no Dashboard, anti-métrica na UI, semente de demonstração (Sprint 03).
- Épico D, alergénios, rastreabilidade a jusante, portal de consultores, selector de restaurante.
- Alterar `/entradas`, `/despensa` ou qualquer página existente para além do necessário em nav, rotas e Definições.
- Service worker / PWA instalável. A fila offline é em `localStorage`, sem SW.
- Edge functions e qualquer alteração de schema. Se a UI precisar de algo que o contrato não dá, regista-se em Blockers.
- i18n do backoffice (é PT).

## Convenções deste repo que se aplicam

- Páginas em `apps/web/src/pages/`, componentes em `components/haccp/`, hooks em `hooks/use-haccp*.ts`, lógica pura testável em `lib/haccp*.ts` com vitest ao lado.
- Dados via TanStack Query + `supabase` client tipado (tipos regenerados). `queryKeys` centralizados em `lib/query-keys.ts` (acrescentar `haccp*`).
- Nav e gating por role em `lib/roles.ts` (`ALL_NAV`, `ALLOWED`, `homeForRole`) e `RoleGate`. Role vem de `useRole()` (`contexts/RoleContext`).
- Tokens de design Costeiro (areia/atlântico/terracota; semânticos alga/âmbar/coral) e componentes `components/ui/*`. Zero cores hardcoded.
- Toasts com `sonner`. Formulários com react-hook-form + zod.
- Datas: `restaurants.timezone`; helpers em `lib/service-date.ts` para converter. Dia de serviço HACCP = função do servidor (`haccp_service_date`); o cliente só apresenta.
- Gates: `pnpm typecheck`, `pnpm test`, `pnpm build` verdes.

## Itens

### 1. Role consultor, navegação e rotas

- [x] `lib/roles.ts`: `MemberRole` ganha `"consultor"`; `ROLE_LABEL` "Consultor"; `ROLE_HINT` "Só o módulo HACCP, em leitura, mais a verificação de eficácia de não conformidades."; `ALL_NAV` ganha `{ to: "/haccp", label: "HACCP" }` entre "Inventário" e "Fecho do dia"; `ALLOWED`: owner e gestor tudo; `balcao` ganha `/haccp`; `cozinha` ganha `/haccp`; `consultor` = `["/haccp"]`; `homeForRole("consultor") = "/haccp"`. `roles.test.ts` actualizado.
- [x] `EquipaCard` (Definições) permite convidar e mudar para `consultor` (o select de roles usa `MEMBER_ROLES`; confirmar que o consultor aparece com o hint).
- [x] Rotas em `App.tsx` dentro de `<Backoffice>`: `/haccp` (Hub), `/haccp/registar/:turnId` (Registar), `/haccp/recepcao` (Recepção), `/haccp/nc` e `/haccp/nc/:id` (Não conformidades), `/haccp/pontos` (Pontos de controlo), `/haccp/fornecedores` (Fornecedores).
- [x] Sub-navegação dentro de `/haccp` (tabs ou segmented control mobile-friendly): Hoje · Recepção · Não conformidades · Pontos · Fornecedores. Consultor vê Hoje, Não conformidades, Pontos (leitura) e Fornecedores (leitura); os botões de escrita não aparecem para consultor.

Evidência exigida: `roles.test.ts` verde com casos novos (consultor só acede a `/haccp/*`; cozinha acede a `/haccp/registar/x`); typecheck.

### 2. Hub `/haccp`: estado do turno de hoje (A3, parte diária)

- [x] Hook `useHaccpTurnStatus(restaurantId, serviceDate?)` chama `haccp_turn_status` e agrupa por turno.
- [x] Cabeçalho com o dia de serviço (formato "Seg, 7 Set") e um selector "ontem / hoje" (só dois dias; histórico mais longo é Sprint 03).
- [x] Por turno, um cartão com contagem (`3 de 5 verificados`) e a lista de pontos com chip de estado por `status` do contrato: `futuro` cinza, `por_verificar` âmbar, `conforme` alga, `desvio_sem_resposta` coral com texto "desvio sem resposta", `desvio_aberto` coral "acção registada, por verificar", `desvio_resolvido` alga, `em_falta` coral "em falta (não recuperável)".
- [x] Botão principal por turno "Registar temperaturas" (grande, altura mínima 56 px, só quando a janela está aberta; quando `futuro` mostra "abre às HH:MM"; quando todos `em_falta`/`conforme` e janela fechada, sem botão). Escondido para consultor.
- [x] Estado vazio honesto quando não há pontos de controlo: "Ainda não há pontos de controlo. Comece por declarar os equipamentos de frio e de quente." com link para `/haccp/pontos` (owner/gestor) ou texto "peça ao gerente" (outros).
- [x] Banner no topo quando existe fila offline pendente (item 4): "N registos por sincronizar".

Evidência exigida: typecheck + build; captura de ecrã 390 px de largura do hub com pelo menos um turno e três estados diferentes (fixture do executor no tenant de desenvolvimento, NUNCA no demo) guardada em `specs/evidence/s02-hub.png`. Se não houver forma de correr o browser, registar em Blockers e descrever o resultado no sumário.

### 3. Registar temperatura em dois toques (A2)

- [x] Página `/haccp/registar/:turnId`: lista dos pontos do turno com estado; tocar num ponto abre o teclado numérico próprio (componente `TempKeypad`: dígitos grandes, sinal negativo, vírgula decimal, uma casa decimal, botões de altura ≥ 56 px, funcional com uma mão); confirmar grava e volta à lista com o próximo ponto por verificar em destaque. Dois toques: ponto → valor+confirmar.
- [x] Ao confirmar: chama `haccp_record_temperature` via hook `useRecordTemperature`. Sucesso `within_limits=true`: toast curto e avança. `within_limits=false`: abre imediatamente o formulário de NC (item 5) em modal de ecrã inteiro com o `reading_id`; o modal não fecha sem gravar a NC ou sem o utilizador escolher explicitamente "Registar acção mais tarde" (o registo fica `desvio_sem_resposta` e o hub mostra-o a coral; a spec de produto exige que o desvio não fique escondido, não que a UI bloqueie a cozinha).
- [x] Erros do servidor mapeados para copy honesta: `haccp_fora_da_janela` → "Esta janela de turno já fechou. O registo fica em falta e não pode ser recuperado."; `haccp_turno_nao_corre_hoje` → "Este turno não corre hoje."; `haccp_registo_imutavel` nunca deve aparecer (não há UI de edição).
- [x] Rectificação: num ponto já `conforme`/desvio, acção secundária "Corrigir leitura" abre o mesmo teclado com nota obrigatória (mínimo 5 caracteres) e envia `p_rectifies_id`. A lista mostra "corrigido: 4,0 → 3,5 (nota)". Sem opção de apagar.
- [x] Copy visível junto ao teclado: "Hora registada pelo servidor: HH:MM" após gravar, para o colaborador perceber que não é o relógio do telemóvel.
- [x] `lib/haccp-keypad.ts` puro: parser do input ("-", ",", limite de 1 decimal, intervalo -60..200) com testes vitest (≥ 8 casos).

Evidência exigida: vitest verde; captura `specs/evidence/s02-keypad.png` (390 px).

### 4. Fila offline com sincronização diferida (A2)

- [x] `lib/haccp-offline-queue.ts` puro: fila em `localStorage` (chave `nostos.haccp.queue.v1`) de itens `{ localId, controlPointId, turnId, valueC, capturedAt (ISO, relógio local), note?, rectifiesId?, attempts }`; funções `enqueue`, `peek`, `remove`, `markAttempt`; reducer puro testado (≥ 6 casos, incluindo ordem FIFO e idempotência de `remove`).
- [x] Hook `useHaccpSync()`: no mount e no evento `online`, esvazia a fila por ordem chamando `haccp_record_temperature` com `p_captured_at`. Sucesso: remove e invalida queries. Erro `haccp_fora_da_janela` (cutoff passado): remove da fila e mostra toast persistente "1 registo de <ponto> não foi aceite: a janela fechou antes de sincronizar. Fica em falta." Erro de rede: mantém na fila, `attempts++`, tenta de novo no próximo `online`/mount; após 20 tentativas mantém-se mas o banner do hub diz "a tentar".
- [x] No teclado (item 3), se `navigator.onLine === false` ou se a chamada falhar com erro de rede (não de negócio), o registo entra na fila e a UI mostra o ponto com chip "por sincronizar" (âmbar tracejado) sem fingir que está conforme.
- [x] Registos sincronizados em diferido aparecem na lista com etiqueta "sincronizado em diferido, captado às HH:MM, recebido às HH:MM" (ambos os instantes, spec A2).

Evidência exigida: vitest da fila verde; descrição no sumário de um teste manual (modo avião no telemóvel) para `TESTING.md`.

### 5. Não conformidades e verificação de eficácia (C1)

- [x] Componente `NonconformityForm` (usado no modal do item 3, na recepção do item 6 e em `/haccp/nc` como "Registar manualmente"): campos do contrato: o que aconteceu (`description`), valor medido face ao limite (`measured_value`, `limit_text` pré-preenchidos quando vem de uma leitura: "7,0 °C" / "0 a 5 °C"), destino do produto (`product_disposition`, select com opções "Rejeitado/eliminado", "Reprocessado (cozinhado a ≥ 75 °C)", "Transferido para outro equipamento", "Consumido de imediato", "Outro" + texto), acção imediata, acção sobre a causa, quem executou (`executed_by_name`, pré-preenchido com o nome do perfil, editável). Zod com as mesmas restrições do contrato.
- [x] Página `/haccp/nc`: lista com filtro Abertas/Verificadas/Todas, ordenada por `occurred_at` desc, badge "há Nh" e destaque coral quando `overdue`. Consultor vê tudo e pode verificar.
- [x] Página `/haccp/nc/:id`: detalhe completo (origem com link para o registo/recepção, todos os campos, quem registou e quando) e secção "Verificação de eficácia": formulário (`effective` sim/não + nota) para qualquer utilizador que NÃO seja o autor; para o autor mostra "A verificação tem de ser feita por outra pessoa." (erro `haccp_verificacao_mesmo_utilizador` também mapeado). Depois de verificada, mostra quem e quando, sem edição.
- [x] Hooks `useHaccpNonconformities`, `useCreateNonconformity`, `useVerifyNonconformity` sobre a vista `haccp_nc_status` e tabelas do contrato.

Evidência exigida: typecheck/build; captura `specs/evidence/s02-nc.png`.

### 6. Recepção de matérias-primas e recusa (B1, B2)

- [x] Página `/haccp/recepcao`: formulário rápido: fornecedor (combobox sobre `suppliers` activos com "criar novo" inline que grava em `suppliers`), data de entrega (default hoje, máximo hoje, mínimo hoje-7), "temperatura aplicável?" toggle com valor, validade OK, embalagem OK, conforme sim/não, nota, fotografia opcional.
- [x] Fotografia: input `capture="environment"`; antes do upload redimensionar no cliente para máximo 1600 px no lado maior e JPEG qualidade 0,8 via canvas (`lib/haccp-photo.ts` puro para o cálculo de dimensões, com testes); upload para o bucket `haccp-evidence` em `<restaurant_id>/<yyyy>/<uuid>.jpg`; se o upload falhar por quota (erro de policy), copy: "Limite de fotografias do restaurante atingido (N MB). Pode registar sem fotografia ou pedir ao gerente para rever o limite nas Definições."
- [x] Ao gravar com `conforming=false`: abre de imediato o passo "Recusa" (causa tipificada em select com as 5 causas do contrato e rótulos em português: Higiene deficiente, Requisitos de embalagem, Validade ultrapassada, Temperatura insuficiente, Características organolépticas inadequadas; quantidade; descrição) e a seguir o `NonconformityForm` com `source='reception'` (mesma regra do item 3: pode adiar, fica visível como desvio sem resposta).
- [x] Lista das recepções dos últimos 14 dias abaixo do formulário, com fornecedor, data, conforme/recusada (coral), miniatura da foto (URL assinada de 1 h via `createSignedUrl`), quem e quando.
- [x] Hooks `useSuppliers`, `useCreateSupplier`, `useHaccpReceptions`, `useCreateReception`, `useCreateRejection`.

Evidência exigida: typecheck/build; vitest de `haccp-photo.ts`; captura `specs/evidence/s02-recepcao.png`.

### 7. Pontos de controlo (A1) e fornecedores

- [x] Página `/haccp/pontos` (escrita só owner/gestor; leitura para os outros): lista com nome, tipo, limites, turnos (Todos ou lista) e estado; criar/editar em dialog: nome, tipo (select com os 4 tipos de `haccp_kind_defaults`, ao escolher preenche os limites por defeito e mostra "Fonte: AHRESP, Código de Boas Práticas de Higiene" com link `source_url` que abre em nova aba), limites editáveis com validação `min < max`, "Todos os turnos" ou selecção múltipla dos turnos activos, ordem. Desactivar com confirmação ("Deixa de gerar verificações; o histórico mantém-se."). Sem apagar.
- [x] Onboarding rápido no estado vazio: botão "Criar os 3 pontos habituais" que cria "Frigorífico 1" (frio positivo), "Arca congeladora" (congelação) e "Banho-maria" (quente), todos em todos os turnos. Só aparece quando não há pontos.
- [x] Página `/haccp/fornecedores`: lista com nome, NIF, activo, `receptions_count`, `rejections_count` (coral quando ≥ 2 nos dados visíveis) e `last_rejection_at` (vista `haccp_supplier_stats`); criar/editar/desactivar (owner/gestor/cozinha/balcao; consultor lê).
- [x] Hooks `useHaccpControlPoints`, `useUpsertControlPoint`, `useHaccpKindDefaults`.

Evidência exigida: typecheck/build; captura `specs/evidence/s02-pontos.png`.

### 8. Definições: cartão HACCP

- [x] Em `/definicoes`, cartão "HACCP" (owner/gestor): meses de retenção (12 a 120) e texto de justificação (textarea, pré-preenchido com o default do servidor), quota de fotografias em MB com barra de uso (`haccp_storage_usage_bytes`), botão "Purgar registos fora da retenção" (owner) com confirmação em duas etapas que mostra as contagens devolvidas por `haccp_purge_expired`.
- [x] Texto fixo no cartão, sempre visível: "O Nostos regista e guarda prova. Não substitui o plano HACCP nem a análise de perigos, que continuam a ser responsabilidade do estabelecimento." (NG7 da spec de produto; copy exacta).

Evidência exigida: typecheck/build; captura `specs/evidence/s02-definicoes.png`.

### 9. Gates e evidência

- [x] `pnpm typecheck`, `pnpm test`, `pnpm build` verdes; contagem de testes antes e depois registada no sumário.
- [x] Nenhuma alteração fora de: `apps/web/src/{pages,components/haccp,components/settings,hooks,lib,App.tsx,lib/roles.ts,lib/query-keys.ts,lib/types.ts}` e `specs/`. Se precisar de tocar noutro ficheiro, justificar no sumário.
- [x] Capturas de ecrã: o executor tenta `pnpm --filter @stoa/web build` seguido de `vite preview` com o harness de screenshots existente em `C:\dev\stoa-e2e-tmp` (ver `backoffice.mjs` como referência: puppeteer-core com Edge, login com credenciais de `env.mjs`). Se as credenciais ou o Edge não estiverem disponíveis, regista em Blockers "capturas pendentes para o orquestrador" e segue.

## Estado de arranque (orquestrador, 07-09 16:35)

- Migração 0029 aplicada ao remoto; `apps/web/src/integrations/supabase/database.types.ts` regenerado e commitado (inclui todas as tabelas, vistas e RPCs `haccp_*`, `suppliers`, e as colunas novas de `restaurants`). Usar `supabase.from("haccp_...")` e `supabase.rpc("haccp_...")` TIPADOS; `looseFrom`/`looseRpc` só se faltar algo (e nesse caso registar em Blockers).
- `useMemberRole` (hooks/use-member-role.ts) degrada para `owner` qualquer role fora de `MEMBER_ROLES`; por isso o item 1 (acrescentar `"consultor"` a `MEMBER_ROLES`) é obrigatório ANTES de qualquer outra coisa, senão um consultor real veria o Dashboard como owner.
- Contrato: `docs/specs/haccp-v1-contract.md`. Erros de RPC chegam como `error.message` com o texto exacto (ex.: `haccp_fora_da_janela`).
- Não existe tenant de desenvolvimento separado: o executor NÃO cria dados em produção. Para capturas, usar o `vite preview` com a UI em estados vazios e, quando precisar de dados, fixtures locais via mocks nos testes; capturas com dados reais ficam para o orquestrador (registar em Blockers "capturas com dados pendentes do orquestrador").

## Decisões

- 2026-09-07 (orquestrador): desvio sem NC não bloqueia a cozinha; fica coral e visível no hub, no dossiê e nos alertas. Bloquear o serviço por um formulário seria preenchido a mentir.
- 2026-09-07 (orquestrador): fila offline em `localStorage` sem service worker; o custo de um SW não se justifica para o Gate 1 e a fila cobre o caso real (rede da cozinha a falhar durante minutos).
- 2026-09-07 (orquestrador): fotografias comprimidas no cliente (1600 px, JPEG 0,8); quota verificada no servidor.
- 2026-09-07 (orquestrador): balcão também acede ao HACCP (é quem recebe mercadoria em muitas casas).

## Blockers

- **Capturas de ecrã pendentes do orquestrador** (itens 2, 3, 5, 6, 7, 8). As
  capturas 390 px (`specs/evidence/s02-*.png`) dependem do harness Puppeteer/Edge
  em `C:\dev\stoa-e2e-tmp` com login por credenciais de `env.mjs` e de dados reais
  num tenant de desenvolvimento. Não há tenant de desenvolvimento separado e o
  executor não escreve em produção (nota do estado de arranque). O código está
  implementado e os gates (typecheck, test 163, build) estão verdes; falta só a
  geração das imagens com dados, que fica para o orquestrador. `TESTING.md` (secção
  Sprint 02) descreve o que cada captura deve mostrar.
- **Execução de comandos sob aprovação**: nesta sessão, comandos com pipes/`&&`
  foram bloqueados por política; os gates correram na forma simples (`pnpm
  typecheck`, `pnpm test`, `pnpm build`) e passaram. Sem impacto no código.

## Notas de implementação (executor, 2026-09-07)

- Ficheiros novos: `lib/haccp-status.ts`, `lib/haccp-keypad.ts` (+test),
  `lib/haccp-offline-queue.ts` (+test), `lib/haccp-photo.ts` (+test);
  hooks `use-haccp-status.ts`, `use-haccp-record.ts`, `use-haccp-points.ts`,
  `use-haccp-nc.ts`, `use-haccp-receptions.ts`, `use-haccp-sync.ts`,
  `use-haccp-admin.ts`; componentes `haccp/HaccpLayout.tsx` (+`HaccpChip`),
  `haccp/TempKeypad.tsx`, `haccp/NonconformityForm.tsx`,
  `settings/HaccpCard.tsx`; páginas `Haccp`, `HaccpRegistar`, `HaccpRecepcao`,
  `HaccpNc`, `HaccpNcDetail`, `HaccpPontos`, `HaccpFornecedores`.
- Ficheiros tocados dentro do scope permitido: `lib/roles.ts`, `lib/roles.test.ts`,
  `lib/query-keys.ts`, `lib/types.ts`, `hooks/use-team.ts` (`asRole` aceita
  `consultor`), `pages/Settings.tsx`, `App.tsx`.
- Formulários: validação com zod (contrato), estado controlado (o padrão real do
  repo; não há uso de react-hook-form no código existente). Registado como decisão.
- Detalhe da verificação de NC: o nome de "quem verificou" fica limitado pela RLS
  (`profiles` é self-only), por isso mostra-se "por si" / "por outro membro" + a
  data; a alternativa (RPC que exponha nomes) é do backend, fora de scope.
