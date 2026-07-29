import { shiftIsoDate } from "@/lib/service-date";
import type { MenuItem, MenuItemInsert } from "@/lib/types";

// Pratos do dia no editor (decisões David 28-07): kind='daily' + service_date
// de UM dia; escondem-se sozinhos do menu público quando o dia passa (RPC
// 0010). No editor vivem no painel "Pratos de hoje" e duplicam-se de ontem
// com um clique. Lógica pura aqui para ser testável sem UI.

export function isDailyOf(
  item: Pick<MenuItem, "kind" | "service_date">,
  dateIso: string,
): boolean {
  return item.kind === "daily" && item.service_date === dateIso;
}

// Payloads de insert para "Duplicar os de ontem": copia os pratos do dia de
// ontem para hoje, saltando nomes que hoje já existem (idempotente por nome,
// case-insensitive — carregar duas vezes no botão não duplica).
export function dailyDuplicates(items: MenuItem[], todayIso: string): MenuItemInsert[] {
  const yesterday = shiftIsoDate(todayIso, -1);
  const todayNames = new Set(
    items.filter((i) => isDailyOf(i, todayIso)).map((i) => i.name.trim().toLowerCase()),
  );
  return items
    .filter((i) => isDailyOf(i, yesterday))
    .filter((i) => !todayNames.has(i.name.trim().toLowerCase()))
    .map((i) => ({
      restaurant_id: i.restaurant_id,
      category_id: i.category_id,
      name: i.name,
      description: i.description,
      price_cents: i.price_cents,
      price_type: i.price_type,
      allergens: i.allergens,
      by_order: i.by_order,
      kind: "daily",
      service_date: todayIso,
      sort_order: i.sort_order,
    }));
}
