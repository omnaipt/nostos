# CLAUDE.md — stoa

Constituição do repositório STOA. Lida antes de qualquer alteração de código.

## Produto
STOA é o SaaS vertical da OMNAI para microempresas locais. Este repo é a
primeira vertical: Restaurantes (gestão de reservas, clientes, notificações).
Arquitetura espelhada do Palaestra (repo `palextra`).

## Stack
- Monorepo: pnpm workspace + Turborepo
- Web: Vite + React 19 + TypeScript estrito + Tailwind + shadcn/ui + TanStack Query + react-hook-form + zod
- Backend: Supabase (Postgres, Auth, RLS multi-tenant, edge functions)
- Deploy: Vercel, domínio stoa.pt

## Regras rígidas
- Multi-tenant sempre: toda a query a dados de negócio passa por RLS por restaurante. Nunca confiar no cliente para filtrar tenant.
- TypeScript estrito. Sem `any` salvo adaptadores de terceiros justificados.
- Validar dados na fronteira (forms, params) com zod antes de usar.
- Sem valores hardcoded de cor/espaçamento: usar tokens do Tailwind/CSS vars.
- Alterações a auth, schema de produção ou pagamentos passam por revisão do David.
- Componentes em /components, dados/integrações em /lib e /integrations, rotas em /pages.

## Migrations
Toda a mudança de schema é uma migration versionada em supabase/migrations.
Branch de desenvolvimento primeiro, produção depois.
