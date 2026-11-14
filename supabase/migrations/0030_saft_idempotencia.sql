-- 0030 — Idempotência do SAF-T: uma linha de documento só entra uma vez e só
-- abate stock uma vez.
--
-- NOTA DE NUMERAÇÃO: na base de dados esta migração está registada como
-- `0025_saft_idempotencia` (aplicada em 09-09-2026). O ficheiro leva 0030
-- porque o repo já tinha 0024, 0025, 0026 e 0029 ocupados. Ver o aviso de
-- numeração no fim deste ficheiro.
--
-- Porquê (David, 09-09): o POS de muitos restaurantes só exporta SAF-T por mês.
-- Exportar todos os dias dá um ficheiro CUMULATIVO (dia 1 até hoje), não o
-- diário. O desenho anterior assumia um ficheiro por período aplicado uma vez e
-- não tinha unicidade nenhuma por documento: importar o cumulativo diariamente
-- abateria o mesmo prato tantas vezes quantos os dias restantes do mês, e a
-- despensa ficava destruída em silêncio.
--
-- Apanhado antes de haver dados reais: 0 duplicados existentes e 0 movimentos
-- de stock com origem 'saft_import' (os 72 movimentos da demo são de facturas e
-- manuais). Nada a corrigir, só a impedir.

-- ── 1) Número de linha do documento (chave natural do SAF-T) ────────────────
-- O SAF-T traz LineNumber dentro de cada Invoice. Não o guardávamos, e sem ele
-- a chave teria de ser o código do artigo, que parte quando a mesma factura tem
-- duas linhas do mesmo prato (acontece: dois bitoques lançados em separado).
alter table public.saft_import_lines
  add column if not exists line_number int;

-- Backfill determinístico para as linhas que já existem: numera por documento,
-- pela ordem em que foram inseridas.
update public.saft_import_lines l
   set line_number = n.rn
  from (
    select id,
           row_number() over (partition by restaurant_id, invoice_no
                              order by created_at, id) as rn
      from public.saft_import_lines
     where line_number is null
  ) n
 where l.id = n.id and l.line_number is null;

alter table public.saft_import_lines
  alter column line_number set not null;

alter table public.saft_import_lines
  add constraint saft_import_lines_line_number_check check (line_number > 0);

-- ── 2) Unicidade por documento ─────────────────────────────────────────────
-- Atravessa imports de propósito: a mesma linha do mesmo documento não pode
-- entrar duas vezes, venha de que ficheiro vier. O importador passa a inserir
-- com upsert/ignoreDuplicates, portanto o cumulativo só acrescenta o que é novo.
create unique index if not exists saft_import_lines_documento_key
  on public.saft_import_lines(restaurant_id, invoice_no, line_number);

-- ── 3) Marca de abate, para o stock nunca sair duas vezes ──────────────────
-- Segunda linha de defesa, independente da primeira: mesmo que uma linha
-- reentrasse por alguma via, só abate se ainda não abateu.
alter table public.saft_import_lines
  add column if not exists stock_applied_at timestamptz;

create index if not exists saft_import_lines_por_aplicar_idx
  on public.saft_import_lines(restaurant_id, status)
  where stock_applied_at is null;

comment on column public.saft_import_lines.line_number is
  'LineNumber do SAF-T. Com invoice_no forma a chave natural do documento.';
comment on column public.saft_import_lines.stock_applied_at is
  'Quando esta linha abateu stock. NULL = por abater. Impede abate duplicado quando se importa o SAF-T cumulativo do mês vários dias seguidos.';

-- ── AVISO DE HIGIENE (09-09-2026) ──────────────────────────────────────────
-- O repo tem prefixos de migração repetidos: existem duas 0024 (estatísticas e
-- endurecer_funcoes_gatilho) e duas 0025 (menu_multilingue e esta). A Supabase
-- regista por timestamp, portanto a ORDEM DE APLICAÇÃO está correcta, mas a
-- leitura do repo deixou de ser fiável. Recomendação: passar a nomear as
-- migrações com timestamp (YYYYMMDDHHMM_nome.sql), como a própria CLI faz, em
-- vez de sequência manual, que colide sempre que duas frentes trabalham em
-- paralelo.
