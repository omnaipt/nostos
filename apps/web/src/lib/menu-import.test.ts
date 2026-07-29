import { describe, expect, it } from "vitest";
import type { MenuDraft } from "../../../../supabase/functions/parse-menu/draft";
import { centsToInput, draftToEditable, editableToPayload } from "./menu-import";

function draft(partial?: Partial<MenuDraft>): MenuDraft {
  return {
    categories: [
      {
        name: "Peixe",
        sort: 0,
        items: [
          {
            name: "Robalo grelhado",
            description: null,
            price_type: "fixed",
            price_cents: 1850,
            variants: [],
            serves: null,
            allergens_suggested: ["peixe"],
            confidence: "alta",
            needs_review: false,
            note: null,
          },
          {
            name: "Arroz de marisco",
            description: "para dois",
            price_type: "variants",
            price_cents: null,
            variants: [
              { label: "2 pax", price_cents: 3200, serves: 2 },
              { label: "1 pax", price_cents: 1800, serves: 1 },
            ],
            serves: null,
            allergens_suggested: [],
            confidence: "media",
            needs_review: true,
            note: "preço da dose pequena pouco legível",
          },
        ],
      },
    ],
    wines_detected: false,
    items_count: 2,
    flagged_count: 1,
    ...partial,
  };
}

describe("centsToInput", () => {
  it("formata cêntimos para input editável", () => {
    expect(centsToInput(1850)).toBe("18,50");
    expect(centsToInput(1200)).toBe("12");
    expect(centsToInput(null)).toBe("");
  });
});

describe("draftToEditable", () => {
  it("marca duplicados por nome (case-insensitive) contra a ementa actual", () => {
    const cats = draftToEditable(draft(), new Set(["arroz de marisco"]));
    expect(cats[0].items[0].duplicate).toBe(false);
    expect(cats[0].items[1].duplicate).toBe(true);
  });

  it("converte preços e doses para strings editáveis", () => {
    const cats = draftToEditable(draft(), new Set());
    expect(cats[0].items[0].price).toBe("18,50");
    expect(cats[0].items[1].variants[0]).toMatchObject({ label: "2 pax", price: "32", serves: "2" });
  });
});

describe("editableToPayload", () => {
  it("payload limpo quando tudo é coerente; needs_review sai a false (publicar é a revisão)", () => {
    const cats = draftToEditable(draft(), new Set());
    const { menu, problems } = editableToPayload(cats);
    expect(problems).toEqual([]);
    const c = (menu as { categories: { items: Record<string, unknown>[] }[] }).categories[0];
    expect(c.items[0]).toMatchObject({ name: "Robalo grelhado", price_cents: 1850, needs_review: false });
    expect(c.items[1]).toMatchObject({ price_type: "variants", price_cents: null, note: "preço da dose pequena pouco legível" });
  });

  it("acusa problemas com nomes: preço em falta e doses vazias", () => {
    const cats = draftToEditable(draft(), new Set());
    cats[0].items[0].price = "";
    cats[0].items[1].variants = [];
    const { menu, problems } = editableToPayload(cats);
    expect(menu).toBeNull();
    expect(problems.some((p) => p.includes("Robalo grelhado") && p.includes("preço"))).toBe(true);
    expect(problems.some((p) => p.includes("Arroz de marisco") && p.includes("dose"))).toBe(true);
  });

  it("itens removidos não contam; categoria vazia cai; tudo removido = problema honesto", () => {
    const cats = draftToEditable(draft(), new Set());
    cats[0].items = [];
    const { menu, problems } = editableToPayload(cats);
    expect(menu).toBeNull();
    expect(problems.some((p) => p.includes("Não sobrou"))).toBe(true);
  });
});
