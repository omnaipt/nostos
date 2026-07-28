-- 0012 — Imports SAF-T (v0). O fecho do dia: o XML do software de facturação
-- entra, as linhas de venda ficam em staging, casam com pratos via
-- pos_product_map (0011), e a edge import-saft explode as fichas técnicas
-- (0006) em stock_movements 'sale_depletion'. A conciliação lê daqui.
-- Depende da 0011 (pos_product_map). Só documentos de venda efectiva no v0;
-- notas de crédito ficam fora (decisão registada no spec).

-- ── 1) Lote de import ────────────────────────────────────────────────────────
create table if not exists public.saft_imports (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     uuid not null references public.restaurants(id) on delete cascade,
  filename          text,
  period_start      date,
  period_end        date,
  status            text not null default 'parsing'
    check (status in ('parsing','review','applied','failed')),
  invoices_count    int not null default 0,
  lines_count       int not null default 0,
  matched_count     int not null default 0,
  unmatched_count   int not null default 0,
  gross_total_cents bigint,
  error             text,
  applied_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists saft_imports_restaurant_idx
  on public.saft_imports(restaurant_id, created_at);

create trigger saft_imports_touch before update on public.saft_imports
  for each row execute function public.touch_updated_at();

-- ── 2) Linhas em staging ─────────────────────────────────────────────────────
-- Uma linha por linha de factura do SAF-T. status: matched (tem prato),
-- unmatched (fila de conciliação), ignored (dono decidiu ignorar, ex.: taxas).
create table if not exists public.saft_import_lines (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  import_id        uuid not null references public.saft_imports(id) on delete cascade,
  invoice_no       text not null,
  invoice_date     date,
  pos_code         text,
  pos_description  text,
  qty              numeric(14,3) not null check (qty > 0),
  unit_price_cents int check (unit_price_cents is null or unit_price_cents >= 0),
  menu_item_id     uuid references public.menu_items(id) on delete set null,
  status           text not null default 'unmatched'
    check (status in ('matched','unmatched','ignored')),
  created_at       timestamptz not null default now()
);
create index if not exists saft_import_lines_import_idx
  on public.saft_import_lines(import_id);
create index if not exists saft_import_lines_status_idx
  on public.saft_import_lines(import_id, status);

-- Coerência: matched exige prato; unmatched/ignored não têm prato.
alter table public.saft_import_lines
  add constraint saft_lines_status_coherent check (
    (status = 'matched' and menu_item_id is not null) or
    (status in ('unmatched','ignored') and menu_item_id is null)
  );

-- Guardas multi-tenant: a linha pertence ao mesmo restaurante do import; o
-- prato (quando existe) idem.
create or replace function public.saft_line_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.saft_imports s
     where s.id = new.import_id and s.restaurant_id = new.restaurant_id
  ) then
    raise exception 'import_de_outro_restaurante';
  end if;
  if new.menu_item_id is not null and not exists (
    select 1 from public.menu_items i
     where i.id = new.menu_item_id and i.restaurant_id = new.restaurant_id
  ) then
    raise exception 'prato_de_outro_restaurante';
  end if;
  return new;
end $$;

create trigger saft_import_lines_tenant_guard
  before insert or update on public.saft_import_lines
  for each row execute function public.saft_line_guard();

-- ── 3) RLS (padrão *_member_all) ─────────────────────────────────────────────
alter table public.saft_imports enable row level security;
alter table public.saft_import_lines enable row level security;

create policy saft_imports_member_all on public.saft_imports
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));
create policy saft_import_lines_member_all on public.saft_import_lines
  for all using (public.is_restaurant_member(restaurant_id))
  with check (public.is_restaurant_member(restaurant_id));

-- Nota para a edge import-saft (fora desta migração):
-- 1) cria saft_imports(status=parsing) → 2) staging das linhas → 3) casa via
-- pos_product_map → 4) status=review se unmatched_count>0, senão aplica:
-- por linha matched, lê tech_sheet do prato e insere stock_movements
-- kind=sale_depletion, source=saft_import, source_ref=invoice_no,
-- qty = -(linha.qty × ingrediente.qty / servings) → 5) status=applied.
-- Pratos sem ficha técnica: contam-se e reportam-se, não abatem.
