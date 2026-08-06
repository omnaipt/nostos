-- ============================================================================
-- OMNAI Console · Bloco 3 (Nostos) · Migration 02: backfill dos tenants actuais
-- APLICAR SÓ APÓS 01_schema.sql. Decisão David 06-08:
--   - Restaurante Saloio  = PILOTO REAL   → founding / active, activated_at 1-Set-2026
--   - Lota do Cais        = DEMO          → is_demo=true, active (sem plano), fora dos totais
-- ============================================================================

-- Piloto real: Saloio. Intro founding (49€) conta a partir do início comercial.
update public.restaurants
   set status       = 'active',
       plan_code    = 'founding',
       activated_at = timestamptz '2026-09-01 00:00:00+01'  -- início comercial (WEST)
 where id = '0555919d-f498-425f-a6bb-ba803fc2f050';  -- Restaurante Saloio

-- Demo: Lota do Cais. Fica activa para a demo funcionar, marcada is_demo para a
-- consola a excluir dos totais/receita teórica (OQ4). Sem plano comercial.
update public.restaurants
   set status  = 'active',
       is_demo = true
 where id = 'e0ad9e9b-4aae-4eb4-b688-1263976581d4';  -- Lota do Cais

-- Estado esperado após backfill:
--   Saloio: effective_price_cents = 4900 (intro founding até 2027-09-01), is_demo=false
--   Lota:   plan_code null → effective null, is_demo=true (excluída dos totais)
-- paid_until fica null nos dois → is_overdue=false. Registar pagamento do Saloio
-- via admin-record-payment quando o David souber a data.
