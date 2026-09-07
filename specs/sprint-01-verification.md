# Verificação independente — Sprint 01 (HACCP v1 backend)

Auditor: agente independente (não implementou o código). Data: 2026-09-07.
Método: leitura da migração `supabase/migrations/0029_haccp_v1.sql`, do teste
`supabase/tests/0014_haccp.sql`, do contrato `docs/specs/haccp-v1-contract.md` e
do output TAP `specs/sprint-01-pgtap-output.txt`. Gates de web corridos nesta
máquina. **Não há Postgres nesta máquina**, por isso os critérios de pgTAP são
verificados por dupla evidência: (a) o output TAP fornecido pelo orquestrador
(85/85 ok, corrido em Postgres 16 + pgTAP 1.3 + stub Supabase sobre a 0029) e
(b) confirmação de que cada cenário exigido pela spec tem asserção correspondente
no ficheiro de teste e lógica correspondente na migração.

Classificação: **entregue** / **parcial** / **em falta**.

## Resumo executivo

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

Gates de web: `typecheck` ✅, `test` (135) ✅, `build` ✅. `lint` — sem tarefa
configurada em `@stoa/web` (ver nota no item 8). pgTAP: 85/85 ok (output do
orquestrador; não reexecutado localmente por falta de Postgres).

---

## Item 1 — Role `consultor` e funções de pertença — **entregue**

Evidência de código:
- CHECKs de `restaurant_members.role` e `member_invites.role` incluem `'consultor'` (migração 36–46).
- `invite_member` valida `'consultor'` (linha 101).
- `is_restaurant_reader(uuid)` novo, SECURITY DEFINER STABLE (71–83); `is_restaurant_member` passa a excluir consultor com `and m.role <> 'consultor'` (51–64).
- Policies alteradas: `restaurants_member_select` (145), `members_select` (149), nova `turns_reader_select` (156).

Cenários pgTAP exigidos (todos presentes no output, asserções 1–8):
consultor lê `restaurants`(2), `turns`(3), `restaurant_members`(4); NÃO lê
`reservations`(5), `menu_items`(6), `ingredients`(7); `member_role` devolve
`'consultor'`(1); owner continua a ler tudo(8). Cobertura completa.

## Item 2 — Retenção e quota no tenant — **entregue**

Evidência de código:
- `haccp_retention_months int not null default 24 check between 12 and 120` (165).
- `haccp_retention_note` com o texto legal exacto exigido pela spec (167–168) — comparado carácter a carácter com o item 2 da spec: coincide.
- `haccp_photo_quota_mb int not null default 500 check between 50 and 5000` (169).
- `haccp_purge_expired` owner-only (`is_restaurant_owner`, senão `nao_autorizado`), `perform set_config('haccp.purge','on',true)` antes dos deletes, devolve `jsonb` com as 6 contagens (1058–1121).

Cenários pgTAP (asserções 67–76): default 24(67); cozinha não altera (RLS)(68);
purga por não-owner → `nao_autorizado`(69); purga conta 1 de cada
(readings/receptions/rejections/nonconformities/verifications/photos, 70–75);
reading dentro da retenção sobrevive(76). Cobertura completa.

## Item 3 — Pontos de controlo e defaults por tipo — **entregue**

Evidência de código:
- `haccp_kind_defaults` global com RLS SELECT para `authenticated`, sem escrita (201–216); seed dos 4 tipos com fonte AHRESP e a nota do expositor (218–232).
- `haccp_control_points` com todas as colunas, os dois CHECKs de limites e o índice único parcial `(restaurant_id, lower(name)) where active` (237–260).
- `haccp_control_point_turns` + gatilho `haccp_cpt_same_restaurant` → `turno_de_outro_restaurante` (322–348).
- RLS (SELECT reader; INSERT/UPDATE owner/gestor; sem DELETE) + gatilho `haccp_control_point_no_delete` → `haccp_ponto_nao_apagavel` (303–370). Gatilho `updated_at` (283–299).

Cenários pgTAP (asserções 9–15): min/max herdados do tipo(9,10); cozinha não
cria(11); cross-tenant não lê(12); delete levanta erro(13); `min_c>=max_c`
rejeitado(14); associação a turno de outro restaurante rejeitada(15). Cobertura completa.

## Item 4 — Registos de temperatura imutáveis e ancorados ao turno — **entregue**

Evidência de código:
- `haccp_service_date` com corte 06:00 no fuso (377–386); `haccp_turn_window` com opens/closes/cutoff e zero linhas se o turno não corre (394–428).
- `haccp_temperature_readings` com todas as colunas e índices exigidos, incluindo índice único parcial em `rectifies_id` (435–464).
- Gatilho `haccp_stamp_reading`: carimbo de servidor, snapshot de limites, `within_limits`, validação de janela online/diferida, cutoff, rectificação, modo semente (467–578).
- Gatilho genérico `haccp_immutable` → `haccp_registo_imutavel` (581–594).
- RLS (SELECT reader; INSERT member `recorded_by=auth.uid()`; sem UPDATE/DELETE) e RPC `haccp_record_temperature` INVOKER (596–632).

Cenários pgTAP (asserções 16–31): `recorded_at` do servidor ignora o cliente(16);
`within_limits` 5,0 conforme / 5,1 não(17,18); rectificação válida(19) e segunda
rectificação rejeitada(20); turno que não corre(21); ponto inactivo(22); ponto de
outro restaurante(23); antes de opens_at(24); depois de closes_at(25); diferido na
janela aceite como `deferred`(26); diferido após cutoff(27); `captured_at` no
futuro(28); consultor não insere(29); UPDATE(30) e DELETE(31) imutáveis. Cobertura completa.

Nota: o cenário "ponto de outro restaurante" resolve-se via RLS (ponto de B
escondido → `haccp_ponto_inexistente`), como documentado nos Blockers da spec e no
contrato §8. Continua a ser rejeição correcta.

## Item 5 — Não conformidades e verificação de eficácia — **entregue**

Evidência de código:
- `haccp_nonconformities` com CHECK de origem, gatilho de carimbo que herda `service_date/turn_id` da origem e valida mesmo restaurante, imutável, índices (819–894).
- `haccp_nc_verifications` com índice único em `nonconformity_id`, gatilho que exige `verified_by <> recorded_by` (→ `haccp_verificacao_mesmo_utilizador`) e mesmo restaurante, imutável (896–946).
- RLS: NC INSERT `is_restaurant_member`; verificação INSERT `is_restaurant_reader` (consultor verifica) `verified_by=auth.uid()` (948–962).
- Vista `haccp_nc_status` (security_invoker) com `status/verified_at/effective/open_hours/overdue>48h` (969–984).

Cenários pgTAP (asserções 32–39): NC com reading válido(32); reading de outro
restaurante rejeitado(33); verificação mesmo utilizador rejeitada(34); por outro
utilizador aceite(35); segunda verificação rejeitada(36); consultor verifica(37);
consultor não cria NC(38); overdue a 49h(39). Cobertura completa.

## Item 6 — Fornecedores, recepção e recusas — **entregue**

Evidência de código:
- `suppliers` com `name_norm` por gatilho, índice único `(restaurant_id, name_norm)`, RLS (SELECT reader; INSERT/UPDATE member; sem DELETE) (639–677).
- `haccp_receptions` com CHECK de temperatura, gatilho que valida fornecedor activo do mesmo restaurante e janela de `delivered_on` (não futuro, ≤7 dias) → `haccp_data_entrega_invalida`, imutável (679–754).
- `haccp_rejections` com índice único em `reception_id`, gatilho que exige recepção não conforme → `haccp_recusa_exige_nao_conforme`, imutável (756–814).
- Vista `haccp_supplier_stats` (security_invoker) (989–1004).
- Bucket `haccp-evidence` privado (`on conflict do nothing`), policies de storage (SELECT reader; INSERT member com verificação de quota), `haccp_storage_usage_bytes` DEFINER com guarda reader (1009–1052).

Cenários pgTAP (asserções 40–51): duplicado por nome normalizado(40);
`temperature_applicable` sem valor(41); recusa sobre não conforme aceite(42) e
stats conta 1 recusa(43) / 2 recepções(44); recusa sobre conforme rejeitada(45);
`delivered_on` futuro(46); cross-tenant(47); consultor lê stats(48) e não insere(49);
usage 0(50) e `nao_autorizado` para não membro(51). Cobertura completa.

## Item 7 — Estado por turno, lacunas e registos em bloco — **entregue**

Evidência de código:
- `haccp_expected_readings` INVOKER STABLE, guarda `is_restaurant_reader`/`nao_autorizado` e `p_to-p_from>92`/`intervalo_demasiado_longo`, uma linha por (dia, turno activo, ponto activo), registo = topo da cadeia de rectificação, 7 estados incluindo `desvio_*` e `em_falta`, respeita `created_at`/`deactivated_at` (1132–1213).
- `haccp_turn_status` wrapper de um dia (1218–1238).
- `haccp_period_summary` com o objecto jsonb exigido e `completion_rate` (1241–1301).
- `haccp_burst_check` (grupos ≥3 em janela de 2 min por `recorded_at`), guarda owner/gestor/consultor (1304–1335).

Cenários pgTAP (asserções 52–66): 13:00 `por_verificar`/`futuro`/P2 ausente
(52,53,54); `conforme` após 4,0(55); `desvio_sem_resposta` após 7,0(56);
`desvio_aberto` com NC(57); `desvio_resolvido` com verificação(58); `em_falta`
às 06:30(59,60); `period_summary` expected=3/recorded=1/missing=2 (61,62,63);
burst detecta 3 em 90s(64) e não 2(65); intervalo 100 dias rejeitado(66). Cobertura completa.

## Item 8 — Contrato e higiene de grants — **entregue (1 desvio documentado)**

Evidência de código:
- `docs/specs/haccp-v1-contract.md` existe e cobre: colunas novas, todas as tabelas com colunas/tipos, as 9 RPCs com assinaturas e erros exactos, as 2 vistas, semântica dos 7 `status`, regras de janela com exemplo numérico, convenção `photo_path`, limites por tipo, erros com texto exacto (§8) e decisões do sprint (§9). Escrito para a UI sem ler SQL. Coincide com a migração.
- Grants (1341–1387): `revoke all ... from public, anon; grant execute ... to authenticated` para as 10 funções expostas; funções de gatilho `revoke from public, anon` sem grant a `authenticated`.
- RLS activa asserida por pgTAP para as 9 tabelas (asserções 77–85).
- Teste corre `plan(85) ... finish() ... rollback` (14–16, 645–646). Output termina em `finish`/85 ok.

Desvio documentado (não é falha de scope, está registado nos Blockers da spec e no
contrato §9): **`haccp_now()` mantém EXECUTE a PUBLIC** (não é revogado de
public/anon), ao contrário do padrão 0024 aplicado às restantes funções de gatilho.
A spec item 8 pede literalmente "sem grant a authenticated" — isso é cumprido (não
há grant explícito) — mas a intenção do padrão 0024 (revogar de public/anon) não é
aplicada. Justificação registada: `haccp_now()` é chamada por funções SECURITY
INVOKER (`haccp_turn_window`, `haccp_service_date`, `haccp_expected_readings`) e
pela vista `haccp_nc_status`, que correm como o caller; revogar partiria essas
chamadas. Não expõe segredo (devolve a hora). Aceitável, mas fica o registo de que
o endurecimento de `haccp_now()` é menos estrito do que o padrão do resto do módulo.

Gates de web (item 8, última alínea):
- `pnpm typecheck` → 1 successful (cache hit, FULL TURBO) ✅
- `pnpm test` → 14 ficheiros, **135 testes** passados ✅
- `pnpm build` → vite build OK (aviso de chunk >500 kB, pré-existente, não bloqueia) ✅
- `pnpm lint` → **0 tarefas executadas**: `@stoa/web` não tem script `lint`. O
  CLAUDE.md lista `pnpm lint` como gate, mas o repo não tem lint configurado neste
  package. Não é regressão deste sprint (nada em `apps/web` mudou), mas fica a nota
  de que o gate de lint é actualmente inócuo.

---

## Notas do auditor

1. Não foi possível reexecutar o pgTAP (sem Postgres nesta máquina, e a instrução
   é não o instalar). Os veredictos de pgTAP assentam no output do orquestrador
   (85/85) cruzado com a inspecção do ficheiro de teste e da migração. Cada cenário
   pedido pela spec tem asserção e lógica correspondentes — não foi encontrado
   nenhum cenário exigido sem cobertura.
2. Todos os gates de web correram por cache hit (FULL TURBO), o que confirma que os
   inputs não mudaram e o resultado verde anterior se mantém. `apps/web` não foi
   tocado por este sprint (fora de scope), consistente com os gates verdes.
3. Único ponto a assinalar para o orquestrador/David: o desvio de `haccp_now()`
   (item 8) e a ausência de gate de lint no repo. Nenhum bloqueia a entrega.
