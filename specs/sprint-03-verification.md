# Verificação independente — Sprint 03

Auditor independente (não implementou este código). Spec: `specs/sprint-03.md`.
Data: 2026-09-07. Branch: `feat/haccp-s3`.

## Gates reproduzidos nesta máquina (forma simples, sem pipes)

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ `tsc --noEmit` sem erros (cache miss, executado) |
| Testes | `pnpm test` | ✅ 19 ficheiros, **183 testes** verdes (vitest) |
| Build | `pnpm build` | ✅ `vite build` OK (aviso pré-existente de chunk >500 kB, não bloqueia) |

Ficheiros de teste HACCP relevantes ao sprint: `haccp-stats.test.ts` (**11** casos,
inclui lista vazia e valor único), `haccp-alerts.test.ts` (**7** casos). Ambos ≥ 6.

## Verificações-chave pedidas ao auditor

- **(a) A página de impressão não esconde registos em falta e imprime "EM FALTA"** —
  **PASS**. `HaccpDossiePrint.tsx:311-320`: uma célula `em_falta` gera a sua própria
  linha `<tr className="dossie-missing">` com o texto **EM FALTA** a negrito
  (`font-bold`) e estado "não recuperável". O CSS `.dossie-missing td { background:
  #fdecec }` está DEFINIDO FORA do bloco `@media print` (linha 535), logo aplica-se
  também na impressão; não existe qualquer regra `display:none`/`visibility:hidden`
  que oculte estas linhas ao imprimir. O único CSS de impressão sobre a tabela é
  `break-inside`. O texto "EM FALTA" imprime sempre, independentemente de o browser
  manter ou não o fundo coral.
- **(b) Nota de retenção e nota "não substitui o plano HACCP" no dossiê** — **PASS**.
  "Documento gerado pelo Nostos ... Não substitui o plano HACCP." na capa
  (`HaccpDossiePrint.tsx:253-256`). Nota de retenção (`restaurant.haccp_retention_note`)
  na última secção do dossiê (`HaccpDossiePrint.tsx:424-427`), como exige o item 1(6).
- **(c) Nenhum alerta é enviado por email/push (só in-app)** — **PASS**. `lib/haccp-alerts.ts`
  é puro: produz objectos `{ kind, text, to }` onde `to` é sempre uma rota interna
  (`/haccp`, `/haccp/registar/:id`, `/haccp/nc/:id`). `HaccpAlertsBanner.tsx` renderiza
  apenas `<Link>` do react-router. Grep por `resend|sendEmail|push|Notification|notify|
  sms|mailto|functions.invoke` nos ficheiros de alertas: sem qualquer chamada de I/O
  externo (só `alerts.push()` de array). Decisão da spec (linha 83) respeitada.
- **(d) Grep de "—" nos ficheiros HACCP vazio** — **PASS no conjunto literal do item 7**
  (`pages/Haccp*.tsx`, `components/haccp/*`, `components/settings/HaccpCard.tsx`,
  `lib/haccp*.ts`, `hooks/use-haccp*.ts`): grep de `—` e `–` devolve **vazio**.
  Ressalva (não bloqueia, fora da lista literal do item 7): há **1** travessão num
  COMENTÁRIO SQL da semente (`supabase/seed/haccp_demo_lota_do_cais.sql:83`) e
  travessões pré-existentes no doc de referência `docs/specs/haccp-v1-contract.md`
  (tabela de limites e títulos), nenhum deles no conjunto de ficheiros que o item 7
  delimita.
- **(e) `git diff --name-only HEAD~1` dentro do scope** — **PASS**. Os 28 ficheiros
  alterados são todos do módulo HACCP (páginas `Haccp*`, `components/haccp/*`,
  `hooks/use-haccp*`, `lib/haccp*`, `App.tsx` só rotas HACCP, `Dashboard.tsx` banner+cartão,
  `lib/query-keys.ts`), mais os artefactos do sprint (`README.md` secção nova,
  `docs/specs/haccp-anti-metrica.md`, `supabase/seed/haccp_demo_lota_do_cais.sql`,
  `specs/sprint-03.md`). Nada fora do HACCP foi tocado.

## Veredicto item a item

| Item | Título | Veredicto |
|---|---|---|
| 1 | Dossiê para inspecção `/haccp/dossie` (E1) | **entregue** (capturas pendentes) |
| 2 | Vista mensal por ponto de controlo (A3) | **entregue** (captura pendente) |
| 3 | Alertas in-app (A3 e C1) | **entregue** (captura pendente) |
| 4 | Anti-métrica: registos em bloco | **entregue** (captura pendente) |
| 5 | Ajuda de primeira utilização | **entregue** |
| 6 | Semente de demonstração | **validada** (output do orquestrador + leitura) |
| 7 | Copy sem travessão | **entregue** (ressalva: 1 "—" em comentário do seed SQL, fora da lista literal) |
| 8 | Gates e evidência | **entregue** (gates verdes; capturas pendentes) |

### Item 1 — Dossiê (E1)
Rotas `/haccp/dossie` e `/haccp/dossie/imprimir` presentes (`App.tsx:127-136`); a
página de impressão está sob `ProtectedRoute` SEM chrome do AppShell, mesmo padrão de
`/fichas/:id/imprimir`. Selector de presets e validação de máximo 92 dias
(`HaccpDossie.tsx:62`, "O intervalo não pode exceder 92 dias."). Conteúdo pela ordem
exigida: capa com `CasaLogo`, slug, período, gerado em/por, nota "não substitui o plano
HACCP"; sumário (`haccp_period_summary`); registos por dia/turno com valor, limites,
hora de servidor (e "captado" quando `deferred`), quem, estado, EM FALTA em linha
própria, rectificação com original riscado (`line-through`) + correcção + nota;
recepções com recusa em moldura coral (`.dossie-rejection`) e miniatura assinada;
NC com todos os campos, quem registou, "por verificar" a coral e horas em aberto;
rodapé fixo por página + nota de retenção na última secção. Uma query por secção
(hooks `use-haccp-dossier`), sem N+1; tempo de render medido em ecrã
(`print:hidden`, "renderizado em N ms"). Consultor alcança `/haccp/dossie`
(`lib/roles.ts:60` `consultor: ["/haccp"]`; só `/haccp/registar` e `/haccp/recepcao`
lhe são vedadas por `WRITE_ONLY_HACCP`), logo pode gerar em leitura. Capturas
(`s03-dossie-ecra.png`, `s03-dossie-print.pdf`) e o número de desempenho com a semente
ficam a cargo do orquestrador — classificados "capturas pendentes", sem penalizar.

### Item 2 — Vista mensal (A3)
`/haccp/pontos/:id` presente (`App.tsx:125`); `lib/haccp-stats.ts` puro com min/max/
média/desvio-padrão populacional/distintos e `isFlatline` (desvio 0 com ≥10 registos);
11 testes vitest (inclui vazio e valor único). Aviso âmbar com o texto exacto da spec
em `HaccpPonto.tsx:196` ("Valores sempre iguais: um inspector lê isto como registo não
real."). Captura `s03-mensal.png` pendente do orquestrador.

### Item 3 — Alertas in-app (A3, C1)
`lib/haccp-alerts.ts` puro produz `turno_com_faltas`, `desvio_sem_resposta`,
`nc_overdue` a partir de ontem/hoje + estado das NC; textos conforme a spec (ex.
"Não conformidade aberta há N h: <desc truncada a 60>"); 7 testes. `HaccpAlertsBanner`
coral, cada alerta com link para o ecrã certo, não renderiza nada sem alertas. Banner no
hub e no Dashboard; cartão "HACCP" no Dashboard com "Hoje: N de M verificações", NC
abertas e atalho "Dossiê" (`Dashboard.tsx:260-288`). In-app apenas (ver (c)). Captura
`s03-dashboard.png` pendente.

### Item 4 — Anti-métrica
Linha discreta no hub com o texto exacto ("Nos últimos 7 dias: N grupos..." / "Sem
registos em bloco nos últimos 7 dias") a partir de `haccp_burst_check`, expansível, com
copy de ajuda ASAE (`Haccp.tsx:245-268`). Documento `docs/specs/haccp-anti-metrica.md`
de uma página com SQL de exemplo por restaurante/semana e por grupo, sem construir nada
no Console. Captura `s03-hub-burst.png` pendente.

### Item 5 — Ajuda de arranque
Cartão de três passos no hub (Registar no turno → Corrigir desvios → Gerar dossiê,
`Haccp.tsx:199-201`) que desaparece após o primeiro registo (via existência de registos
em `use-haccp-burst`). Copy sem promessa de conformidade (NG7).

### Item 6 — Semente de demonstração
Tratado como **validado** pelo output do orquestrador (Postgres 16 + stub, corrida duas
vezes idempotente: 409 registos, 3 desvios, 1 diferido, 1 rectificação, 6 recepções,
1 recusa, 3 NC, 1 verificação, 8 células em falta, 1 grupo de burst; aplicado ao tenant
demo em produção com o mesmo resultado). Confirmado por leitura de
`supabase/seed/haccp_demo_lota_do_cais.sql`: idempotente (`haccp.purge` + reinsere;
pontos/fornecedores reutilizados por nome); datas RELATIVAS a `current_date`; nenhum
registo no dia actual (`current_date - 45` a `current_date - 1`); lê `turn_id` reais por
`restaurant_id`+`label` (não hardcoda), 2º turno só sexta/sábado; lê 2 membros de
`restaurant_members` (owner como `recorded_by`, segundo como `verified_by`) e **aborta
com mensagem clara se faltar o segundo membro** (linha 59-61); usa só objectos do
contrato; `set_config('haccp.seed','on',true)`. As 8 células em falta = 2 turnos × 4
pontos (`d_miss_jantar`, `d_miss_almoco`), coerente com o output. `README.md` ganha a
secção "HACCP: semente de demonstração" com o comando `psql ... -f`. Nota menor (não
bloqueia): os nomes dos pontos são "Frigorífico peixe / Arca congeladora / Banho-maria /
Expositor de sobremesas" (o tipo vai na coluna `kind`), interpretando o parêntese da
spec como o `kind` e não como parte do nome.

### Item 7 — Copy sem travessão
Grep de `—`/`–` no conjunto literal do item 7: **vazio** (ver (d)). Ressalva registada:
1 travessão em comentário SQL da semente e travessões no doc de contrato, ambos fora da
lista de ficheiros que o item 7 delimita.

### Item 8 — Gates e evidência
typecheck ✅, test **183** ✅, build ✅ nesta máquina. Capturas de ecrã pendentes do
orquestrador (mesmo padrão do Sprint 02).

## Conclusão

**Sprint 03 entregue.** Os 8 itens estão implementados conforme a spec, com evidência de
código e gates verdes (typecheck, test 183, build). As cinco verificações-chave passam;
a única ressalva é 1 travessão num comentário SQL da semente, fora do conjunto de
ficheiros que o item 7 delimita (não bloqueia). Pendente apenas do orquestrador: as
capturas de ecrã (itens 1-4, 8) e o registo do número de desempenho do dossiê com a
semente aplicada — ambos fora do alcance do executor/auditor, como no Sprint 02. Nenhuma
alteração foi feita ao código durante esta auditoria.
