-- 0024 — Endurecimento apontado pela auditoria de segurança da Supabase (30-07).
--
-- Funções de GATILHO estavam executáveis por `anon` e `authenticated`, porque o
-- Postgres concede EXECUTE a PUBLIC por omissão. Na prática não são
-- exploráveis (uma função que devolve `trigger` rebenta se for chamada
-- directamente), mas não têm de estar expostas na API e apareciam como aviso em
-- qualquer auditoria que um cliente peça. Fechadas.
--
-- NÃO se mexe em is_restaurant_member nem em is_restaurant_owner: são chamadas
-- DE DENTRO das policies de RLS, que são avaliadas com os privilégios de quem
-- consulta. Revogar EXECUTE partiria o acesso de toda a gente a tudo. Ficam
-- expostas de propósito, e são inofensivas: só respondem sobre o próprio
-- auth.uid() do chamador.
--
-- Verificado depois de aplicar: reserva pública criada e apagada, e fluxo de
-- convite completo (que depende do gatilho handle_new_user) continuam a
-- funcionar.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_reservation_event() from public, anon, authenticated;
revoke execute on function public.set_restaurant_slug() from public, anon, authenticated;
revoke execute on function public.order_item_tenant_guard() from public, anon, authenticated;
revoke execute on function public.protect_last_owner() from public, anon, authenticated;
revoke execute on function public.supplier_alias_tenant_guard() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

comment on function public.is_restaurant_member(uuid) is
  'Predicado usado dentro das policies de RLS. EXECUTE tem de continuar aberto a authenticated, senão as policies falham. Só revela pertença do próprio auth.uid().';
comment on function public.is_restaurant_owner(uuid) is
  'Idem is_restaurant_member, para as escritas owner-only em restaurant_members.';
