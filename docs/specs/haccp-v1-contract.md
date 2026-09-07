# Contrato HACCP v1 (Sprint 01 backend → Sprint 02 UI)

Este documento descreve o que a migração `supabase/migrations/0029_haccp_v1.sql` expõe, para
quem constrói a UI (Sprint 02) sem ler o SQL. Fonte de verdade é a migração; se algo aqui
divergir, vale a migração. Tudo é multi-tenant por RLS: o cliente nunca filtra `restaurant_id`
à mão, mas passa-o nas escritas (as policies validam-no).

Provado por `supabase/tests/0014_haccp.sql` (pgTAP).

---

## 0. Conceitos

- **Dia de serviço (`service_date`)**: dia de calendário no fuso do restaurante (`restaurants.timezone`,
  default `Europe/Lisbon`) com corte às **06:00**. Um registo feito às 02:00 pertence ao dia anterior.
  Calculado por `haccp_service_date()`; o cliente não o calcula.
- **Turno como âncora**: cada registo de temperatura pertence a um `turn` (tabela `turns` já existente).
- **Janela do turno**: abre **60 min antes** do `start_time` do turno e fecha no `start_time` do
  turno seguinte do mesmo dia, ou às **06:00 do dia seguinte** se for o último turno. Fora da janela
  não se regista (sem preenchimento tardio).
- **Cutoff**: 06:00 do dia seguinte. Um registo diferido (offline) é aceite até ao cutoff, desde que
  o instante de captura esteja dentro da janela.
- **Imutabilidade**: registos de temperatura, não conformidades, verificações, recepções e recusas
  **nunca** se editam nem apagam. Corrige-se um registo de temperatura com uma **rectificação**
  encadeada (o original fica visível). Qualquer UPDATE/DELETE levanta `haccp_registo_imutavel`.
- **Role `consultor`**: leitura externa. Vê `restaurants`, `turns`, `restaurant_members` e todo o
  HACCP do restaurante, mas **não** vê dados de negócio (reservas, menu, ingredientes, etc.). Pode
  **verificar eficácia** de não conformidades. Não regista temperaturas, não cria NC, não edita nada.

---

## 1. Colunas novas em `restaurants`

| coluna | tipo | default | notas |
|---|---|---|---|
| `haccp_retention_months` | `int` | `24` | `check between 12 and 120`. Base da purga. |
| `haccp_retention_note` | `text` | (texto legal) | Justificação da retenção, editável nas Definições. |
| `haccp_photo_quota_mb` | `int` | `500` | `check between 50 and 5000`. Verificada na policy de INSERT do storage. |

Editáveis só por `owner`/`gestor` (policy `restaurants_manage_update`).

---

## 2. Tabelas

Todas com RLS activa. SELECT = `is_restaurant_reader` (inclui consultor) salvo indicação. Escrita
conforme indicado. Sem DELETE para `authenticated` nas tabelas probatórias.

### `haccp_kind_defaults` (global, só leitura)
Defaults de limites por tipo de ponto. RLS: SELECT para qualquer `authenticated`.

| kind | label | min_c | max_c | fonte |
|---|---|---|---|---|
| `frio_positivo` | Frio positivo (frigorífico) | 0 | 5 | AHRESP CBPH 2018 |
| `congelacao` | Congelação | — | -18 | AHRESP CBPH 2018 |
| `quente` | Manutenção a quente | 63 | — | AHRESP CBPH 2018 |
| `expositor` | Expositor refrigerado | 0 | 5 | AHRESP CBPH 2018 (expositor quente = `quente`) |

Colunas: `kind text pk, label text, min_c numeric(5,1), max_c numeric(5,1), source_label text, source_url text, note text`.

### `haccp_control_points`
Equipamentos a verificar. Escrita: `owner`/`gestor`. Sem DELETE (desactivar é `active=false`).

`id uuid pk, restaurant_id uuid, name text (1..80), kind text →kind_defaults, min_c numeric(5,1), max_c numeric(5,1), all_turns bool=true, active bool=true, sort_order int=0, created_by uuid, deactivated_at timestamptz, created_at, updated_at`.

- Se criares sem `min_c`/`max_c`, herda ambos do `kind` (gatilho). `check (min_c is not null or max_c is not null)` e `check (min_c < max_c)`.
- Nome único por restaurante (case-insensitive) enquanto `active`.
- `deactivated_at` é preenchido automaticamente quando `active` passa a falso (usado pelas funções de estado).

### `haccp_control_point_turns`
Associa um ponto (com `all_turns=false`) a turnos. `(control_point_id, turn_id)` pk, `restaurant_id`.
Escrita: `owner`/`gestor`. Gatilho rejeita turno de outro restaurante (`turno_de_outro_restaurante`).

### `haccp_temperature_readings` (imutável)
`id, restaurant_id, control_point_id, turn_id, service_date date, value_c numeric(5,1) (-60..200), min_c, max_c, within_limits bool, sync_mode text ('online'|'deferred'), captured_at timestamptz, recorded_at timestamptz, recorded_by uuid, rectifies_id uuid, note text (≤500)`.

- `recorded_at`/`recorded_by` são **carimbo de servidor**; o que o cliente enviar é ignorado.
- `min_c`/`max_c`/`within_limits` são snapshot do ponto no momento (não seguem alterações futuras).
- Escrita via RPC `haccp_record_temperature` (ver §3). SELECT reader; INSERT membro operacional (não consultor).

### `suppliers`
`id, restaurant_id, name text (1..120), name_norm text, nif text (~ '^[0-9]{9}$'), active bool=true, created_at`.
- `name_norm` mantido por gatilho; único por restaurante (rejeita duplicados por nome normalizado).
- Editável e desactivável (não é registo probatório). Sem DELETE. Escrita: membro (não consultor).

### `haccp_receptions` (imutável)
`id, restaurant_id, supplier_id, delivered_on date, service_date date, turn_id, temperature_applicable bool=false, temperature_c numeric(5,1), expiry_ok bool, packaging_ok bool, conforming bool, photo_path text, note text (≤1000), recorded_by, recorded_at`.
- `check (not temperature_applicable or temperature_c is not null)`.
- `delivered_on` pode ser até **7 dias** antes do dia de registo, nunca no futuro.
- `photo_path`, se preenchido, tem de começar por `{restaurant_id}/` (convenção do bucket).
- SELECT reader; INSERT membro.

### `haccp_rejections` (imutável)
`id, restaurant_id, reception_id (única), cause text, quantity_text text (≤120), description text (≤1000), recorded_by, recorded_at`.
- `cause ∈ {higiene_deficiente, requisitos_embalagem, validade_ultrapassada, temperatura_insuficiente, caracteristicas_organolepticas}`.
- Uma recusa por recepção; a recepção tem de ser `conforming=false`.

### `haccp_nonconformities` (imutável)
`id, restaurant_id, source text ('temperature'|'reception'|'manual'), reading_id, reception_id, service_date, turn_id, occurred_at, description text (3..2000), measured_value text, limit_text text, product_disposition text (≥2), immediate_action text (≥2), root_cause_action text (≥2), executed_by_name text (≥2), recorded_by, recorded_at`.
- `source='temperature'` exige `reading_id`; `source='reception'` exige `reception_id`; `manual` não exige.
- `service_date`/`turn_id` herdados do registo de origem quando existe.
- SELECT reader; INSERT membro operacional (não consultor).

### `haccp_nc_verifications` (imutável)
`id, restaurant_id, nonconformity_id (única), effective bool, note text (≤1000), verified_by, verified_at`.
- Uma verificação por NC; `verified_by` tem de ser **diferente** de quem registou a NC.
- SELECT reader; INSERT `is_restaurant_reader` — **o consultor pode verificar**.

---

## 3. RPCs (todas `grant execute to authenticated`)

### `haccp_record_temperature(p_control_point_id uuid, p_turn_id uuid, p_value_c numeric, p_captured_at timestamptz default null, p_note text default null, p_rectifies_id uuid default null) → table(id uuid, within_limits bool, sync_mode text, service_date date)`
Regista uma temperatura. Resolve o restaurante a partir do ponto.
- **Online** (`p_captured_at` nulo): exige `now()` dentro de `[opens_at, closes_at)`; `sync_mode='online'`.
- **Diferido** (`p_captured_at` preenchido): exige `p_captured_at` dentro de `[opens_at, closes_at)`, `now() < cutoff` e `p_captured_at ≤ now()`; `sync_mode='deferred'`.
- **Rectificação** (`p_rectifies_id`): o original tem de ser do mesmo restaurante/ponto/turno/dia e ainda não rectificado. Obedece à mesma janela.
- Erros: `haccp_ponto_inexistente`, `haccp_ponto_de_outro_restaurante`, `haccp_turno_de_outro_restaurante`, `haccp_ponto_inactivo`, `haccp_ponto_nao_associado_ao_turno`, `haccp_turno_nao_corre_hoje`, `haccp_fora_da_janela`, `haccp_rectificacao_invalida`, `haccp_sem_utilizador`.

### `haccp_service_date(p_restaurant_id uuid, p_at timestamptz default null) → date`
Dia de serviço no fuso do restaurante (corte 06:00). `p_at` omitido = agora.

### `haccp_turn_window(p_restaurant_id uuid, p_turn_id uuid, p_service_date date) → table(opens_at, closes_at, cutoff_at)`
Janela do turno nesse dia. **Zero linhas** se o turno não corre nesse dia (weekday) ou está inactivo.

### `haccp_expected_readings(p_restaurant_id uuid, p_from date, p_to date) → table(...)`
Uma linha por `(dia, turno que corre e estava activo, ponto activo associado)` com o estado.
Colunas: `service_date, turn_id, turn_label, control_point_id, control_point_name, kind, opens_at, closes_at, status, reading_id, value_c, within_limits, recorded_at, sync_mode, nc_id, nc_status`.
Guardas: `is_restaurant_reader` (`nao_autorizado`), intervalo `≤ 92` dias (`intervalo_demasiado_longo`).

### `haccp_turn_status(p_restaurant_id uuid, p_service_date date default null) → table(...)`
Wrapper de `haccp_expected_readings` para um dia (default: dia de serviço corrente).

### `haccp_period_summary(p_restaurant_id uuid, p_from date, p_to date) → jsonb`
`{"expected","recorded","missing","deviations","deviations_unanswered","nc_open","nc_verified","receptions","rejections","completion_rate"}`.

### `haccp_burst_check(p_restaurant_id uuid, p_from date, p_to date) → table(recorded_by, window_start, readings, control_points)`
Anti-métrica: grupos de ≥3 registos do mesmo utilizador em 2 minutos (usa `recorded_at`). Guarda `owner`/`gestor`/`consultor`.

### `haccp_storage_usage_bytes(p_restaurant_id uuid) → bigint`
Bytes usados no bucket `haccp-evidence` por um restaurante. Guarda `is_restaurant_reader` (`nao_autorizado`).

### `haccp_purge_expired(p_restaurant_id uuid) → jsonb`
Apaga registos fora da retenção (`service_date`/`created_at < hoje - retention_months`). **Owner-only** (`nao_autorizado`).
Devolve `{"readings","nonconformities","verifications","receptions","rejections","photos"}`.

---

## 4. Vistas (`security_invoker`)

### `haccp_nc_status`
Uma linha por NC: `nonconformity_id, restaurant_id, service_date, occurred_at, status ('aberta'|'verificada'), verified_at, effective, open_hours numeric, overdue bool (>48h aberta)`.

### `haccp_supplier_stats`
Por fornecedor: `supplier_id, restaurant_id, name, receptions_count, rejections_count, last_rejection_at, last_reception_at`.

---

## 5. Semântica de `status` (funções de estado)

Por célula `(dia, turno, ponto)`:

| status | significado |
|---|---|
| `futuro` | a janela ainda não abriu (`now < opens_at`) |
| `por_verificar` | janela aberta, sem registo (`opens_at ≤ now < closes_at`) |
| `conforme` | registo dentro dos limites |
| `desvio_sem_resposta` | registo fora de limites, sem NC |
| `desvio_aberto` | há NC, sem verificação |
| `desvio_resolvido` | NC verificada |
| `em_falta` | janela fechada sem registo (`now ≥ closes_at`) |

O registo considerado é o **mais recente da cadeia de rectificação** (o que não foi rectificado).
Pontos criados depois de `p_from` só contam a partir de `created_at::date`; pontos desactivados
deixam de contar a partir de `deactivated_at::date`.

---

## 6. Regras de janela — exemplo numérico

Fuso `Europe/Lisbon`. Turnos: Almoço `12:30`, Jantar `19:30` (ambos seg–dom). Dia D.

- Almoço: `opens_at = D 11:30` (12:30 − 60 min), `closes_at = D 19:30` (start do Jantar), `cutoff_at = (D+1) 06:00`.
- Jantar: `opens_at = D 18:30`, `closes_at = (D+1) 06:00` (é o último turno), `cutoff_at = (D+1) 06:00`.

Às 13:00 de D: Almoço está `por_verificar`, Jantar está `futuro`. Às 06:30 de D+1, sem registos,
o Jantar fica `em_falta`.

---

## 7. Storage

- Bucket privado `haccp-evidence`. Convenção de path: **`{restaurant_id}/...`** (o 1.º segmento é o tenant).
- SELECT para readers do tenant; INSERT para membros (não consultor) **e** só se o uso actual
  `haccp_storage_usage_bytes < haccp_photo_quota_mb × 1MB`. Sem UPDATE/DELETE para o cliente.
- Compressão é responsabilidade do cliente (Sprint 02).

---

## 8. Erros (texto exacto, todos `P0001` salvo indicação)

`haccp_fora_da_janela`, `haccp_turno_nao_corre_hoje`, `haccp_ponto_inactivo`,
`haccp_ponto_nao_associado_ao_turno`, `haccp_ponto_de_outro_restaurante`, `haccp_ponto_inexistente`,
`haccp_turno_de_outro_restaurante`, `haccp_rectificacao_invalida`, `haccp_sem_utilizador`,
`haccp_registo_imutavel`, `haccp_ponto_nao_apagavel`, `haccp_registo_de_outro_restaurante`,
`haccp_verificacao_mesmo_utilizador`, `haccp_recusa_exige_nao_conforme`, `haccp_fornecedor_invalido`,
`haccp_data_entrega_invalida`, `nao_autorizado`, `intervalo_demasiado_longo`, `turno_de_outro_restaurante`.

Violações de constraint: unicidade → `23505` (fornecedor duplicado, 2.ª verificação, 2.ª recusa),
`check` → `23514` (limites do ponto, temperatura em falta na recepção), RLS → `42501`.

---

## 9. Decisões deste sprint

- Consultor é um **role** em `restaurant_members` (não tabela nova); `is_restaurant_member` passou a
  excluí-lo, `is_restaurant_reader` inclui-o. Sem selector de restaurante no frontend neste gate.
- Corte do dia às **06:00** no fuso do restaurante; janela abre 60 min antes do turno e fecha no
  turno seguinte (ou 06:00 do dia seguinte).
- Offline é fila no cliente; o servidor aceita diferidos até às 06:00 do dia seguinte se `captured_at`
  estiver na janela. Depois disso o registo fica **em falta, sem excepção**.
- Recepções podem ser registadas até **7 dias** depois de `delivered_on`; o carimbo `recorded_at`
  mostra o atraso no dossiê. Não é preenchimento retroactivo de temperatura, é registo documental.
- Retenção **24 meses** por defeito, configurável (12–120), com justificação legal escrita no sistema.
- Quota de fotografias por tenant em MB, verificada na policy de INSERT do storage.
- Imutabilidade absoluta; correcção só por rectificação encadeada. Sem preenchimento tardio.
- Relógio injectável `haccp_now()` para testes; em produção devolve `now()`.
