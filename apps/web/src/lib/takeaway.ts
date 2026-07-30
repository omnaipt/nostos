import type { PublicMenuItem } from "@/hooks/use-public-menu";
import type { SubmitTakeawayItem } from "@/hooks/use-takeaway";

// Carrinho de take-away (puro, testável). Regras da spec §3:
//   • só itens fixed/variants entram (market e by_order ficam FORA do v1 —
//     preço do dia e confeção lenta não se auto-encomendam).
//   • o preço mostrado é informativo; o total real é snapshot do servidor na
//     submissão (submit_takeaway_order). Aqui é só para o cliente ver.

export interface CartLine {
  key: string; // menuItemId + variantId
  menuItemId: string;
  variantId: string | null;
  name: string; // "Prato" ou "Prato · dose"
  unitPriceCents: number;
  qty: number;
}

export function isOrderable(item: PublicMenuItem): boolean {
  if (!item.available || item.byOrder) return false;
  if (item.priceType === "fixed") return item.priceCents != null;
  // variants: precisa de dose com preço E com id (o servidor fixa o preço por
  // id; sem id — ambiente pré-0022 — não é encomendável).
  if (item.priceType === "variants") return item.variants.some((v) => v.priceCents != null && v.id !== "");
  return false; // market e per_kg fora do v1
}

// Opções encomendáveis de um item: 1 linha (fixed) ou N (variants com preço).
export interface OrderOption {
  key: string;
  menuItemId: string;
  variantId: string | null;
  label: string;
  priceCents: number;
}

export function optionsForItem(item: PublicMenuItem): OrderOption[] {
  if (!isOrderable(item)) return [];
  if (item.priceType === "fixed") {
    return [
      { key: item.id, menuItemId: item.id, variantId: null, label: item.name, priceCents: item.priceCents as number },
    ];
  }
  return item.variants
    .filter((v) => v.priceCents != null && v.id !== "")
    .map((v) => ({
      key: v.id,
      menuItemId: item.id,
      // variant_id real (0022): o servidor fixa o preço desta dose por id.
      variantId: v.id,
      label: `${item.name} · ${v.label}`,
      priceCents: v.priceCents as number,
    }));
}

export function cartTotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.qty, 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function toSubmitItems(lines: CartLine[]): SubmitTakeawayItem[] {
  return lines.map((l) => ({
    menu_item_id: l.menuItemId,
    variant_id: l.variantId,
    qty: l.qty,
  }));
}

// Slots de levantamento a partir das horas dos turnos activos do dia, em passos
// de 15 min a partir do início de cada turno (janela simples v1: início +
// 2h30). Devolve "HH:MM".
export function pickupSlots(turnStartTimes: string[]): string[] {
  const slots = new Set<string>();
  for (const start of turnStartTimes) {
    const [h, m] = start.slice(0, 5).split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    let total = h * 60 + m;
    const end = total + 150; // 2h30 de janela
    for (; total <= end; total += 15) {
      const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
      const mm = String(total % 60).padStart(2, "0");
      slots.add(`${hh}:${mm}`);
    }
  }
  return [...slots].sort();
}
