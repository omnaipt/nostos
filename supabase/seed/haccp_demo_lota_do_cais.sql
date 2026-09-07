-- Semente de demonstração HACCP para a "Lota do Cais" (Sprint 03, item 6).
--
-- PORQUÊ EXISTE: as reuniões comerciais precisam de 45 dias de histórico HACCP
-- credível no tenant demo (slug `lota-do-cais-demo`). Segue o mesmo padrão da
-- semente de vendas (`historico_demo_lota_do_cais.sql`): datas RELATIVAS a
-- `current_date` e reprodutível (sem `random()`; a variabilidade vem de
-- `hashtext` sobre a chave da célula, portanto correr duas vezes dá o mesmo).
--
-- COMO CORRER: como `postgres`/service role (ignora RLS; os gatilhos correm na
-- mesma). Activa o modo semente `haccp.seed=on`, que respeita os carimbos
-- fornecidos (recorded_by/recorded_at/captured_at) e salta a validação de janela
-- (o histórico é passado). A regra "verificador diferente de quem registou" do
-- gatilho é validada MESMO em modo semente, por isso são precisos 2 membros.
--
-- IDEMPOTENTE: apaga antes os registos HACCP deste tenant (em modo `haccp.purge`,
-- que desbloqueia a imutabilidade) e reinsere. Os pontos de controlo e os
-- fornecedores não se apagam (são reutilizados por nome).
--
-- SÓ OBJECTOS DO CONTRATO: haccp_control_points, suppliers, haccp_temperature_readings,
-- haccp_receptions, haccp_rejections, haccp_nonconformities, haccp_nc_verifications.
--
-- TURNOS REAIS (verificados 07-09): "Almoço" 12:30 todos os dias, "Jantar" 19:30
-- todos os dias, "2º turno jantar" 21:30 só sexta e sábado. Os turn_id lêem-se
-- por restaurant_id + label; não se hardcodam.

do $$
declare
  v_rid uuid;
  v_owner uuid;
  v_second uuid;
  v_cp_frigo uuid; v_cp_arca uuid; v_cp_banho uuid; v_cp_expo uuid;
  v_turn_almoco uuid; v_turn_jantar uuid; v_turn_2 uuid;
  v_sup_lota uuid; v_sup_horta uuid;
  v_cp_ids uuid[]; v_centers numeric[];
  v_turn_ids uuid[]; v_turn_times time[];
  v_day date; v_dow int;
  ti int; pi int;
  v_turn uuid; v_ttime time; v_cp uuid; v_center numeric; v_val numeric;
  v_orig uuid; v_reading uuid; v_nc uuid; v_reception uuid;
  -- Dias especiais (relativos), todos distintos entre si.
  d_dev1 date := current_date - 40;   -- desvio com NC verificada (Frigorífico/Almoço)
  d_dev2 date := current_date - 3;    -- desvio com NC aberta há 60 h (Arca/Jantar)
  d_dev3 date := current_date - 20;   -- desvio sem resposta (Banho-maria/Almoço)
  d_defer date := current_date - 5;   -- registo diferido (Expositor/Almoço)
  d_rect  date := current_date - 10;  -- rectificação (Frigorífico/Almoço)
  d_miss_jantar date := current_date - 15;  -- Jantar em falta
  d_miss_almoco date := current_date - 25;  -- Almoço em falta
begin
  select id into v_rid from public.restaurants where slug = 'lota-do-cais-demo';
  if v_rid is null then
    raise exception 'Tenant lota-do-cais-demo não encontrado. Semente HACCP abortada.';
  end if;

  -- Membros: owner (primeiro) e um segundo, para as verificações de eficácia.
  select user_id into v_owner from public.restaurant_members
    where restaurant_id = v_rid order by (role = 'owner') desc, created_at limit 1;
  select user_id into v_second from public.restaurant_members
    where restaurant_id = v_rid and user_id <> v_owner order by created_at limit 1;
  if v_owner is null or v_second is null then
    raise exception 'A semente HACCP exige 2 membros no restaurante (owner + outro). Encontrado(s) insuficiente(s).';
  end if;

  perform set_config('haccp.seed', 'on', true);

  -- Idempotência: apagar os registos HACCP existentes deste tenant.
  perform set_config('haccp.purge', 'on', true);
  delete from public.haccp_nc_verifications where restaurant_id = v_rid;
  delete from public.haccp_nonconformities where restaurant_id = v_rid;
  delete from public.haccp_rejections where restaurant_id = v_rid;
  delete from public.haccp_receptions where restaurant_id = v_rid;
  delete from public.haccp_temperature_readings where restaurant_id = v_rid;
  perform set_config('haccp.purge', 'off', true);

  -- Turnos reais (por label).
  select id into v_turn_almoco from public.turns where restaurant_id = v_rid and label = 'Almoço' limit 1;
  select id into v_turn_jantar from public.turns where restaurant_id = v_rid and label = 'Jantar' limit 1;
  select id into v_turn_2 from public.turns where restaurant_id = v_rid and label = '2º turno jantar' limit 1;
  if v_turn_almoco is null or v_turn_jantar is null then
    raise exception 'Turnos Almoço/Jantar não encontrados no tenant demo. Semente HACCP abortada.';
  end if;

  -- Pontos de controlo (reutilizados por nome; created_at recuado para o
  -- histórico contar — haccp_expected_readings só conta pontos criados até ao
  -- dia de serviço).
  select id into v_cp_frigo from public.haccp_control_points where restaurant_id = v_rid and lower(name) = lower('Frigorífico peixe') limit 1;
  if v_cp_frigo is null then
    insert into public.haccp_control_points (restaurant_id, name, kind, all_turns, sort_order, created_by, created_at)
    values (v_rid, 'Frigorífico peixe', 'frio_positivo', true, 0, v_owner, current_date - 46) returning id into v_cp_frigo;
  end if;
  select id into v_cp_arca from public.haccp_control_points where restaurant_id = v_rid and lower(name) = lower('Arca congeladora') limit 1;
  if v_cp_arca is null then
    insert into public.haccp_control_points (restaurant_id, name, kind, all_turns, sort_order, created_by, created_at)
    values (v_rid, 'Arca congeladora', 'congelacao', true, 1, v_owner, current_date - 46) returning id into v_cp_arca;
  end if;
  select id into v_cp_banho from public.haccp_control_points where restaurant_id = v_rid and lower(name) = lower('Banho-maria') limit 1;
  if v_cp_banho is null then
    insert into public.haccp_control_points (restaurant_id, name, kind, all_turns, sort_order, created_by, created_at)
    values (v_rid, 'Banho-maria', 'quente', true, 2, v_owner, current_date - 46) returning id into v_cp_banho;
  end if;
  select id into v_cp_expo from public.haccp_control_points where restaurant_id = v_rid and lower(name) = lower('Expositor de sobremesas') limit 1;
  if v_cp_expo is null then
    insert into public.haccp_control_points (restaurant_id, name, kind, all_turns, sort_order, created_by, created_at)
    values (v_rid, 'Expositor de sobremesas', 'expositor', true, 3, v_owner, current_date - 46) returning id into v_cp_expo;
  end if;

  -- Fornecedores (reutilizados por nome).
  select id into v_sup_lota from public.suppliers where restaurant_id = v_rid and name_norm = lower('Lota de Cascais') limit 1;
  if v_sup_lota is null then
    insert into public.suppliers (restaurant_id, name, name_norm) values (v_rid, 'Lota de Cascais', 'lota de cascais') returning id into v_sup_lota;
  end if;
  select id into v_sup_horta from public.suppliers where restaurant_id = v_rid and name_norm = lower('Hortas do Saloio') limit 1;
  if v_sup_horta is null then
    insert into public.suppliers (restaurant_id, name, name_norm) values (v_rid, 'Hortas do Saloio', 'hortas do saloio') returning id into v_sup_horta;
  end if;

  v_cp_ids := array[v_cp_frigo, v_cp_arca, v_cp_banho, v_cp_expo];
  v_centers := array[2.5, -20.0, 68.0, 3.5];  -- centros plausíveis por tipo

  -- 45 dias de registos (até ontem; nenhum no dia actual).
  for v_day in select generate_series(current_date - 45, current_date - 1, interval '1 day')::date loop
    v_dow := extract(isodow from v_day)::int;  -- 1=Seg .. 7=Dom
    -- Turnos que correm neste dia: Almoço e Jantar sempre; 2º turno só sex/sáb.
    if v_dow in (5, 6) and v_turn_2 is not null then
      v_turn_ids := array[v_turn_almoco, v_turn_jantar, v_turn_2];
      v_turn_times := array[time '12:35', time '19:35', time '21:35'];
    else
      v_turn_ids := array[v_turn_almoco, v_turn_jantar];
      v_turn_times := array[time '12:35', time '19:35'];
    end if;

    for ti in 1 .. array_length(v_turn_ids, 1) loop
      v_turn := v_turn_ids[ti];
      v_ttime := v_turn_times[ti];
      -- Dias com um turno em falta (sem registos nesse turno).
      if v_turn = v_turn_jantar and v_day = d_miss_jantar then continue; end if;
      if v_turn = v_turn_almoco and v_day = d_miss_almoco then continue; end if;

      for pi in 1 .. 4 loop
        v_cp := v_cp_ids[pi];
        v_center := v_centers[pi];
        -- Células especiais inseridas explicitamente a seguir.
        if v_day = d_dev1 and v_turn = v_turn_almoco and v_cp = v_cp_frigo then continue; end if;
        if v_day = d_dev3 and v_turn = v_turn_almoco and v_cp = v_cp_banho then continue; end if;
        if v_day = d_defer and v_turn = v_turn_almoco and v_cp = v_cp_expo then continue; end if;
        if v_day = d_rect and v_turn = v_turn_almoco and v_cp = v_cp_frigo then continue; end if;
        if v_day = d_dev2 and v_turn = v_turn_jantar and v_cp = v_cp_arca then continue; end if;

        -- Variabilidade determinística ±0,8 °C (sem random).
        v_val := round(v_center + ((((hashtext(v_day::text || v_cp::text) % 17) + 17) % 17) - 8)::numeric / 10.0, 1);
        insert into public.haccp_temperature_readings
          (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_at, recorded_by)
        values
          (v_rid, v_cp, v_turn, v_day, v_val, 'online',
           (v_day + v_ttime + ((pi * 2) || ' minutes')::interval) at time zone 'Europe/Lisbon', v_owner);
      end loop;
    end loop;
  end loop;

  -- (1) Desvio com NC VERIFICADA: Frigorífico a 8,0 °C (limite 0 a 5).
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_at, recorded_by)
  values (v_rid, v_cp_frigo, v_turn_almoco, d_dev1, 8.0, 'online',
          (d_dev1 + time '12:36') at time zone 'Europe/Lisbon', v_owner)
  returning id into v_reading;
  insert into public.haccp_nonconformities
    (restaurant_id, source, reading_id, description, measured_value, limit_text,
     product_disposition, immediate_action, root_cause_action, executed_by_name,
     recorded_by, recorded_at, occurred_at)
  values (v_rid, 'temperature', v_reading,
          'Frigorífico do peixe a 8 °C na abertura do almoço.',
          '8,0 °C', '0 a 5 °C',
          'Transferido para outro equipamento',
          'Peixe passado para a câmara em bom estado; equipamento ligado ao máximo.',
          'Assistência ao termóstato agendada; verificação de temperatura reforçada.',
          'Encarregado de cozinha', v_owner,
          (d_dev1 + time '12:50') at time zone 'Europe/Lisbon',
          (d_dev1 + time '12:36') at time zone 'Europe/Lisbon')
  returning id into v_nc;
  insert into public.haccp_nc_verifications
    (restaurant_id, nonconformity_id, effective, note, verified_by, verified_at)
  values (v_rid, v_nc, true, 'Temperatura estável a 3 °C nas 48 h seguintes.',
          v_second, ((d_dev1 + 2) + time '10:00') at time zone 'Europe/Lisbon');

  -- (2) Desvio com NC ABERTA há 60 h: Arca a -12,0 °C (limite máximo -18).
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_at, recorded_by)
  values (v_rid, v_cp_arca, v_turn_jantar, d_dev2, -12.0, 'online',
          (d_dev2 + time '19:36') at time zone 'Europe/Lisbon', v_owner)
  returning id into v_reading;
  insert into public.haccp_nonconformities
    (restaurant_id, source, reading_id, description, measured_value, limit_text,
     product_disposition, immediate_action, root_cause_action, executed_by_name,
     recorded_by, recorded_at, occurred_at)
  values (v_rid, 'temperature', v_reading,
          'Arca congeladora a -12 °C no jantar.',
          '-12,0 °C', '≤ -18 °C',
          'Reprocessado (cozinhado a ≥ 75 °C)',
          'Produto mais crítico cozinhado de imediato; restante em vigilância.',
          'Descongelação da arca e revisão da vedação da porta.',
          'Chefe de turno', v_owner,
          now() - interval '60 hours', now() - interval '60 hours');

  -- (3) Desvio SEM RESPOSTA: Banho-maria a 55 °C (limite mínimo 63), sem NC.
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_at, recorded_by)
  values (v_rid, v_cp_banho, v_turn_almoco, d_dev3, 55.0, 'online',
          (d_dev3 + time '12:37') at time zone 'Europe/Lisbon', v_owner);

  -- Registo DIFERIDO: Expositor, captado às 12:33 e recebido às 12:52.
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, captured_at, recorded_at, recorded_by)
  values (v_rid, v_cp_expo, v_turn_almoco, d_defer, 3.4, 'deferred',
          (d_defer + time '12:33') at time zone 'Europe/Lisbon',
          (d_defer + time '12:52') at time zone 'Europe/Lisbon', v_owner);

  -- RECTIFICAÇÃO: leitura original 4,0 corrigida para 3,5 (Frigorífico/Almoço).
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_at, recorded_by)
  values (v_rid, v_cp_frigo, v_turn_almoco, d_rect, 4.0, 'online',
          (d_rect + time '12:35') at time zone 'Europe/Lisbon', v_owner)
  returning id into v_orig;
  insert into public.haccp_temperature_readings
    (restaurant_id, control_point_id, turn_id, service_date, value_c, sync_mode, recorded_at, recorded_by, rectifies_id, note)
  values (v_rid, v_cp_frigo, v_turn_almoco, d_rect, 3.5, 'online',
          (d_rect + time '12:45') at time zone 'Europe/Lisbon', v_owner, v_orig,
          'Erro de leitura no mostrador; valor real confirmado com termómetro de sonda.');

  -- 6 RECEPÇÕES (uma recusada por temperatura insuficiente, com NC).
  -- Conformes:
  insert into public.haccp_receptions
    (restaurant_id, supplier_id, delivered_on, service_date, temperature_applicable, temperature_c, expiry_ok, packaging_ok, conforming, note, recorded_by, recorded_at)
  values
    (v_rid, v_sup_lota, current_date - 2, current_date - 2, true, 2.0, true, true, true, 'Peixe fresco em gelo.', v_owner, ((current_date - 2) + time '09:40') at time zone 'Europe/Lisbon'),
    (v_rid, v_sup_horta, current_date - 12, current_date - 12, false, null, true, true, true, 'Hortícolas.', v_owner, ((current_date - 12) + time '08:30') at time zone 'Europe/Lisbon'),
    (v_rid, v_sup_lota, current_date - 18, current_date - 18, true, 3.0, true, true, true, 'Marisco vivo.', v_owner, ((current_date - 18) + time '09:10') at time zone 'Europe/Lisbon'),
    (v_rid, v_sup_horta, current_date - 30, current_date - 30, false, null, true, true, true, 'Fruta da época.', v_owner, ((current_date - 30) + time '08:50') at time zone 'Europe/Lisbon'),
    (v_rid, v_sup_lota, current_date - 38, current_date - 38, true, 1.5, true, true, true, 'Peixe fresco.', v_owner, ((current_date - 38) + time '09:20') at time zone 'Europe/Lisbon');

  -- Recusada (temperatura insuficiente):
  insert into public.haccp_receptions
    (restaurant_id, supplier_id, delivered_on, service_date, temperature_applicable, temperature_c, expiry_ok, packaging_ok, conforming, note, recorded_by, recorded_at)
  values (v_rid, v_sup_lota, current_date - 8, current_date - 8, true, 9.0, true, true, false,
          'Peixe entregue a 9 °C; cadeia de frio comprometida.', v_owner,
          ((current_date - 8) + time '09:15') at time zone 'Europe/Lisbon')
  returning id into v_reception;
  insert into public.haccp_rejections
    (restaurant_id, reception_id, cause, quantity_text, description, recorded_by, recorded_at)
  values (v_rid, v_reception, 'temperatura_insuficiente', '12 kg',
          'Lote devolvido ao fornecedor por temperatura acima do limite.', v_owner,
          ((current_date - 8) + time '09:18') at time zone 'Europe/Lisbon');
  insert into public.haccp_nonconformities
    (restaurant_id, source, reception_id, description, measured_value, limit_text,
     product_disposition, immediate_action, root_cause_action, executed_by_name,
     recorded_by, recorded_at, occurred_at)
  values (v_rid, 'reception', v_reception,
          'Peixe recebido a 9 °C, acima do limite de recepção.',
          '9,0 °C', '≤ 4 °C',
          'Rejeitado/eliminado',
          'Recusada a entrega e devolvido ao fornecedor.',
          'Registada não conformidade ao fornecedor; exigido transporte refrigerado.',
          'Encarregado de compras', v_owner,
          ((current_date - 8) + time '09:20') at time zone 'Europe/Lisbon',
          ((current_date - 8) + time '09:15') at time zone 'Europe/Lisbon');

  perform set_config('haccp.seed', 'off', true);
  raise notice 'Semente HACCP da Lota do Cais aplicada com sucesso.';
end $$;
