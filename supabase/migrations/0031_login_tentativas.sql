-- Limite de tentativas de entrada falhadas por conta (regra comum Nostos, 14-11-2026): à 5.ª falha em 15 minutos a
-- conta fica bloqueada 15 minutos no formulário de entrada. O email guarda-se só como hash SHA-256.
-- Limitação conhecida: protege o formulário da aplicação; quem chamar o Supabase Auth diretamente não passa por aqui
-- (só um CAPTCHA aplicado pelo Supabase, ou o hook de verificação do plano Team, fecham esse caminho).
create table if not exists public.login_tentativas (
  email_hash text primary key,
  falhas int not null default 0,
  primeira_em timestamptz not null default now(),
  bloqueado_ate timestamptz
);
alter table public.login_tentativas enable row level security;
revoke all on public.login_tentativas from anon, authenticated;

create or replace function public.login_hash(p_email text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(lower(trim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;
revoke execute on function public.login_hash(text) from public, anon, authenticated;

-- Minutos de bloqueio que faltam (0 = pode tentar).
create or replace function public.login_estado(p_email text) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select greatest(0, ceil(extract(epoch from (t.bloqueado_ate - now())) / 60))::int
                   from public.login_tentativas t where t.email_hash = public.login_hash(p_email)), 0)
$$;

-- Regista uma falha; devolve os minutos de bloqueio (0 se ainda não bloqueou).
create or replace function public.login_falhou(p_email text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_h text := public.login_hash(p_email); v_t public.login_tentativas%rowtype;
begin
  if coalesce(trim(p_email), '') = '' then return 0; end if;
  delete from public.login_tentativas where coalesce(bloqueado_ate, primeira_em) < now() - interval '1 day';
  select * into v_t from public.login_tentativas where email_hash = v_h for update;
  if not found then
    insert into public.login_tentativas (email_hash, falhas) values (v_h, 1);
    return 0;
  end if;
  if v_t.bloqueado_ate is not null and v_t.bloqueado_ate > now() then
    return ceil(extract(epoch from (v_t.bloqueado_ate - now())) / 60)::int;
  end if;
  if v_t.primeira_em < now() - interval '15 minutes' or v_t.bloqueado_ate is not null then
    update public.login_tentativas set falhas = 1, primeira_em = now(), bloqueado_ate = null where email_hash = v_h;
    return 0;
  end if;
  if v_t.falhas + 1 >= 5 then
    update public.login_tentativas set falhas = 0, bloqueado_ate = now() + interval '15 minutes' where email_hash = v_h;
    return 15;
  end if;
  update public.login_tentativas set falhas = falhas + 1 where email_hash = v_h;
  return 0;
end $$;

-- Entrada bem-sucedida: limpa o contador da própria conta (só com sessão).
create or replace function public.login_ok() returns void
language sql security definer set search_path = '' as $$
  delete from public.login_tentativas where email_hash = public.login_hash(auth.email())
    and (bloqueado_ate is null or bloqueado_ate <= now())
$$;

revoke execute on function public.login_estado(text), public.login_falhou(text), public.login_ok() from public;
revoke execute on function public.login_ok() from anon;
grant execute on function public.login_estado(text), public.login_falhou(text) to anon, authenticated;
grant execute on function public.login_ok() to authenticated;
