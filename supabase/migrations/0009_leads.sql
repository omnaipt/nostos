-- 0009 — Leads founding (S4). A landing pública em nostos.pt captura pedidos
-- de demonstração para leads. Anónimo só ESCREVE via RPC de superfície mínima
-- (validações + limite anti-abuso); ninguém lê via API (RLS on, zero policies)
-- — a leitura é interna (David/agentes via SQL) até existir backoffice OMNAI.

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  restaurant_name text not null,
  phone           text,
  email           text,
  message         text,
  source          text not null default 'landing',
  status          text not null default 'novo' check (status in ('novo','contactado','demo_marcada','fechado','descartado')),
  created_at      timestamptz not null default now()
);
create index if not exists leads_created_idx on public.leads(created_at);

alter table public.leads enable row level security;
-- Sem policies: nem anon nem authenticated leem/escrevem directamente.

create or replace function public.public_create_lead(
  p_name text,
  p_restaurant_name text,
  p_phone text,
  p_email text,
  p_message text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_rest text := trim(coalesce(p_restaurant_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_id uuid;
begin
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'nome_invalido';
  end if;
  if length(v_rest) < 2 or length(v_rest) > 160 then
    raise exception 'restaurante_invalido';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'contacto_em_falta';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'email_invalido';
  end if;
  if v_phone is not null and length(v_phone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if v_msg is not null and length(v_msg) > 1000 then
    v_msg := left(v_msg, 1000);
  end if;

  -- Anti-abuso: máx. 3 pedidos por contacto (email OU telefone) por dia.
  if (select count(*) from public.leads l
       where l.created_at >= now() - interval '24 hours'
         and ((v_email is not null and l.email = v_email)
           or (v_phone is not null and l.phone = v_phone))) >= 3 then
    raise exception 'limite_pedidos';
  end if;

  insert into public.leads (name, restaurant_name, phone, email, message)
  values (v_name, v_rest, v_phone, v_email, v_msg)
  returning id into v_id;
  return v_id;
end $$;
