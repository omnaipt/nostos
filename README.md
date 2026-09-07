# STOA

SaaS de gestão para restaurantes (primeira vertical do STOA, OMNAI).
Starter extraído da arquitetura do Palaestra: monorepo pnpm + Turborepo,
web em Vite + React + TypeScript + Tailwind/shadcn, backend Supabase
(Postgres, Auth, RLS multi-tenant).

## Estrutura

```
apps/web            SPA Vite + React (painel do restaurante)
supabase/           config, migrations (esquema multi-tenant), seed
packages/           (reservado para código partilhado futuro)
```

## Arranque local

1. Criar projeto Supabase do STOA e aplicar `supabase/migrations/0001_init.sql`.
2. `cp apps/web/.env.example apps/web/.env.local` e preencher URL + anon key.
3. `pnpm install`
4. `pnpm dev` (web em http://localhost:8080)

## Estado

Esqueleto inicial: auth (email/password), rota protegida, dashboard,
lista de reservas a ler do Supabase. Falta: criação/edição de reservas,
fichas de cliente, notificações, onboarding do restaurante. Ver issues.

## HACCP: semente de demonstração

`supabase/seed/haccp_demo_lota_do_cais.sql` cria 45 dias de histórico HACCP
credível no tenant demo (`lota-do-cais-demo`): pontos de controlo, fornecedores,
registos de temperatura, desvios com e sem não conformidade, recepções e uma
recusa. É idempotente (apaga os registos HACCP do tenant e reinsere) e usa datas
relativas a `current_date`, por isso deve correr antes de cada demonstração para
os dados não envelhecerem. O tenant tem de ter 2 membros (owner + outro), senão
a semente aborta com mensagem clara.

Correr como `postgres`/service role (ignora RLS; o modo `haccp.seed` respeita os
carimbos e salta a validação de janela):

```
psql "$SUPABASE_DB_URL" -f supabase/seed/haccp_demo_lota_do_cais.sql
```

## Multi-tenancy

Cada restaurante é um tenant isolado por RLS (`restaurant_members` + função
`is_restaurant_member`). A coluna `restaurants.vertical` fica preparada para
futuras verticais sem reescrever o esquema.
