import { describe, expect, it } from "vitest";
// Módulo puro PARTILHADO com a edge parse-menu (padrão parse-invoice/match.ts).
import { parseMenuDraft } from "../../../../supabase/functions/parse-menu/draft";

const OK = JSON.stringify({
  categories: [
    {
      name: "Mariscos",
      items: [
        {
          name: "Arroz de marisco",
          price_type: "variants",
          price_cents: 3400, // deve ser normalizado a null (coerência 0010)
          variants: [
            { label: "2 pax", price_cents: 3400, serves: 2 },
            { label: "1 pax", price_cents: 1800, serves: 1 },
          ],
          confidence: "alta",
        },
        {
          name: "Sapateira recheada",
          price_type: "fixed",
          price_cents: 1650,
          allergens_suggested: ["crustaceos", "ovo_estrelado_nao_existe"],
          confidence: "alta",
        },
      ],
    },
    {
      name: "Peixe",
      items: [
        { name: "Robalo", price_type: "per_kg", price_cents: 4500, confidence: "alta" },
        { name: "Peixe do dia", price_type: "market", price_cents: 999, confidence: "media" },
      ],
    },
  ],
  wines_detected: true,
});

describe("parseMenuDraft", () => {
  const d = parseMenuDraft(OK)!;

  it("estrutura: categorias pela ordem, contagens certas", () => {
    expect(d.categories.map((c) => c.name)).toEqual(["Mariscos", "Peixe"]);
    expect(d.categories[0].sort).toBe(0);
    expect(d.items_count).toBe(4);
    expect(d.wines_detected).toBe(true);
  });

  it("coerência 0010: variants e market normalizam price_cents a null", () => {
    const arroz = d.categories[0].items[0];
    expect(arroz.price_type).toBe("variants");
    expect(arroz.price_cents).toBeNull();
    expect(arroz.variants).toHaveLength(2);
    const dia = d.categories[1].items[1];
    expect(dia.price_cents).toBeNull();
  });

  it("alergénios: só códigos UE sobrevivem (sugestão, nunca invenção)", () => {
    expect(d.categories[0].items[1].allergens_suggested).toEqual(["crustaceos"]);
  });

  it("fixed sem preço → needs_review com note (o publish abortaria)", () => {
    const r = parseMenuDraft(
      JSON.stringify({
        categories: [
          { name: "Carnes", items: [{ name: "Bife", price_type: "fixed", price_cents: null, confidence: "alta" }] },
        ],
      }),
    )!;
    const bife = r.categories[0].items[0];
    expect(bife.needs_review).toBe(true);
    expect(bife.note).toContain("sem preço");
    expect(r.flagged_count).toBe(1);
  });

  it("variants sem doses → needs_review 'doses por preencher'", () => {
    const r = parseMenuDraft(
      JSON.stringify({
        categories: [
          { name: "X", items: [{ name: "Cataplana", price_type: "variants", variants: [], confidence: "alta" }] },
        ],
      }),
    )!;
    expect(r.categories[0].items[0].needs_review).toBe(true);
    expect(r.categories[0].items[0].note).toContain("doses");
  });

  it("price_type desconhecido → fixed + needs_review (na dúvida, taxonomia §3)", () => {
    const r = parseMenuDraft(
      JSON.stringify({
        categories: [
          { name: "X", items: [{ name: "Y", price_type: "promo", price_cents: 100, confidence: "alta" }] },
        ],
      }),
    )!;
    expect(r.categories[0].items[0].price_type).toBe("fixed");
    expect(r.categories[0].items[0].needs_review).toBe(true);
  });

  it("confidence baixa conta para flagged_count", () => {
    const r = parseMenuDraft(
      JSON.stringify({
        categories: [
          { name: "X", items: [{ name: "Ilegível", price_type: "fixed", price_cents: 100, confidence: "baixa" }] },
        ],
      }),
    )!;
    expect(r.flagged_count).toBe(1);
  });

  it("JSON em fences e categorias vazias descartadas", () => {
    const r = parseMenuDraft(
      "```json\n" +
        JSON.stringify({
          categories: [
            { name: "Vazia", items: [] },
            { name: "Cheia", items: [{ name: "Z", price_type: "fixed", price_cents: 100, confidence: "alta" }] },
          ],
        }) +
        "\n```",
    )!;
    expect(r.categories.map((c) => c.name)).toEqual(["Cheia"]);
  });

  it("lixo total → null (ecrã honesto + fallback manual)", () => {
    expect(parseMenuDraft("não sei ler isto")).toBeNull();
    expect(parseMenuDraft(JSON.stringify({ categories: [] }))).toBeNull();
  });
});
