# Verificação independente — Sprint 02 (HACCP v1, UI)

Auditor independente (não implementou o código). Spec: `specs/sprint-02.md`.
Data: 2026-09-07. Branch: `feat/haccp-s2` (commit `6f780e5`).

Método: correr os gates na forma simples (`pnpm typecheck`, `pnpm test`,
`pnpm build`) nesta máquina e inspeccionar o código item a item. As capturas de
ecrã estão registadas como pendentes do orquestrador (Blockers da spec); os
critérios que dependem delas ficam "parcial, capturas pendentes" sem penalizar o
resto do item.

## Gates (reproduzidos nesta máquina, Windows, pnpm 10.6 + Turborepo)

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `tsc --noEmit` sem erros (cache miss, executado) |
| Testes | `pnpm test` | ✅ **17 ficheiros, 163 testes** verdes (vitest) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB, não bloqueia) |

Contagem de testes confirmada: 163 (Sprint 01 tinha 135; +28). Ficheiros HACCP
novos: `haccp-keypad.test.ts` (10), `haccp-offline-queue.test.ts` (7),
`haccp-photo.test.ts` (7); `roles.test.ts` passou de 8 para 12 casos.

## Verificações-chave pedidas

**(a) Consultor nunca vê botões de escrita e só acede a `/haccp/*` — PARCIAL.**
- `lib/roles.ts`: `consultor` = `["/haccp"]`, `homeForRole("consultor")="/haccp"`.
  `canAccess` casa por prefixo de segmento; `roles.test.ts` cobre "consultor só
  acede a /haccp e sub-rotas, mais nada" (`/`, `/balcao`, `/despensa`,
  `/definicoes` → false). **"Só acede a `/haccp/*`" ✓.**
- Botões de escrita escondidos ao consultor nas páginas que ele vê: Hub
  (`Haccp.tsx:154` `showButton={!isConsultor}`), NC (`HaccpNc.tsx:36,77`),
  Pontos (`HaccpPontos.tsx:41`, escrita owner/gestor), Fornecedores
  (`HaccpFornecedores.tsx:26`). O tab "Recepção" está escondido ao consultor
  (`HaccpLayout.tsx:25`). **✓ nas tabs que ele vê.**
- **Buraco:** `RoleGate`/`canAccess` permitem QUALQUER `/haccp/*` ao consultor,
  incluindo `/haccp/registar/:turnId` e `/haccp/recepcao`, que são páginas
  inteiramente de escrita. Não há link na app para lá (o botão do Hub e o tab da
  Recepção estão escondidos), mas por URL directo o consultor renderiza os botões
  "Registar"/"Corrigir" (`HaccpRegistar.tsx:262-275`) e o formulário de recepção.
  A protecção real é a RLS do servidor (Sprint 01: consultor não insere em
  `haccp_temperature_readings` nem `suppliers`). A spec do item 1 limita o
  esconder-botões às tabs do consultor, por isso não é falha do item, mas o
  critério literal "nunca vê botões de escrita" tem esta ressalva.

**(b) `recorded_at`/`recorded_by` nunca enviados pelo cliente — PASS.**
Todas as ocorrências no código da app são LEITURA/ordenação, nunca escrita:
- `use-haccp-record.ts`: a RPC `haccp_record_temperature` só recebe
  `p_control_point_id`, `p_turn_id`, `p_value_c`, `p_captured_at`, `p_note`,
  `p_rectifies_id`. Sem `recorded_at`/`recorded_by`. O servidor carimba.
- `HaccpRegistar.tsx:140` faz `.select("recorded_at")` (leitura, para mostrar a
  hora do servidor). `HaccpNcDetail.tsx:67,155` lê `recorded_by`/`recorded_at`.
  `use-haccp-receptions.ts:123` faz `.order("recorded_at")`. `HaccpRecepcao.tsx:560`
  formata `row.recorded_at`.
- Inserts de NC (`use-haccp-nc.ts:109`), verificação (`:141`), recepção
  (`use-haccp-receptions.ts:180`), recusa (`:211`) e fornecedor (`:59`) NÃO
  incluem `recorded_at`/`recorded_by`/`occurred_at`/`verified_by`.

**(c) A fila offline não finge conformidade — PASS (com nota).**
- `HaccpRegistar.tsx:113-125,157-168`: sem rede (ou erro de rede) o registo entra
  na fila (`sync.enqueueLocal`) e mostra toast "Sem rede: registo em fila para
  sincronizar." O ponto NÃO passa a `conforme` — mantém o `status` do servidor
  (`por_verificar`) até sincronizar de facto.
- `use-haccp-sync.ts`: erro de negócio `haccp_fora_da_janela` DESCARTA o item com
  toast persistente ("…a janela fechou antes de sincronizar. Fica em falta.");
  erro de rede mantém e incrementa `attempts`. Nunca marca conforme localmente.
- **Nota (parcial no item 4):** o chip por-ponto "por sincronizar" (âmbar
  tracejado) do item 4 bullet 3 NÃO é renderizado na lista de `HaccpRegistar`; o
  estado pendente aparece só no banner do Hub ("N registos por sincronizar") e no
  toast. Não finge conformidade, mas falta o chip por ponto.

**(d) Texto NG7 nas Definições exacto — PASS.**
`components/settings/HaccpCard.tsx:16-17`, comparado caracter a caracter com a
spec (linha 104): idêntico —
"O Nostos regista e guarda prova. Não substitui o plano HACCP nem a análise de
perigos, que continuam a ser responsabilidade do estabelecimento." Sempre
visível (`HaccpCard.tsx:89-91`), sem gating.

**(e) Nenhum ficheiro fora do scope do item 9 — PASS (1 nota).**
`git diff --name-only HEAD~1`: todos os ficheiros de código estão em
`apps/web/src/{pages,components/haccp,components/settings,hooks,lib,App.tsx,
lib/roles.ts,lib/query-keys.ts,lib/types.ts}` e `specs/` (inclui
`specs/sprint-03.md`, dentro de `specs/`). `hooks/use-team.ts` e `pages/Settings.tsx`
estão em `hooks`/`pages` (permitido). **Nota:** `TESTING.md` (raiz do repo) foi
alterado e está FORA da lista literal do item 9 (que enumera `apps/web/...` e
`specs/`); é documentação e o próprio item 9 exige registar evidência, por isso é
desvio menor e defensável, não regressão de código. `EquipaCard.tsx` NÃO foi
tocado — o consultor aparece no select por já usar `MEMBER_ROLES` (item 1 bullet 2
satisfeito sem alteração).

## Veredicto item a item

| Item | Título | Veredicto | Evidência |
|---|---|---|---|
| 1 | Role consultor, navegação e rotas | **entregue** (ressalva em (a)) | `roles.ts`/`roles.test.ts` (12 casos, typecheck verde); rotas `App.tsx:116-122`; sub-nav `HaccpLayout.tsx`; `EquipaCard` usa `MEMBER_ROLES`+`ROLE_HINT` |
| 2 | Hub `/haccp`: estado do turno | **entregue, capturas pendentes** | `Haccp.tsx` (selector ontem/hoje, contagem, chips por `status`, botão ≥56px só com janela aberta e escondido a consultor, estado vazio honesto, banner da fila); `use-haccp-status.ts`; `haccp-status.ts` (labels/tons batem com a spec §5) |
| 3 | Registar em dois toques (A2) | **entregue, capturas pendentes; 1 sub-bullet parcial** | `HaccpRegistar.tsx` + `TempKeypad.tsx` (alvos h-16=64px), NC em modal de ecrã inteiro com "Registar acção mais tarde", copy de erros (`haccp_fora_da_janela`/`haccp_turno_nao_corre_hoje`), hora do servidor; `haccp-keypad.ts` (10 testes, intervalo -60..200, 1 decimal). **Parcial:** o display de rectificação "corrigido: 4,0 → 3,5 (nota)" não é mostrado — a RPC `haccp_turn_status` não devolve o valor anterior nem a nota; a escrita (`p_rectifies_id`+nota) está correcta |
| 4 | Fila offline com sincronização diferida (A2) | **parcial** | `haccp-offline-queue.ts` (reducer puro FIFO, 7 testes, `remove` idempotente); `use-haccp-sync.ts` (mount+`online`, negócio vs rede, cutoff descarta com toast persistente, banner "a tentar" após 20). **Não finge conformidade ✓.** Faltam: chip por-ponto "por sincronizar" (âmbar tracejado) na lista; etiqueta de diferido mostra "sincronizado em diferido" sem os dois instantes "captado às HH:MM, recebido às HH:MM" (a RPC não devolve `captured_at`) |
| 5 | Não conformidades e verificação (C1) | **entregue, capturas pendentes** | `NonconformityForm.tsx` (todos os campos do contrato + zod, disposição tipificada + "Outro"); `HaccpNc.tsx` (filtro Abertas/Verificadas/Todas, "há Nh", coral em `overdue`); `HaccpNcDetail.tsx` (bloqueia autor com "A verificação tem de ser feita por outra pessoa.", mapeia `haccp_verificacao_mesmo_utilizador`, consultor pode verificar). Nota documentada: "quem verificou" mostra "por si/por outro membro" (RLS self-only em `profiles`) |
| 6 | Recepção e recusa (B1, B2) | **entregue, capturas pendentes** | `HaccpRecepcao.tsx` (combobox de fornecedores + criar inline, data hoje-7..hoje, temperatura toggle, validade/embalagem, conforme, nota, foto `capture="environment"`, resize canvas 1600px/JPEG 0,8, copy de quota, recusa com as 5 causas, NC `source='reception'`, lista 14 dias com miniatura por `createSignedUrl` 1h); `haccp-photo.ts` (7 testes, nunca amplia) |
| 7 | Pontos de controlo (A1) e fornecedores | **entregue, capturas pendentes** | `HaccpPontos.tsx` (escrita owner/gestor, prefill por `kind`, fonte com `source_url` em nova aba, `min<max`, todos/selecção de turnos, desactivar com confirmação, sem apagar, onboarding "Criar os 3 pontos habituais"); `HaccpFornecedores.tsx` (stats, coral quando recusas ≥2, `last_rejection_at`); `use-haccp-points.ts` |
| 8 | Definições: cartão HACCP | **entregue, capturas pendentes** | `HaccpCard.tsx` (NG7 exacto sempre visível, retenção 12–120, quota MB com barra `haccp_storage_usage_bytes`, purga owner com confirmação em duas etapas mostrando as contagens de `haccp_purge_expired`); `use-haccp-admin.ts` |
| 9 | Gates e evidência | **entregue** (capturas pendentes; 1 nota de scope) | Gates verdes reproduzidos (typecheck, test 163, build); scope respeitado exceto `TESTING.md` na raiz (doc, defensável); capturas 390px pendentes do orquestrador (Blocker registado) |

## Resumo

Os 9 itens estão implementados e os três gates estão verdes nesta máquina
(typecheck, **163 testes**, build). As 5 verificações-chave: (b) e (d) passam sem
reservas; (c) passa (a fila não finge conformidade); (a) e (e) passam no
essencial com ressalvas documentadas (consultor pode alcançar as páginas de
escrita `/haccp/registar` e `/haccp/recepcao` por URL directo — protegido pela
RLS, sem link na app; `TESTING.md` na raiz está fora da lista literal do scope).

Desvios face à spec (nenhum bloqueante):
1. **Item 3** — display de rectificação "corrigido: X → Y (nota)" não mostrado
   (a RPC não devolve o valor/nota anteriores). Escrita correcta.
2. **Item 4** — chip por-ponto "por sincronizar" (âmbar tracejado) ausente na
   lista; etiqueta de diferido sem os dois instantes captado/recebido (a RPC não
   devolve `captured_at`).
3. **Item 1 / (a)** — páginas de escrita alcançáveis por URL pelo consultor;
   RoleGate gate só a `/haccp`, não distingue leitura/escrita dentro do módulo.
4. **Item 9 / (e)** — `TESTING.md` (raiz) fora da lista literal de scope (doc).

Capturas de ecrã (itens 2, 3, 5, 6, 7, 8): **parcial, capturas pendentes** do
orquestrador, conforme Blocker da spec (harness Puppeteer/Edge + tenant de dev
inexistente). O código está implementado; falta só a geração das imagens.
