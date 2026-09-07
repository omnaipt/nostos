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
