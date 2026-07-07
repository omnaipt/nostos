-- 0008 — Margem alvo do restaurante (S3). Percentagem de margem sobre o PVP
-- abaixo da qual um prato conta como alerta na vista de margens e no
-- dashboard do dono. Default 65% (referência comum de food cost ~30-35%).

alter table public.restaurants
  add column if not exists target_margin_pct int not null default 65
  check (target_margin_pct between 0 and 95);
