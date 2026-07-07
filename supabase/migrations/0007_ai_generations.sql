-- 0007 — Log de gerações de ficha técnica por IA. Duplo propósito:
-- 1) rate limit por restaurante/dia (aplicado na edge function),
-- 2) monitorização de consumo da API (tokens por geração, custo agregável).
-- Escrita EXCLUSIVA da edge function (service role, bypassa RLS).
-- Leitura: membros do restaurante (para mostrar quota/consumo no futuro).

create table if not exists public.ai_generations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid,
  dish_name     text not null,
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz not null default now()
);
create index if not exists ai_generations_restaurant_day_idx
  on public.ai_generations(restaurant_id, created_at);

alter table public.ai_generations enable row level security;

-- Só leitura para membros; sem policies de escrita (service role escreve).
create policy ai_generations_member_select on public.ai_generations
  for select using (public.is_restaurant_member(restaurant_id));
