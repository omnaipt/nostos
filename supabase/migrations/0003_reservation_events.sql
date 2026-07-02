-- 0003 — G1 (Spec v2): instrumentação da atribuição e do ciclo de vida.
-- Log imutável escrito EXCLUSIVAMENTE por triggers (função security definer);
-- clientes só têm SELECT por tenant. Alimenta o flip manual->auto (Fase 2)
-- e a previsão de procura (Camada 4).
create table public.reservation_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  event_type text not null check (event_type in
    ('criada','mesa_atribuida','mesa_alterada','confirmada','sentada','no_show','cancelada')),
  actor text not null check (actor in ('staff','publico')),
  table_id uuid references public.tables(id) on delete set null,
  created_at timestamptz not null default now()
);

create index reservation_events_restaurant_created_idx
  on public.reservation_events (restaurant_id, created_at);
create index reservation_events_reservation_idx
  on public.reservation_events (reservation_id);

alter table public.reservation_events enable row level security;

create policy reservation_events_member_select on public.reservation_events
  for select using (public.is_restaurant_member(restaurant_id));
-- Sem policies de insert/update/delete: log imutável, só os triggers escrevem.

create or replace function public.log_reservation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := case when auth.uid() is null then 'publico' else 'staff' end;
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_events (restaurant_id, reservation_id, event_type, actor, table_id)
    values (new.restaurant_id, new.id, 'criada', v_actor, new.table_id);
    return new;
  end if;

  if new.table_id is distinct from old.table_id then
    insert into public.reservation_events (restaurant_id, reservation_id, event_type, actor, table_id)
    values (new.restaurant_id, new.id,
      case when old.table_id is null then 'mesa_atribuida' else 'mesa_alterada' end,
      v_actor, new.table_id);
  end if;

  if new.status is distinct from old.status
     and new.status in ('confirmada','sentada','no_show','cancelada') then
    insert into public.reservation_events (restaurant_id, reservation_id, event_type, actor, table_id)
    values (new.restaurant_id, new.id, new.status, v_actor, new.table_id);
  end if;

  return new;
end;
$$;

create trigger reservations_log_insert
  after insert on public.reservations
  for each row execute function public.log_reservation_event();
create trigger reservations_log_update
  after update on public.reservations
  for each row execute function public.log_reservation_event();
