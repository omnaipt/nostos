# Sprint 01: HACCP v1, fundações de backend (schema, RLS, RPCs, pgTAP)

Projecto: Nostos (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-haccp` (worktree, branch `feat/haccp-s1` de `origin/main` a019184) | Data: 2026-09-07
Estado: executado (SQL escrito e revisto; pgTAP escrito, execução pendente — sem Postgres/supabase CLI nesta máquina)

Spec de produto de origem: `docs/specs/haccp-spec-produto-sofia-02ago2026.md` (Sofia, 02-08-2026). Este sprint implementa o backend do Gate 1 (épicos A, B, C, E) mais as cinco decisões de arquitectura do ponto 7 dessa spec. A UI é o Sprint 02; o dossiê PDF, alertas e anti-métrica são o Sprint 03.

## Objectivo

No fim deste sprint existe uma migração aplicável (`supabase/migrations/0029_haccp_v1.sql`) que cria o modelo de dados HACCP multi-tenant, imutável e ancorado ao turno, com RLS, RPCs e funções de estado, provada por pgTAP (`supabase/tests/0014_haccp.sql`) e documentada num contrato (`docs/specs/haccp-v1-contract.md`) que o Sprint 02 consome sem adivinhar nada. Nada de UI neste sprint.

## Fora de scope

- Qualquer ficheiro em `apps/web/` (UI, hooks, tipos gerados). Os tipos `database.types.ts` são regenerados pelo orquestrador depois de aplicar a migração ao remoto.
- Épico D (diário de turno), ganchos 2 e 3 (alergénios na reserva, rastreabilidade a jusante), portal de consultores, sensores, formação, análises laboratoriais, geração de plano HACCP (NG1 a NG7 da spec de produto).
- Geração de PDF (Sprint 03). Aqui só as funções de agregação que o dossiê vai usar.
- Alterar as tabelas de stock (`purchases`, `supplier_product_aliases`, `ingredients`). A tabela `suppliers` nova NÃO se liga a `/entradas` neste sprint.
- Cron/pg_cron para alertas ou purga. Alertas são vistas calculadas; purga é RPC explícita do owner.
- Billing/paywall do módulo. Sem flag de subscrição neste sprint.
- Tocar em dados do tenant demo (Lota do Cais) ou em qualquer tenant existente. A migração não semeia dados de tenants; só a tabela global `haccp_kind_defaults`.
- Edge functions.

## Convenções deste repo que se aplicam

- Migrações numeradas `NNNN_nome.sql` em `supabase/migrations/`; a próxima é `0029`.
- Testes pgTAP em `supabase/tests/NNNN_nome.sql` com `begin; select plan(N); ... select * from finish(); rollback;`, seed próprio de utilizadores/restaurantes com UUIDs fixos (ver `0012_takeaway.sql` como referência de estilo, incluindo simulação de utilizador com `set local role authenticated` e `set_config('request.jwt.claims', ...)`; ver `0011_roles_team.sql` para o padrão de claims).
- Isolamento multi-tenant via RLS com `public.is_restaurant_member(restaurant_id)`. Roles curados em `restaurant_members.role` (`owner|gestor|balcao|cozinha`, CHECK da 0021).
- Fuso: `restaurants.timezone` (default `Europe/Lisbon`). Toda a conversão data/hora em SQL usa esse fuso, nunca UTC cru.
- Funções expostas ao cliente: `grant execute ... to authenticated`; revogar de `anon` e `public` (padrão da 0024_endurecer_funcoes_gatilho). Funções de gatilho não recebem grant.
- Comentários em português, sem travessão. Cada tabela e função com `comment on` a explicar o porquê.

## Itens

### 1. Role `consultor` e funções de pertença

Decisão de arquitectura 7.1 da spec de produto (aceite pelo David a 04-09): o modelo de membros já suporta um utilizador em N restaurantes (PK `restaurant_members(restaurant_id, user_id)`); o que falta é um role de leitura externa que NÃO veja dados de negócio fora do HACCP.

- [x] `restaurant_members.role` e `member_invites.role` aceitam `'consultor'` (CHECKs alterados; os existentes mantêm-se válidos).
- [x] `public.invite_member(p_email, p_role)` aceita `'consultor'` (validação do role alargada; resto intocado).
- [x] Nova função `public.is_restaurant_reader(target uuid) returns boolean` (SECURITY DEFINER, STABLE, mesma forma de `is_restaurant_member`): verdadeira para QUALQUER role, incluindo `consultor`.
- [x] `public.is_restaurant_member(target uuid)` passa a devolver falso para role `consultor` (adicionar `and role <> 'consultor'` à função existente, mantendo assinatura, definer e grants). Consequência desejada: todas as policies `*_member_all` existentes excluem o consultor automaticamente.
- [x] Policies alteradas para usar `is_restaurant_reader`: `restaurants_member_select` (0002), `members_select` em `restaurant_members` (0001) e nova policy de SELECT em `turns` (`turns_reader_select`). `member_role(p_restaurant_id)` continua a devolver o role do caller e devolve `'consultor'` para o consultor (depende de `members_select`).
- [x] pgTAP: consultor lê `restaurants`, `turns` e `restaurant_members` do seu restaurante; NÃO lê `reservations`, `menu_items` nem `ingredients` desse restaurante (0 linhas, sem erro); `member_role` devolve `'consultor'`; owner continua a ler tudo.

Evidência exigida: pgTAP 0014 verde nas asserções deste item (grupo "roles").
Notas: `list_team_members` continua a exigir `is_restaurant_member` (consultor não vê a equipa; owner vê o consultor na lista porque a query é por restaurante). `protect_last_owner` intocado.

### 2. Retenção e quota no tenant

Decisões 7.4 e 7.5 da spec de produto.

- [x] `restaurants.haccp_retention_months int not null default 24 check (between 12 and 120)`.
- [x] `restaurants.haccp_retention_note text not null default '<texto>'` com o texto: `Os registos HACCP são conservados por 24 meses. O Reg. (CE) 852/2004, art. 5.º n.º 4 c), exige conservação por um período adequado sem o quantificar; dois anos cobrem o ciclo típico de fiscalização da ASAE e a garantia de rastreabilidade do Reg. (CE) 178/2002, mantendo a minimização de dados. Alterável pelo responsável do estabelecimento nas Definições.`
- [x] `restaurants.haccp_photo_quota_mb int not null default 500 check (between 50 and 5000)`.
- [x] Ambas as colunas editáveis apenas por owner/gestor (já coberto por `restaurants_manage_update` da 0021; confirmar com teste: cozinha não consegue alterar).
- [x] `public.haccp_purge_expired(p_restaurant_id uuid) returns jsonb` (SECURITY DEFINER, owner-only via `is_restaurant_owner`, senão `raise exception 'nao_autorizado'`): apaga registos de temperatura, não conformidades, verificações, recepções, recusas e objectos de `storage.objects` do bucket `haccp-evidence` cujo `service_date` (ou `created_at` para objectos) seja anterior a `current_date - retention_months`; devolve `{"readings":n,"nonconformities":n,"verifications":n,"receptions":n,"rejections":n,"photos":n}`. Executa `perform set_config('haccp.purge','on',true)` antes dos deletes para passar nos gatilhos de imutabilidade (item 4).

Evidência exigida: pgTAP: purga apaga só o que está fora da retenção (fixture com `service_date` a 25 meses e a 1 mês via inserção como service_role/postgres com `set_config('haccp.purge','on',true)` para contornar o carimbo de servidor), devolve contagens correctas, cozinha recebe `nao_autorizado`.

### 3. Pontos de controlo e defaults por tipo

Épico A1.

- [x] Tabela global `public.haccp_kind_defaults (kind text primary key, label text not null, min_c numeric(5,1), max_c numeric(5,1), source_label text not null, source_url text not null, note text)`, RLS activa com policy de SELECT para `authenticated`, sem escrita. Seed:
  - `frio_positivo` "Frio positivo (frigorífico)": min 0, max 5. Fonte: AHRESP, Código de Boas Práticas de Higiene (2018), https://ahresp.com/app/uploads/2018/10/Codigo-CBPH_AHRESP.pdf
  - `congelacao` "Congelação": min null, max -18. Fonte: mesma.
  - `quente` "Manutenção a quente": min 63, max null. Fonte: mesma.
  - `expositor` "Expositor refrigerado": min 0, max 5. Fonte: mesma; note: "Expositores quentes configuram-se como Manutenção a quente."
- [x] Tabela `public.haccp_control_points (id uuid pk default gen_random_uuid(), restaurant_id uuid not null references restaurants on delete cascade, name text not null check (length(trim(name)) between 1 and 80), kind text not null references haccp_kind_defaults(kind), min_c numeric(5,1), max_c numeric(5,1), all_turns boolean not null default true, active boolean not null default true, sort_order int not null default 0, created_by uuid references auth.users on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())` com `check (min_c is not null or max_c is not null)` e `check (min_c is null or max_c is null or min_c < max_c)`; índice único parcial `(restaurant_id, lower(name)) where active`.
- [x] Tabela `public.haccp_control_point_turns (control_point_id uuid references haccp_control_points on delete cascade, turn_id uuid references turns on delete cascade, restaurant_id uuid not null, primary key (control_point_id, turn_id))` com gatilho que valida que o turno pertence ao mesmo restaurante do ponto (senão `raise exception 'turno_de_outro_restaurante'`).
- [x] RLS: SELECT para `is_restaurant_reader`; INSERT/UPDATE para `member_role(restaurant_id) in ('owner','gestor')`; DELETE proibido a `authenticated` (sem policy) e gatilho BEFORE DELETE que levanta `haccp_ponto_nao_apagavel` salvo `current_setting('haccp.purge', true) = 'on'` ou cascade de restaurante. Desactivar é `active = false`.
- [x] Gatilho `updated_at`.
- [x] pgTAP: owner cria ponto com limites por defeito do tipo (o INSERT sem `min_c/max_c` recebe os defaults do `kind` via gatilho BEFORE INSERT `haccp_apply_kind_defaults`); cozinha não cria; cross-tenant não lê; delete levanta erro; `min_c >= max_c` rejeitado; associação a turno de outro restaurante rejeitada.

Evidência exigida: pgTAP grupo "pontos".

### 4. Registos de temperatura imutáveis e ancorados ao turno

Épico A2 e decisões 7.2 e 7.3. Decisão do David (04-09): sem preenchimento tardio; registos em falta não são recuperáveis; nenhum registo se edita ou apaga.

- [x] Função `public.haccp_service_date(p_restaurant_id uuid, p_at timestamptz default now()) returns date`: dia de serviço no fuso do restaurante com corte às 06:00 (`(p_at at time zone tz - interval '6 hours')::date`).
- [x] Função `public.haccp_turn_window(p_restaurant_id uuid, p_turn_id uuid, p_service_date date) returns table (opens_at timestamptz, closes_at timestamptz, cutoff_at timestamptz)`: `opens_at` = `service_date + start_time` no fuso do restaurante menos 60 minutos; `closes_at` = `start_time` do turno activo seguinte desse restaurante no mesmo `service_date` (turnos cujo `weekdays` contém o ISO weekday do `service_date`, ordenados por `start_time`), ou `service_date + 1 dia às 06:00` no fuso se for o último; `cutoff_at` = `service_date + 1 dia às 06:00` no fuso (limite para sincronização diferida). Devolve zero linhas se o turno não corre nesse dia.
- [x] Tabela `public.haccp_temperature_readings (id uuid pk default gen_random_uuid(), restaurant_id uuid not null references restaurants on delete cascade, control_point_id uuid not null references haccp_control_points, turn_id uuid not null references turns, service_date date not null, value_c numeric(5,1) not null check (value_c between -60 and 200), min_c numeric(5,1), max_c numeric(5,1), within_limits boolean not null, sync_mode text not null check (sync_mode in ('online','deferred')), captured_at timestamptz, recorded_at timestamptz not null default now(), recorded_by uuid not null default auth.uid() references auth.users, rectifies_id uuid references haccp_temperature_readings, note text check (length(note) <= 500))`. Índices: `(restaurant_id, service_date, turn_id)`, `(control_point_id, service_date)`, `(rectifies_id)`.
- [x] Gatilho BEFORE INSERT `haccp_stamp_reading` (SECURITY DEFINER não é necessário; corre como invoker): força `recorded_at = now()` e `recorded_by = auth.uid()` (ignora o que o cliente enviar) quando `auth.uid()` não é nulo; se `auth.uid()` for nulo e `current_setting('haccp.purge', true) <> 'on'` (nem `haccp.seed`), levanta `haccp_sem_utilizador`; copia `min_c/max_c` do ponto de controlo (snapshot) e calcula `within_limits`; valida que ponto e turno pertencem a `restaurant_id` e que o ponto está `active` e associado ao turno (`all_turns` ou linha em `haccp_control_point_turns`); calcula `service_date := haccp_service_date(restaurant_id, coalesce(captured_at, now()))`; obtém a janela: se não houver janela para esse turno nesse dia, `haccp_turno_nao_corre_hoje`; regra online (`captured_at` nulo): `now()` tem de estar em `[opens_at, closes_at)`, senão `haccp_fora_da_janela`; `sync_mode := 'online'`; regra diferida (`captured_at` não nulo): `captured_at` em `[opens_at, closes_at)` E `now() < cutoff_at` E `captured_at <= now()`, senão `haccp_fora_da_janela`; `sync_mode := 'deferred'`; se `rectifies_id` não nulo: o original tem de existir, ser do mesmo restaurante, mesmo ponto, mesmo turno e mesmo `service_date`, e não pode ele próprio já ter sido rectificado (índice único parcial em `rectifies_id`), senão `haccp_rectificacao_invalida`. Uma rectificação obedece à mesma janela que um registo novo.
- [x] Gatilho BEFORE UPDATE OR DELETE `haccp_immutable` (função genérica reutilizada nas tabelas dos itens 5 e 6): levanta `haccp_registo_imutavel` salvo `current_setting('haccp.purge', true) = 'on'`. Ligado a `haccp_temperature_readings`.
- [x] RLS: SELECT `is_restaurant_reader`; INSERT `is_restaurant_member(restaurant_id)` (exclui consultor) `with check (recorded_by = auth.uid())`; sem UPDATE/DELETE.
- [x] RPC `public.haccp_record_temperature(p_control_point_id uuid, p_turn_id uuid, p_value_c numeric, p_captured_at timestamptz default null, p_note text default null, p_rectifies_id uuid default null) returns table (id uuid, within_limits boolean, sync_mode text, service_date date)` SECURITY INVOKER: resolve `restaurant_id` a partir do ponto, insere e devolve. Grant a `authenticated`.
- [x] pgTAP com relógio controlado: os testes fixam `now()` através de uma função `public.haccp_now()` usada por `haccp_stamp_reading` e `haccp_turn_window` em vez de `now()` directo; em produção `haccp_now()` devolve `now()`; nos testes é substituída (`create or replace`) por uma constante dentro da transacção. Cenários: registo online dentro da janela aceite com `recorded_at` do servidor mesmo que o cliente envie outro valor; registo antes de `opens_at` rejeitado; depois de `closes_at` rejeitado; diferido com `captured_at` na janela e `now()` antes do cutoff aceite com `sync_mode='deferred'`; diferido com `now()` depois do cutoff rejeitado; `captured_at` no futuro rejeitado; turno que não corre nesse weekday rejeitado; ponto inactivo rejeitado; ponto de outro restaurante rejeitado (RLS + gatilho); UPDATE e DELETE levantam `haccp_registo_imutavel` mesmo como owner; rectificação válida aceite e segunda rectificação do mesmo original rejeitada; `within_limits` calculado (5,0 em frio positivo 0..5 é conforme; 5,1 não é); consultor não insere.

Evidência exigida: pgTAP grupo "registos".
Notas: modo semente: quando `current_setting('haccp.seed', true) = 'on'` (só atingível por `postgres`/service role, nunca pelo cliente), o gatilho `haccp_stamp_reading` e os gatilhos de carimbo dos itens 5 e 6 respeitam `recorded_at`, `recorded_by`, `captured_at`, `service_date` e `sync_mode` fornecidos e saltam a validação de janela; servem para semear dados de demonstração com histórico (Sprint 03) e para fixtures de teste. Os gatilhos de imutabilidade NÃO têm excepção de semente. Ordem na migração: `suppliers` e `haccp_receptions` (item 6) antes de `haccp_nonconformities` (item 5), porque a NC referencia recepções. O cliente (Sprint 02) chama sempre o RPC; a policy de INSERT existe para que o RPC invoker funcione e para que um insert directo passe pelas mesmas guardas do gatilho.

### 5. Não conformidades e verificação de eficácia

Épico C1.

- [x] Tabela `public.haccp_nonconformities (id uuid pk, restaurant_id uuid not null references restaurants on delete cascade, source text not null check (source in ('temperature','reception','manual')), reading_id uuid references haccp_temperature_readings, reception_id uuid references haccp_receptions, service_date date not null, turn_id uuid references turns, occurred_at timestamptz not null default now(), description text not null check (length(trim(description)) between 3 and 2000), measured_value text, limit_text text, product_disposition text not null check (length(trim(product_disposition)) >= 2), immediate_action text not null check (length(trim(immediate_action)) >= 2), root_cause_action text not null check (length(trim(root_cause_action)) >= 2), executed_by_name text not null check (length(trim(executed_by_name)) >= 2), recorded_by uuid not null default auth.uid(), recorded_at timestamptz not null default now())` com `check ((source='temperature' and reading_id is not null) or (source='reception' and reception_id is not null) or (source='manual'))`. Gatilho BEFORE INSERT carimba `recorded_at/recorded_by`, valida que `reading_id`/`reception_id` pertencem ao mesmo restaurante e preenche `service_date` e `turn_id` a partir do registo de origem quando existir (para `manual`, `service_date := haccp_service_date(restaurant_id)` se nulo). Imutável (gatilho do item 4). Índices `(restaurant_id, service_date)`, `(reading_id)`, `(reception_id)`.
- [x] Tabela `public.haccp_nc_verifications (id uuid pk, restaurant_id uuid not null, nonconformity_id uuid not null references haccp_nonconformities, effective boolean not null, note text check (length(note) <= 1000), verified_by uuid not null default auth.uid(), verified_at timestamptz not null default now())`, índice único em `nonconformity_id` (uma verificação por NC). Gatilho BEFORE INSERT carimba e exige `verified_by <> recorded_by` da NC (senão `haccp_verificacao_mesmo_utilizador`) e mesmo restaurante. Imutável.
- [x] RLS nas duas: SELECT `is_restaurant_reader`; INSERT: NC para `is_restaurant_member` (qualquer role operacional); verificação para `is_restaurant_reader` (um consultor externo pode verificar eficácia; é o caso de uso do role) `with check (verified_by = auth.uid())`.
- [x] Vista `public.haccp_nc_status` (security_invoker = true): uma linha por NC com `status` (`aberta` sem verificação, `verificada` com verificação) , `verified_at`, `effective`, `open_hours` (horas desde `occurred_at` se aberta) e `overdue` (aberta há mais de 48 h).
- [x] pgTAP: NC de temperatura só com `reading_id` válido do mesmo restaurante; verificação pelo mesmo utilizador rejeitada; por outro utilizador aceite; segunda verificação rejeitada; consultor verifica; consultor não cria NC; `overdue` verdadeiro com `occurred_at` a 49 h (relógio controlado via `haccp_now()` na vista).

Evidência exigida: pgTAP grupo "nc".

### 6. Fornecedores, recepção de matérias-primas e recusas

Épico B1 e B2.

- [x] Tabela `public.suppliers (id uuid pk, restaurant_id uuid not null references restaurants on delete cascade, name text not null check (length(trim(name)) between 1 and 120), name_norm text not null, nif text check (nif ~ '^[0-9]{9}$'), active boolean not null default true, created_at timestamptz not null default now())`, `name_norm` mantido por gatilho (`lower(trim(regexp_replace(name, '\s+', ' ', 'g')))`), índice único `(restaurant_id, name_norm)`. RLS: SELECT reader; INSERT/UPDATE member (não consultor); DELETE proibido (sem policy). Editar e desactivar permitido (não é registo probatório).
- [x] Tabela `public.haccp_receptions (id uuid pk, restaurant_id uuid not null, supplier_id uuid not null references suppliers, delivered_on date not null, service_date date not null, turn_id uuid references turns, temperature_applicable boolean not null default false, temperature_c numeric(5,1) check (temperature_c between -60 and 200), expiry_ok boolean not null, packaging_ok boolean not null, conforming boolean not null, photo_path text check (photo_path is null or photo_path like restaurant_id::text || '/%'), note text check (length(note) <= 1000), recorded_by uuid not null default auth.uid(), recorded_at timestamptz not null default now())` com `check (not temperature_applicable or temperature_c is not null)`. Gatilho BEFORE INSERT carimba, valida fornecedor do mesmo restaurante e activo, `delivered_on` não posterior a `haccp_service_date(restaurant_id)` nem anterior a 7 dias (registo de recepção pode ser feito no próprio dia ou nos dias seguintes, ao contrário das temperaturas; decisão registada abaixo), `service_date := haccp_service_date(restaurant_id)` (dia em que foi registado). Imutável. Índices `(restaurant_id, service_date)`, `(supplier_id)`.
- [x] Tabela `public.haccp_rejections (id uuid pk, restaurant_id uuid not null, reception_id uuid not null references haccp_receptions, cause text not null check (cause in ('higiene_deficiente','requisitos_embalagem','validade_ultrapassada','temperatura_insuficiente','caracteristicas_organolepticas')), quantity_text text check (length(quantity_text) <= 120), description text check (length(description) <= 1000), recorded_by uuid not null default auth.uid(), recorded_at timestamptz not null default now())`, índice único em `reception_id`. Gatilho BEFORE INSERT carimba, exige recepção do mesmo restaurante com `conforming = false` (senão `haccp_recusa_exige_nao_conforme`). Imutável.
- [x] RLS nas duas: SELECT reader; INSERT member `with check (recorded_by = auth.uid())`.
- [x] Vista `public.haccp_supplier_stats` (security_invoker): por fornecedor, `receptions_count`, `rejections_count`, `last_rejection_at`, `last_reception_at`.
- [x] Bucket de storage `haccp-evidence` (privado) criado na migração como em 0019 (`insert into storage.buckets ... on conflict do nothing`), com policies em `storage.objects`: SELECT para readers cujo `(storage.foldername(name))[1]::uuid` é restaurante onde `is_restaurant_reader`; INSERT para members (não consultor) do mesmo restaurante E `public.haccp_storage_usage_bytes(restaurant) < quota_mb * 1024 * 1024`; sem UPDATE/DELETE para `authenticated`. Função `public.haccp_storage_usage_bytes(p_restaurant_id uuid) returns bigint` SECURITY DEFINER que soma `(metadata->>'size')::bigint` dos objectos do bucket com prefixo `restaurant_id/`. Grant a `authenticated`, guarda `is_restaurant_reader`.
- [x] pgTAP: fornecedor duplicado por nome normalizado ("Peixaria  Central" vs "peixaria central") rejeitado; recepção com `temperature_applicable` sem valor rejeitada; recusa sobre recepção conforme rejeitada; recusa válida aceite e `haccp_supplier_stats` conta 1; `delivered_on` no futuro rejeitado; cross-tenant rejeitado; consultor lê stats e não insere; `haccp_storage_usage_bytes` devolve 0 para restaurante sem objectos e `nao_autorizado` para não membro.

Evidência exigida: pgTAP grupo "recepcao".

### 7. Estado por turno, lacunas do período e registos em bloco

Base do épico A3 (Sprint 02) e do E1 (Sprint 03), mais a anti-métrica da secção 6 da spec de produto.

- [x] Função `public.haccp_expected_readings(p_restaurant_id uuid, p_from date, p_to date) returns table (service_date date, turn_id uuid, turn_label text, control_point_id uuid, control_point_name text, kind text, opens_at timestamptz, closes_at timestamptz, status text, reading_id uuid, value_c numeric, within_limits boolean, recorded_at timestamptz, sync_mode text, nc_id uuid, nc_status text)` SECURITY INVOKER, STABLE, guarda `is_restaurant_reader` (senão `nao_autorizado`) e `p_to - p_from <= 92` (senão `intervalo_demasiado_longo`). Uma linha por (dia, turno que corre nesse weekday e estava activo, ponto activo associado). O registo considerado é o mais recente da cadeia de rectificação (o que não foi rectificado). `status` ∈ `futuro` (janela ainda não abriu), `por_verificar` (janela aberta, sem registo), `conforme`, `desvio_sem_resposta` (fora de limites sem NC), `desvio_aberto` (com NC sem verificação), `desvio_resolvido` (NC verificada), `em_falta` (janela fechada sem registo). Pontos criados depois de `p_from` só contam a partir de `created_at::date`; pontos desactivados deixam de contar a partir de `updated_at::date` do momento em que `active` passou a falso (guardar `deactivated_at timestamptz` no ponto, preenchido por gatilho, e usar essa coluna).
- [x] Função `public.haccp_turn_status(p_restaurant_id uuid, p_service_date date default null) returns setof` mesma forma de `haccp_expected_readings` para um dia (default `haccp_service_date(p_restaurant_id)`). Wrapper.
- [x] Função `public.haccp_period_summary(p_restaurant_id uuid, p_from date, p_to date) returns jsonb`: `{"expected":n,"recorded":n,"missing":n,"deviations":n,"deviations_unanswered":n,"nc_open":n,"nc_verified":n,"receptions":n,"rejections":n,"completion_rate":0.0..1.0}` calculado sobre `haccp_expected_readings` e as tabelas do período.
- [x] Função `public.haccp_burst_check(p_restaurant_id uuid, p_from date, p_to date) returns table (recorded_by uuid, window_start timestamptz, readings int, control_points int)`: grupos de 3 ou mais registos do mesmo utilizador com `recorded_at` dentro de uma janela deslizante de 2 minutos (anti-métrica "registos em bloco"; usar `recorded_at`, não `captured_at`). Guarda `member_role in ('owner','gestor','consultor')`.
- [x] pgTAP com relógio controlado: fixture com 2 turnos (Almoço 12:30 seg a dom, Jantar 19:30 seg a dom) e 2 pontos (um `all_turns`, outro só do Jantar); às 13:00 o estado do dia mostra `por_verificar` para o ponto 1 no Almoço, `futuro` para os do Jantar, e o ponto 2 não aparece no Almoço; depois de registar 4,0 no ponto 1 do Almoço fica `conforme`; registo de 7,0 fica `desvio_sem_resposta`; com NC fica `desvio_aberto`; com verificação `desvio_resolvido`; às 06:30 do dia seguinte o Jantar sem registos está `em_falta`; `haccp_period_summary` devolve `expected=3, recorded=1, missing=2` nessa fixture (ajustar aos números reais da fixture e escrever o esperado no teste); `haccp_burst_check` detecta 3 registos em 90 s e não detecta 2; intervalo de 100 dias rejeitado.

Evidência exigida: pgTAP grupo "estado".

### 8. Contrato para o Sprint 02 e higiene de grants

- [x] `docs/specs/haccp-v1-contract.md`: tabelas com colunas e tipos, RPCs com assinaturas e erros possíveis (`haccp_fora_da_janela`, `haccp_registo_imutavel`, etc. com o texto exacto), vistas, semântica de `status`, regras de janela com exemplo numérico, convenção de `photo_path`, limites por tipo, e a lista de decisões deste sprint. Escrito para quem vai construir a UI sem ler o SQL.
- [x] Todas as funções novas expostas: `revoke all on function ... from public, anon; grant execute ... to authenticated`. Funções de gatilho e `haccp_now()` sem grant a `authenticated` (padrão 0024). Tabelas novas: RLS activa em todas (asserção pgTAP `select ok((select relrowsecurity from pg_class where relname = '...'))` para cada uma).
- [x] `supabase/tests/0014_haccp.sql` corre de ponta a ponta com `plan(N)` correcto e termina em `finish()` + `rollback`.
- [x] `pnpm typecheck`, `pnpm test`, `pnpm build` continuam verdes (nada em `apps/web` muda; confirmar que o build não foi partido por acidente).

Evidência exigida: ficheiro de contrato existe e cobre todos os objectos criados; output dos gates.

## Decisões

- 2026-09-04 (David): Gate 0 dispensado; construir o Gate 1 até ao main. Imutabilidade mantida sem preenchimento tardio. Scope A + B + C + E. Preparar role de consultor e retenção de 2 anos com justificação no sistema.
- 2026-09-07 (orquestrador): consultor implementado como role em `restaurant_members` e não como tabela nova; `is_restaurant_member` passa a excluí-lo para que as policies existentes não lhe abram dados de negócio. Sem selector de restaurante no frontend neste gate.
- 2026-09-07 (orquestrador): dia de serviço com corte às 06:00 no fuso do restaurante, alinhado com o corte usado para diferidos. Janela de um turno abre 60 minutos antes do `start_time` e fecha no `start_time` do turno seguinte do mesmo dia ou às 06:00 do dia seguinte.
- 2026-09-07 (orquestrador): modo offline é uma fila no cliente; o servidor aceita diferidos até às 06:00 do dia seguinte desde que `captured_at` esteja na janela. Depois disso o registo fica em falta, sem excepção.
- 2026-09-07 (orquestrador): recepções podem ser registadas até 7 dias depois de `delivered_on` (a guia chega muitas vezes depois da mercadoria); o carimbo `recorded_at` de servidor mostra o atraso no dossiê. Não é preenchimento retroactivo de temperatura, é registo documental.
- 2026-09-07 (orquestrador): relógio injectável `haccp_now()` para testes determinísticos; em produção devolve `now()`. É o único ponto onde o executor pode `create or replace` dentro de um teste.
- 2026-09-07 (orquestrador): fotografias com quota por tenant em MB verificada na policy de INSERT do storage; compressão é responsabilidade do cliente (Sprint 02).

## Blockers

Formato: item, motivo, o que precisa do David. O executor não improvisa alternativas; regista e segue.

Não houve bloqueios de scope: todos os itens foram implementados como especificado. Ficam registadas notas de execução para validação do orquestrador (não são desvios de scope, são pontos que só uma execução real de Postgres confirma):

- **pgTAP não executado nesta máquina.** Não há Postgres nem supabase CLI local. `supabase/tests/0014_haccp.sql` foi escrito de ponta a ponta com `plan(85)` e relógio controlado, mas os checkboxes de pgTAP estão marcados como escritos, com a execução/validação a cargo do orquestrador (`supabase test db`). Os gates de web (`pnpm typecheck`, `pnpm build`, `pnpm test` com 135 testes, todos verdes) foram executados e confirmam que `apps/web` não foi tocado.
- **`haccp_now()` sem revoke.** A spec (item 8) pede "sem grant a authenticated". Fica com o EXECUTE por defeito a PUBLIC (não revogado), porque é chamada por funções SECURITY INVOKER (`haccp_turn_window`, `haccp_service_date`, `haccp_expected_readings`) e pela vista `haccp_nc_status`, que correm como o caller — revogar partia essas chamadas. Não é segredo (devolve a hora). Documentado na migração.
- **Assinatura de `haccp_service_date`.** Implementada como `(uuid, timestamptz default null)` com `coalesce(p_at, haccp_now())` em vez de `default now()` literal, para o relógio injectável funcionar nos testes. Comportamento com argumento omitido é idêntico a `now()`.
- **Semente de `storage.objects` no pgTAP.** O fixture de purga insere um objecto em `storage.objects` (colunas `bucket_id`, `name`, `metadata`, `created_at`). Se o schema de storage do ambiente exigir outra coluna NOT NULL sem default, o orquestrador ajusta esse INSERT; não afecta a lógica da migração.
- **Erro esperado em "ponto de outro restaurante" (registos).** Via RPC como membro de A sobre um ponto de B, a RLS esconde o ponto e o RPC devolve `haccp_ponto_inexistente` (em vez de violação de RLS no INSERT). Continua a ser uma rejeição correcta; o teste aceita qualquer excepção nesse caso.
