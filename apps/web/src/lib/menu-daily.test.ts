import { describe, expect, it } from "vitest";
import { dailyDuplicates, isDailyOf } from "./menu-daily";
import type { MenuItem } from "./types";

const TODAY = "2026-07-29";
const YESTERDAY = "2026-07-28";

function item(partial: Partial<MenuItem>): MenuItem {
  return {
    id: "i",
    restaurant_id: "r",
    category_id: "c",
    name: "Prato",
    description: null,
    price_cents: 1200,
    price_type: "fixed",
    allergens: [],
    by_order: false,
    kind: "standard",
    service_date: null,
    sort_order: 0,
    active: true,
    available: true,
    ...partial,
  } as MenuItem;
}

describe("isDailyOf", () => {
  it("só é daily do dia com kind e data certos", () => {
    expect(isDailyOf(item({ kind: "daily", service_date: TODAY }), TODAY)).toBe(true);
    expect(isDailyOf(item({ kind: "daily", service_date: YESTERDAY }), TODAY)).toBe(false);
    expect(isDailyOf(item({ kind: "standard" }), TODAY)).toBe(false);
  });
});

describe("dailyDuplicates", () => {
  it("copia os daily de ontem para hoje com service_date de hoje", () => {
    const items = [
      item({ id: "a", name: "Bacalhau à Braga", kind: "daily", service_date: YESTERDAY, by_order: true }),
      item({ id: "b", name: "Prato normal" }),
    ];
    const dups = dailyDuplicates(items, TODAY);
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({
      name: "Bacalhau à Braga",
      kind: "daily",
      service_date: TODAY,
      by_order: true,
      price_cents: 1200,
    });
  });

  it("é idempotente por nome (case-insensitive): não duplica os que hoje já existem", () => {
    const items = [
      item({ id: "a", name: "Robalo da lota", kind: "daily", service_date: YESTERDAY }),
      item({ id: "b", name: "robalo DA LOTA", kind: "daily", service_date: TODAY }),
      item({ id: "c", name: "Cabrito assado", kind: "daily", service_date: YESTERDAY }),
    ];
    const dups = dailyDuplicates(items, TODAY);
    expect(dups.map((d) => d.name)).toEqual(["Cabrito assado"]);
  });

  it("ignora standard e daily mais antigos que ontem", () => {
    const items = [
      item({ id: "a", name: "Antigo", kind: "daily", service_date: "2026-07-20" }),
      item({ id: "b", name: "Normal" }),
    ];
    expect(dailyDuplicates(items, TODAY)).toHaveLength(0);
  });
});
