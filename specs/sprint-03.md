# Sprint 03: HACCP v1, dossiê para inspecção, vista mensal, alertas, anti-métrica e semente de demonstração

Projecto: Nostos (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-haccp` (branch `feat/haccp-s3`, empilhada sobre `feat/haccp-s2`) | Data: 2026-09-07
Estado: planeado

Depende dos Sprints 01 e 02. Contrato: `docs/specs/haccp-v1-contract.md`. Spec de produto: `docs/specs/haccp-spec-produto-sofia-02ago2026.md` (épicos E1, A3 mensal, alertas de C1 e A3, anti-métrica da secção 6).

## Objectivo

Um gerente com um inspector à frente abre o dossiê de um período no telemóvel em três toques e guarda-o em PDF em menos de 30 segundos, com as lacunas visíveis e não escondidas. O gerente vê no Dashboard quando um turno fechou com registos em falta ou uma não conformidade está aberta há mais de 48 h, vê a variabilidade mensal por ponto de controlo e vê se a equipa está a preencher em bloco. O tenant de demonstração fica com 45 dias de histórico HACCP credível para as reuniões comerciais.

## Fora de scope

- Envio do dossiê por email a partir do servidor (não há gerador de PDF no servidor; o PDF é produzido pelo browser). A partilha faz-se pelo diálogo de impressão/partilha do sistema.
- Épico D, alergénios, rastreabilidade a jusante, portal de consultores.
- Alertas por push/email/SMS. Alertas são in-app.
- Alteração de schema. Se faltar algo, Blockers.
- Billing/paywall.

## Itens

### 1. Dossiê para inspecção `/haccp/dossie` (E1)

- [x] Rota `/haccp/dossie` dentro de `<Backoffice>` com selector de intervalo (presets: últimos 7 dias, últimos 30 dias, mês anterior, personalizado; máximo 92 dias, validado com a mesma regra do contrato) e botão "Gerar dossiê". Entrada no hub `/haccp` como acção primária secundária ("Dossiê") e no Dashboard (item 4), garantindo três toques a partir do Início: Início → HACCP → Dossiê → Gerar.
- [x] Rota `/haccp/dossie/imprimir?from=YYYY-MM-DD&to=YYYY-MM-DD` renderizada SEM chrome do AppShell (mesmo padrão de `/fichas/:menuItemId/imprimir`), optimizada para A4 com `@media print` (quebras de página por secção, cabeçalho repetido, sem cores de fundo pesadas, tipografia legível a preto). Botão "Guardar em PDF" que chama `window.print()`; em iOS/Android o utilizador usa Partilhar → Imprimir → Guardar PDF (instrução de uma linha visível apenas em ecrã, não na impressão).
- [x] Conteúdo, por esta ordem: (1) capa com identificação do estabelecimento (nome, logo se existir via `CasaLogo`, slug), período, data e hora de geração, gerado por (nome do perfil), nota "Documento gerado pelo Nostos a partir de registos com carimbo temporal de servidor. Não substitui o plano HACCP."; (2) sumário de conformidade do período (`haccp_period_summary`): verificações esperadas, registadas, em falta, taxa de preenchimento, desvios, desvios sem resposta, NC abertas/verificadas, recepções e recusas; (3) registos de temperatura agrupados por dia e turno com ponto, valor, limites, hora do servidor (e hora de captura quando diferido, ambas), quem registou, estado; registos EM FALTA impressos em linha própria com texto "EM FALTA" a negrito e fundo coral claro; rectificações mostradas com o original riscado e a correcção ao lado; (4) recepções e recusas, com recusas destacadas (moldura coral) e miniatura da foto quando existir; (5) não conformidades com todos os campos, quem registou, verificação de eficácia (ou "por verificar" a coral) e horas em aberto; (6) rodapé em todas as páginas com nome do estabelecimento, período, data de geração, página N de M (CSS `@page` + contadores quando o browser suportar; fallback com o rodapé no fim de cada secção) e a nota de retenção (`haccp_retention_note`) na última página.
- [x] Desempenho: para 92 dias × até 20 pontos × 3 turnos a página renderiza em menos de 5 s em desktop (uma query por secção, sem N+1: `haccp_expected_readings` + selects por intervalo). Registar no sumário o tempo medido com a semente do item 6.
- [x] Consultor pode gerar o dossiê (leitura).

Evidência exigida: typecheck/build; capturas `specs/evidence/s03-dossie-ecra.png` e `specs/evidence/s03-dossie-print.pdf` (ou PNG da pré-visualização de impressão) com pelo menos uma linha EM FALTA, um desvio e uma recusa visíveis.

### 2. Vista mensal por ponto de controlo (A3)

- [x] Rota `/haccp/pontos/:id` (a partir da lista de pontos): selector de mês (default mês actual), tabela dias × turnos com o valor registado (coral quando fora de limites, cinza "falta" quando `em_falta`, "futuro" vazio), resumo do mês: mínimo, máximo, média, desvio-padrão e nº de valores distintos, com aviso âmbar quando o desvio-padrão é 0 com 10 ou mais registos ("Valores sempre iguais: um inspector lê isto como registo não real.").
- [x] `lib/haccp-stats.ts` puro (min/max/média/desvio-padrão/distintos) com testes vitest (≥ 6 casos, incluindo lista vazia e um único valor).
- [x] Hook reutiliza `haccp_expected_readings` com o intervalo do mês.

Evidência exigida: vitest verde; captura `specs/evidence/s03-mensal.png`.

### 3. Alertas in-app (A3 e C1)

- [x] `lib/haccp-alerts.ts` puro: a partir de `haccp_turn_status` de ontem e de hoje e de `haccp_nc_status`, produz a lista de alertas: `turno_com_faltas` (turno com janela fechada e ≥ 1 `em_falta`; texto "Almoço de ontem fechou com 2 verificações em falta"), `desvio_sem_resposta` (texto com ponto e valor), `nc_overdue` (texto "Não conformidade aberta há 52 h: <description truncada a 60>"). Testes vitest (≥ 6 casos).
- [x] Banner de alertas no topo do hub `/haccp` para todos os roles e no Dashboard (`/`) para owner/gestor (componente `HaccpAlertsBanner`, coral, cada alerta com link para o ecrã certo: hub do dia, registo ou NC). Sem alertas, não renderiza nada.
- [x] Cartão "HACCP" no Dashboard (owner/gestor): "Hoje: N de M verificações" com barra, contagem de NC abertas, atalho "Dossiê". Segue o padrão visual dos cartões existentes (Ementa, Definições).

Evidência exigida: vitest verde; captura `specs/evidence/s03-dashboard.png`.

### 4. Anti-métrica: registos em bloco (secção 6 da spec de produto)

- [x] No hub `/haccp`, para owner/gestor/consultor, uma linha discreta abaixo dos turnos: "Nos últimos 7 dias: N grupos de registos feitos em bloco (3 ou mais em 2 minutos)" a partir de `haccp_burst_check`; quando N = 0 mostra "Sem registos em bloco nos últimos 7 dias" a alga. Ao tocar, expande a lista (quem, quando, quantos). Copy de ajuda: "Registos em bloco são o que a ASAE identifica como preenchimento retroactivo. Registe no momento da verificação."
- [x] Documento `docs/specs/haccp-anti-metrica.md` (uma página): como a OMNAI lê `haccp_burst_check` por tenant a partir do OMNAI Console no futuro (SQL de exemplo por restaurante e por semana), sem construir nada no Console neste sprint.

Evidência exigida: typecheck/build; captura incluída em `s03-hub-burst.png`.

### 5. Ajuda de primeira utilização

- [x] No hub, quando o restaurante tem pontos mas zero registos de sempre, um cartão de arranque com três passos (Registar no turno → Corrigir desvios → Gerar dossiê) que desaparece após o primeiro registo. Copy sem promessas de conformidade (NG7).

Evidência exigida: typecheck/build.

### 6. Semente de demonstração para a Lota do Cais

- [x] Ficheiro `supabase/seed/haccp_demo_lota_do_cais.sql`, idempotente (apaga antes os registos HACCP desse tenant e reinsere), com datas RELATIVAS a `current_date`, executado como `postgres`/service role com `set_config('haccp.seed','on',true)`: 4 pontos de controlo (Frigorífico peixe frio positivo, Arca congeladora congelação, Banho-maria quente, Expositor de sobremesas expositor), 2 fornecedores (Lota de Cascais, Hortas do Saloio), 45 dias de registos nos turnos existentes do tenant (slug `lota-do-cais-demo`, fuso Europe/Lisbon; turnos reais verificados a 07-09: "Almoço" 12:30 todos os dias, "Jantar" 19:30 todos os dias, "2º turno jantar" 21:30 só sexta e sábado; ler os `turn_id` reais por `restaurant_id` + `label`, não hardcodar; nas sextas e sábados o Jantar fecha às 21:30 e o 2º turno também tem registos), com valores plausíveis com variabilidade (±0,8 °C), 3 desvios (um com NC verificada, um com NC aberta há 60 h, um sem resposta), 6 recepções (uma recusada por temperatura insuficiente, com NC), 2 dias com um turno em falta, 1 registo diferido, 1 rectificação. Nenhum registo no dia actual (para a demo começar limpa no turno em curso). Utilizadores: o tenant tem 2 membros (um `owner` e um `balcao`); a semente lê os `user_id` de `restaurant_members` desse restaurante ordenados por `created_at` e usa o owner como `recorded_by` da maioria dos registos e das NC, e o segundo membro como `verified_by` das verificações (a regra "verificador diferente de quem registou" é validada pelo gatilho mesmo em modo semente). Se só existir 1 membro, a semente aborta com mensagem clara em vez de violar a regra.
- [x] O ficheiro NÃO é executado pelo executor (o executor não tem acesso ao remoto); o orquestrador aplica-o ao tenant demo e regista o resultado em `TESTING.md`. O executor valida a sintaxe e a idempotência contra o Postgres local se tiver um; senão, regista em Blockers "validação da semente pendente do orquestrador".
- [x] `README.md` do repo ganha uma secção curta "HACCP: semente de demonstração" com o comando de aplicação.

Evidência exigida: ficheiro existe, é idempotente por leitura e usa só objectos do contrato.

### 7. Copy sem travessão

- [x] Em todos os ficheiros do módulo HACCP (`pages/Haccp*.tsx`, `components/haccp/*`, `components/settings/HaccpCard.tsx`, `lib/haccp*.ts`, `hooks/use-haccp*.ts`) substituir o travessão "—" (U+2014) e o meia-risca " – " usados como pontuação por vírgula, dois pontos ou ponto final, conforme a frase (ex.: "Registe a acção correctiva ou adie — o desvio fica visível" → "Registe a acção correctiva ou adie; o desvio fica visível"). Não tocar em código fora do HACCP. Confirmar com grep que não resta nenhum "—" nesses ficheiros.

Evidência exigida: grep vazio + typecheck.

### 8. Gates e evidência

- [x] `pnpm typecheck`, `pnpm test`, `pnpm build` verdes; contagem de testes no sumário.
- [x] Capturas de ecrã como no Sprint 02, item 9.

## Decisões

- 2026-09-07 (orquestrador): PDF gerado pelo browser (`window.print()` sobre página de impressão dedicada), como já acontece na ficha de cozinha. Evita dependência de servidor de PDF e cumpre os 30 segundos. Email de partilha fica para quando houver gerador no servidor.
- 2026-09-07 (orquestrador): alertas in-app apenas; push/email exigem infra que o Gate 1 não justifica.
- 2026-09-07 (orquestrador): a semente de demonstração vive no repo e é relativa à data, pelo mesmo motivo da semente de histórico de vendas (`supabase/seed/historico_demo_lota_do_cais.sql`).

## Blockers

- **Capturas de ecrã pendentes do orquestrador** (itens 1, 2, 3, 4): `s03-dossie-ecra.png`,
  `s03-dossie-print.pdf` (ou PNG da pré-visualização), `s03-mensal.png`, `s03-dashboard.png`,
  `s03-hub-burst.png`. Como no Sprint 02, o harness Puppeteer/Edge (`C:\dev\stoa-e2e-tmp`) com
  login e dados vive fora do executor; o código está implementado e os gates (typecheck, test
  183, build) verdes. As capturas de dossiê exigem a semente do item 6 aplicada ao tenant demo
  (linha EM FALTA, um desvio e uma recusa visíveis), o que depende do orquestrador.
- **Validação da semente pendente do orquestrador** (item 6): o executor não tem Postgres local
  nem acesso ao remoto, por isso não correu `supabase/seed/haccp_demo_lota_do_cais.sql`. O
  ficheiro foi revisto por leitura: é idempotente (apaga em modo `haccp.purge` e reinsere; pontos
  e fornecedores reutilizados por nome), usa só objectos do contrato e datas relativas a
  `current_date`. O orquestrador aplica-o ao tenant demo (2 membros) e regista o resultado em
  `TESTING.md`.
- **Execução de comandos sob aprovação**: nesta sessão, comandos com pipes/`&&` foram bloqueados
  por política; os gates correram na forma simples (`pnpm typecheck`, `pnpm test`, `pnpm build`) e
  passaram. Sem impacto no código.

## Notas de implementação (executor, 2026-09-07)

- Ficheiros novos: `lib/haccp-stats.ts` (+test, 11 casos), `lib/haccp-alerts.ts` (+test, 7 casos);
  hooks `use-haccp-dossier.ts` (sumário, expected readings, registos brutos, recepções, NC, nome de
  perfil), `use-haccp-alerts.ts`, `use-haccp-burst.ts` (burst + existência de registos);
  componente `haccp/HaccpAlertsBanner.tsx`; páginas `HaccpDossie`, `HaccpDossiePrint`, `HaccpPonto`.
  Documento `docs/specs/haccp-anti-metrica.md`. Semente `supabase/seed/haccp_demo_lota_do_cais.sql`.
  Secção nova no `README.md`.
- Ficheiros tocados no scope: `App.tsx` (rotas `/haccp/dossie`, `/haccp/dossie/imprimir`,
  `/haccp/pontos/:id`), `pages/Haccp.tsx` (acção Dossiê, banner de alertas, cartão de arranque,
  linha de anti-métrica), `pages/HaccpPontos.tsx` (link para a vista mensal), `pages/Dashboard.tsx`
  (banner de alertas + cartão HACCP), `lib/query-keys.ts` (chaves do Sprint 03).
- Item 1 desempenho: a página de impressão mede o tempo do mount até os dados prontos e mostra-o
  em ecrã (`print:hidden`). O número real com a semente fica para o orquestrador registar no
  sumário (a evidência de 92 dias × pontos × turnos exige dados no tenant demo).
- Item 1 rodapé por página: rodapé fixo (`position: fixed`) repetido em cada página impressa; o
  número "N de M" fica ao critério do browser (paginação nativa) e há fallback com rodapé no fim de
  cada secção (visível só em ecrã). Nota de retenção na última secção.
- Item 7: substituídos todos os travessões "—" (U+2014) nos ficheiros do módulo por vírgula, dois
  pontos, ponto e vírgula ou texto conforme a frase; os placeholders de valor vazio passaram a
  texto ("sem valor", "sem limite", "não identificado") ou string vazia. Grep de "—"/" – " nesses
  ficheiros: vazio. Sem tocar em código fora do HACCP.
