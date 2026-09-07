# HACCP: anti-métrica de registos em bloco

Como a OMNAI lê `haccp_burst_check` por tenant, a partir do OMNAI Console, no
futuro. Este documento é só a receita de leitura; não se constrói nada no
Console neste sprint.

## O que a métrica mede

Um "registo em bloco" é um grupo de 3 ou mais registos de temperatura do mesmo
utilizador dentro de uma janela de 2 minutos (usa `haccp_temperature_readings.recorded_at`,
o carimbo de servidor, não o relógio do telemóvel). É o sinal clássico de
preenchimento retroactivo: alguém sentou-se ao fim do dia (ou da semana) e
"carregou" as leituras todas de uma vez, em vez de as registar no momento da
verificação. É exactamente o padrão que a ASAE identifica como registo não real.

A função de produto é `public.haccp_burst_check(p_restaurant_id, p_from, p_to)`,
que devolve uma linha por grupo: `recorded_by, window_start, readings, control_points`.
No produto, o hub mostra a contagem dos últimos 7 dias por tenant. No Console, a
OMNAI quer a leitura transversal (todos os tenants, por semana).

## SQL de exemplo (a correr no Console, service role)

Por restaurante e por semana, nas últimas 12 semanas:

```sql
with grupos as (
  select r.id as restaurant_id, r.name,
         date_trunc('week', b.window_start) as semana,
         b.recorded_by, b.readings
    from restaurants r
    cross join lateral public.haccp_burst_check(
      r.id, (current_date - interval '84 days')::date, current_date) b
)
select restaurant_id, name, semana,
       count(*)            as grupos_em_bloco,
       sum(readings)       as registos_em_bloco,
       count(distinct recorded_by) as utilizadores
  from grupos
 group by restaurant_id, name, semana
 order by name, semana;
```

Um único restaurante, detalhe por grupo (para investigar um pico):

```sql
select b.window_start, b.recorded_by, b.readings, b.control_points
  from public.haccp_burst_check(
    '<restaurant_id>'::uuid,
    (current_date - interval '30 days')::date,
    current_date) b
 order by b.window_start desc;
```

## Como ler os números

- **0 grupos/semana** é o objectivo: cada verificação registada no momento.
- Um pico isolado pode ser um dia de rede em baixo (a fila offline sincronizou
  tudo junto quando voltou a haver rede). Cruzar com `sync_mode = 'deferred'`
  antes de concluir que é preenchimento retroactivo.
- Um padrão semanal recorrente (sempre à sexta ao fim do dia, por exemplo) é o
  sinal a levar ao cliente: o registo não está a acontecer no turno.

## O que NÃO fazer

Não transformar isto numa métrica punitiva de vaidade. Serve para conversas de
sucesso do cliente ("estão a registar no momento?"), não para ranking público
nem para bloquear o produto. O objectivo é prova real, não um número bonito.
