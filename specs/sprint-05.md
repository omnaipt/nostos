# Sprint 05: Stock S2, consumo interno, modo de consumo e abate estimado

Projecto: Nostos Rest (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-stock2` (worktree, branch `feat/stock-s2` de `origin/main` d4a34d4) | Data: 2026-11-14
Estado: planeado

Spec de produto de origem: "Spec Nostos Rest: camada de stock" (Claude Docs, peça 2), decisões do David de 13-11. Depende do Sprint 04 (migração 0032, em produção desde 14-11). Contrato do sprint anterior: `docs/specs/stock-s1-contract.md`.

## Objectivo

A refeição do pessoal, a oferta da casa e o prato estragado passam a sair do stock pelo que realmente gastam, registados pela cozinha em poucos toques e separados das quebras nos relatórios. Ingredientes sem ficha (azeite de mesa, guardanapos, sal) deixam de ser abatidos por vendas. Todo o abate feito com uma ficha técnica por validar fica marcado como estimado, e o dono vê primeiro as fichas que mais pesam no stock.

## Fora de scope

- Sessões de contagem, parciais, densidade, relatório de desvio e o tipo de movimento `count_consumption` (Sprint 06). O modo `contagem` deste sprint só impede o abate por vendas; o apuramento do consumo por contagem é do Sprint 06.
- Integração com ZS Rest ou WinRest, alergénios, pedido à mesa.
- Aplicar a migração em produção, correr `supabase` contra o projecto remoto, deploy de edge functions, `vercel`, `git push`. Tudo isto é do orquestrador depois do gate.
- Alterar o prompt ou o modelo das edge functions de IA.
- Tocar em dados de tenants existentes.

## Convenções deste repo que se aplicam

- Migração nova: `supabase/migrations/0033_stock_consumo_interno.sql`. Teste pgTAP novo: `supabase/tests/0016_stock_consumo_interno.sql`, no estilo de `0015_stock_formatos.sql`.
- Perfis: `public.member_role(restaurant_id)` devolve `owner`, `gestor`, `balcao`, `cozinha` ou `consultor` (0021). Padrão de uso nas policies e RPCs da 0029.
- Conversão de unidades: `public.unit_factor(de, para, peso_medio)` da 0032 e `unitFactor` em `apps/web/src/lib/types.ts`. Não duplicar a regra.
- Multi-tenant, `comment on`, grants e revogações como no sprint 04. Comentários e textos de interface em português, sem travessão.
- Tipos: acrescentar à mão em `database.types.ts`; o orquestrador regenera depois de aplicar.
- Antes de recriar uma função SQL existente, partir da definição em vigor (a da 0032 para `stock_movement_guard`; a da 0016 para `stock_movement_apply` e `stock_movement_revert`) e registar em Decisões qualquer diferença intencional.
- Verificação local: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verdes. Sem Postgres local: o pgTAP é escrito pelo executor e corrido pelo orquestrador.

## Itens

### 1. Migração 0033: tipos de movimento, motivo, abate estimado e modo de consumo

- [x] `stock_movements.kind` aceita `internal_use` (sempre negativo); a restrição de coerência de sinal é actualizada sem afectar os tipos existentes.
- [x] `stock_movements.reason text` opcional com valores `pessoal`, `oferta`, `prova`, `outro`; obrigatório quando `kind` é `internal_use`; permitido em `waste`; nulo nos restantes tipos.
- [x] `stock_movements.estimated boolean not null default false`.
- [x] `ingredients.depletion_mode text not null default 'ficha'` com valores `ficha` e `contagem`, com `comment on`.
- [x] Guarda: um movimento `sale_depletion` ou `internal_use` num ingrediente em modo `contagem` é rejeitado com a excepção `ingrediente_consumido_por_contagem`.
- [x] Guarda de perfil: quando há utilizador autenticado (`auth.uid()` não nulo), movimentos `internal_use` e `waste` só são aceites para `owner`, `gestor` ou `cozinha`; `balcao` e `consultor` são rejeitados com `perfil_sem_permissao`. Chamadas sem utilizador (edge functions com service role) não são afectadas.

Evidência exigida: pgTAP com cada regra, incluindo um caso por perfil.

### 2. RPC de consumo por prato

- [x] `public.register_dish_consumption(p_restaurant_id uuid, p_menu_item_id uuid, p_portions numeric, p_kind text, p_reason text, p_note text) returns jsonb`, SECURITY INVOKER, `p_kind` em `internal_use` ou `waste`, `p_portions > 0`.
- [x] Expande a ficha técnica do prato: por cada linha ligada a um ingrediente, gera um movimento com quantidade `-(p_portions × linha.qty ÷ servings)` convertida pela `unit_factor` para a unidade do ingrediente, com `estimated = (ficha.status = 'rascunho')`, o motivo e a nota.
- [x] Linhas livres, linhas sem conversão possível e ingredientes em modo `contagem` não geram movimento e voltam listadas no resultado (`nao_abatidas`, com o motivo de cada uma).
- [x] Prato sem ficha técnica: erro `prato_sem_ficha`, nada gravado. Tudo numa transacção: ou entram todos os movimentos válidos, ou nenhum se houver erro.
- [x] Grants: `authenticated` sim; `anon` e `public` não.

Evidência exigida: pgTAP com ficha de 3 ingredientes e 6 doses (quantidades exactas), ficha em rascunho (movimentos estimados), ficha com uma linha livre e um ingrediente em modo `contagem` (dois em `nao_abatidas`), prato sem ficha (nada gravado), perfil `balcao` rejeitado.

### 3. Edge `import-saft`: abate estimado e modo de consumo

- [x] Os movimentos `sale_depletion` levam `estimated = true` quando a ficha do prato está em `rascunho`.
- [x] Ingredientes em modo `contagem` não são abatidos; aparecem no resumo da importação numa lista própria (`consumoPorContagem`), ao lado do `unitMismatch` existente.
- [x] A idempotência por documento (`lineNumber`, migração 0030) e a conversão de unidades (sprint 04) ficam intactas.

Evidência exigida: testes unitários da lógica extraída, se a função o permitir; senão, diff restrito e descrito em `TESTING.md`.

### 4. Interface

- [x] Registar consumo interno: acção acessível a `owner`, `gestor` e `cozinha` (na Despensa ou nas Entradas, onde o padrão do repo o tornar mais natural), com dois modos: por prato (prato, doses, motivo, nota) e por ingrediente solto (ingrediente, quantidade, motivo, nota). Por prato, mostra antes de gravar o que vai sair e o que não vai ser abatido.
- [x] O mesmo formulário permite registar uma quebra de prato inteiro (`waste` por prato).
- [x] Lista de movimentos filtrável por tipo, com consumo interno e quebras distinguíveis. O total mensal do consumo interno em euros (ao custo médio) só aparece ao `owner`.
- [x] No ingrediente, campo "Modo de consumo" (pela ficha técnica, ou apurado na contagem), com uma frase de ajuda.
- [x] Fila "Fichas por validar": fichas em `rascunho`, ordenadas pelas unidades vendidas do prato nos últimos 90 dias (a partir de `saft_import_lines` com estado `matched`), com acesso directo à ficha. Visível a `owner` e `gestor`, no ecrã onde hoje se gerem fichas ou margens.
- [x] Movimentos estimados aparecem marcados como tal onde a lista de movimentos é mostrada.

Evidência exigida: testes de componente ou de hook para a pré-visualização do consumo por prato e para a ordenação da fila; passos manuais em `TESTING.md`.

### 5. Reserva do sprint 04

- [x] No pgTAP deste sprint, um teste explícito: depois de uma entrada por embalagens (sprint 04), `ingredients.cost_per_unit_cents` e `ingredient_avg_cost` do ingrediente têm o valor esperado por unidade base.

### 6. Fecho

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verdes, com o output resumido na secção Evidência.
- [ ] `supabase/tests/0016_stock_consumo_interno.sql` escrito, com `plan(N)` coerente.
- [ ] Contrato `docs/specs/stock-s2-contract.md`.
- [ ] Secção deste sprint em `TESTING.md`, com testes manuais numerados.
- [ ] Commits pequenos por item, mensagens em português começadas por `stock s2:`.

## Decisões

- 13-11-2026 (David): ficha em `rascunho` abate stock, marcada como estimada.
- 13-11-2026 (David): a cozinha regista consumo interno e quebras; o total mensal em euros fica visível só para o dono.
- 14-11-2026 (David): gate do sprint 04 dado com "avança"; a bateria de testes manuais grande é feita depois, sobre os sprints 04 a 06 juntos.
- 14-11-2026 (orquestrador): a migração é a 0033 (0031 é das tentativas de login, 0032 do stock S1, ambas em produção).

## Blockers

<Preenchido pelo executor. Formato: item, motivo, o que precisa do David.>

## Evidência

<Preenchido pelo executor no item 6.>
