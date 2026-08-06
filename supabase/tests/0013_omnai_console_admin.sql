-- ============================================================================
-- OMNAI Console · Bloco 3 (Nostos) · Testes de aceitação (camada DB)
-- Corre dentro de BEGIN ... ROLLBACK: NÃO deixa resíduo em produção.
-- Valida derivações da view, constraints e imutabilidade do audit log.
-- (A camada HTTP/HMAC das edge functions testa-se com o smoke-test pós-deploy.)
-- ============================================================================
begin;

do $$
declare
  v_owner uuid;
  v_tid   uuid;
  v_eff   int;
  v_over  boolean;
  v_ok    boolean;
begin
  -- owner real existente (profiles.id e restaurants.owner_id têm FK a auth.users;
  -- o rollback limpa o tenant de QA criado abaixo).
  select id into v_owner from public.profiles limit 1;
  assert v_owner is not null, 'sem utilizador para QA';

  -- 1) PROVISIONAR: tenant trial com plano founding
  insert into public.restaurants (name, owner_id, plan_code, status, trial_ends_at)
  values ('QA Tenant', v_owner, 'founding', 'trial', current_date + 14)
  returning id into v_tid;

  -- Preço efectivo = intro founding (49€) porque created_at = now() < 12 meses
  select effective_price_cents into v_eff from public.admin_tenant_overview where id = v_tid;
  assert v_eff = 4900, format('intro founding esperado 4900, veio %s', v_eff);

  -- 2) MUDAR ESTADO: trial → active
  update public.restaurants set status = 'active' where id = v_tid;
  select status = 'active' into v_ok from public.restaurants where id = v_tid;
  assert v_ok, 'estado active nao aplicado';

  -- 3a) PRICING intro: continua 4900 em active
  select effective_price_cents into v_eff from public.admin_tenant_overview where id = v_tid;
  assert v_eff = 4900, format('active deve manter intro 4900, veio %s', v_eff);

  -- 3b) PRICING override: 3900 estratégico sem validade → override manda
  update public.restaurants
     set price_override_cents = 3900, override_reason_code = 'estrategico',
         override_reason_note = 'piloto fundador'
   where id = v_tid;
  select effective_price_cents, override_reason into v_eff, v_ok
    from public.admin_tenant_overview where id = v_tid;
  assert v_eff = 3900, format('override esperado 3900, veio %s', v_eff);

  -- 3c) override expirado → volta ao intro (4900)
  update public.restaurants set override_until = current_date - 1 where id = v_tid;
  select effective_price_cents into v_eff from public.admin_tenant_overview where id = v_tid;
  assert v_eff = 4900, format('override expirado deve voltar a intro 4900, veio %s', v_eff);

  -- constraint: override sem motivo tem de falhar
  begin
    update public.restaurants
       set price_override_cents = 1000, override_reason_code = null, override_until = null
     where id = v_tid;
    assert false, 'override sem motivo devia ter falhado';
  exception when check_violation then null;
  end;
  -- repor estado consistente
  update public.restaurants
     set price_override_cents = null, override_reason_code = null,
         override_reason_note = null, override_until = null
   where id = v_tid;

  -- 3d) ÂNCORA DO INTRO: activated_at há 13 meses → intro expirado → base (7900)
  update public.restaurants
     set activated_at = now() - interval '13 months' where id = v_tid;
  select effective_price_cents into v_eff from public.admin_tenant_overview where id = v_tid;
  assert v_eff = 7900, format('intro expirado por activated_at deve dar base 7900, veio %s', v_eff);
  -- activated_at recente → volta ao intro
  update public.restaurants set activated_at = now() where id = v_tid;
  select effective_price_cents into v_eff from public.admin_tenant_overview where id = v_tid;
  assert v_eff = 4900, format('activated_at recente deve dar intro 4900, veio %s', v_eff);

  -- 3e) is_demo exposto e default false
  select is_demo into v_ok from public.admin_tenant_overview where id = v_tid;
  assert v_ok = false, 'is_demo default devia ser false';

  -- 4) PAGAMENTO: paid_until no passado + active → is_overdue
  update public.restaurants set paid_until = current_date - 5 where id = v_tid;
  select is_overdue into v_over from public.admin_tenant_overview where id = v_tid;
  assert v_over, 'is_overdue devia ser true (active + paid_until no passado)';

  update public.restaurants set paid_until = current_date + 30 where id = v_tid;
  select is_overdue into v_over from public.admin_tenant_overview where id = v_tid;
  assert not v_over, 'is_overdue devia ser false (pago no futuro)';

  -- 5) AUDIT: insert ok, update/delete bloqueados (imutável)
  insert into public.admin_audit_log (actor_email, action, tenant_id, payload)
  values ('qa@omnai.pt', 'set_pricing', v_tid, '{"price_cents":3900}'::jsonb);

  begin
    update public.admin_audit_log set action = 'x' where tenant_id = v_tid;
    assert false, 'update no audit log devia ter falhado';
  exception when others then null;
  end;
  begin
    delete from public.admin_audit_log where tenant_id = v_tid;
    assert false, 'delete no audit log devia ter falhado';
  exception when others then null;
  end;

  raise notice 'ACEITACAO OK: provisionar, estado, pricing intro/override, pagamento, audit imutavel';
end $$;

rollback;
