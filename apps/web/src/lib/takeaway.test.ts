import { describe, expect, it } from "vitest";
import type { PublicMenuItem } from "@/hooks/use-public-menu";
import {
  cartCount,
  cartTotalCents,
  earliestPickupToday,
  isOrderable,
  optionsForItem,
  pickupDays,
  pickupSlots,
  toSubmitItems,
  type CartLine,
} from "./takeaway";

function item(p: Partial<PublicMenuItem>): PublicMenuItem {
  return {
    id: "i",
    name: "Prato",
    description: null,
    priceCents: 1200,
    priceType: "fixed",
    serves: null,
    variants: [],
    allergens: [],
    available: true,
    byOrder: false,
    kind: "standard",
    ...p,
  } as PublicMenuItem;
}

describe("isOrderable", () => {
  it("fixed com preço entra; market/by_order/esgotado ficam fora", () => {
    expect(isOrderable(item({}))).toBe(true);
    expect(isOrderable(item({ priceType: "market", priceCents: null }))).toBe(false);
    expect(isOrderable(item({ byOrder: true }))).toBe(false);
    expect(isOrderable(item({ available: false }))).toBe(false);
    expect(isOrderable(item({ priceType: "per_kg" }))).toBe(false);
  });
  it("variants entra se pelo menos uma dose tem preço E id", () => {
    expect(
      isOrderable(item({ priceType: "variants", priceCents: null, variants: [{ id: "v1", label: "2 pax", priceCents: 3200, unit: "dose", serves: 2 }] })),
    ).toBe(true);
    expect(
      isOrderable(item({ priceType: "variants", priceCents: null, variants: [{ id: "v1", label: "?", priceCents: null, unit: "dose", serves: null }] })),
    ).toBe(false);
    // dose com preço mas sem id (pré-0022) não é encomendável
    expect(
      isOrderable(item({ priceType: "variants", priceCents: null, variants: [{ id: "", label: "2 pax", priceCents: 3200, unit: "dose", serves: 2 }] })),
    ).toBe(false);
  });
});

describe("optionsForItem", () => {
  it("fixed dá 1 opção; variants dá uma por dose com preço e id, com variant_id real", () => {
    expect(optionsForItem(item({}))).toHaveLength(1);
    const opts = optionsForItem(
      item({
        priceType: "variants",
        priceCents: null,
        variants: [
          { id: "v-2pax", label: "2 pax", priceCents: 3200, unit: "dose", serves: 2 },
          { id: "v-1pax", label: "1 pax", priceCents: 1800, unit: "dose", serves: 1 },
        ],
      }),
    );
    expect(opts.map((o) => o.label)).toEqual(["Prato · 2 pax", "Prato · 1 pax"]);
    expect(opts[0].priceCents).toBe(3200);
    expect(opts.map((o) => o.variantId)).toEqual(["v-2pax", "v-1pax"]);
    expect(opts.map((o) => o.key)).toEqual(["v-2pax", "v-1pax"]);
  });
});

describe("cart math", () => {
  const lines: CartLine[] = [
    { key: "a", menuItemId: "a", variantId: null, name: "A", unitPriceCents: 1200, qty: 2 },
    { key: "b", menuItemId: "b", variantId: null, name: "B", unitPriceCents: 500, qty: 1 },
  ];
  it("total e contagem", () => {
    expect(cartTotalCents(lines)).toBe(2900);
    expect(cartCount(lines)).toBe(3);
  });
  it("toSubmitItems só leva ids + qty (preço é do servidor)", () => {
    expect(toSubmitItems(lines)).toEqual([
      { menu_item_id: "a", variant_id: null, qty: 2 },
      { menu_item_id: "b", variant_id: null, qty: 1 },
    ]);
  });
});

describe("pickupSlots", () => {
  it("gera slots de 15min por 2h30 desde cada turno, ordenados e sem duplicados", () => {
    const slots = pickupSlots(["12:30", "19:30"]);
    expect(slots[0]).toBe("12:30");
    expect(slots).toContain("13:00");
    expect(slots).toContain("15:00"); // 12:30 + 2h30
    expect(slots).toContain("19:30");
    // ordenado
    expect([...slots]).toEqual([...slots].sort());
    // sem duplicados
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("filtra as horas já passadas quando é para hoje", () => {
    const todas = pickupSlots(["12:30", "19:30"]);
    const so_tarde = pickupSlots(["12:30", "19:30"], "19:00");
    expect(todas).toContain("13:00");
    expect(so_tarde).not.toContain("13:00");
    expect(so_tarde[0]).toBe("19:30");
  });
});

describe("earliestPickupToday", () => {
  it("soma a folga de preparação e arredonda para cima aos 15 min", () => {
    // 17:21 + 30 = 17:51 -> 18:00
    expect(earliestPickupToday(new Date(2026, 6, 30, 17, 21))).toBe("18:00");
    // 12:00 + 30 = 12:30, já múltiplo de 15
    expect(earliestPickupToday(new Date(2026, 6, 30, 12, 0))).toBe("12:30");
  });

  it("devolve 24:00 quando a folga transborda para o dia seguinte", () => {
    // 23:50 + 30 passa da meia-noite: não há mais levantamentos hoje.
    expect(earliestPickupToday(new Date(2026, 6, 30, 23, 50))).toBe("24:00");
  });

  it("aceita folga configurável", () => {
    expect(earliestPickupToday(new Date(2026, 6, 30, 10, 0), 0)).toBe("10:00");
  });
});

describe("pickupDays", () => {
  it("dá hoje, amanhã e o dia seguinte pelo nome", () => {
    // 30-07-2026 é uma quinta-feira; o terceiro dia é sábado.
    const dias = pickupDays(new Date(2026, 6, 30, 9, 0));
    expect(dias.map((d) => d.label)).toEqual(["Hoje", "Amanhã", "Sábado"]);
    expect(dias.map((d) => d.date)).toEqual(["2026-07-30", "2026-07-31", "2026-08-01"]);
  });

  it("atravessa a fronteira do mês sem partir", () => {
    const dias = pickupDays(new Date(2026, 6, 31, 9, 0));
    expect(dias.map((d) => d.date)).toEqual(["2026-07-31", "2026-08-01", "2026-08-02"]);
  });
});
