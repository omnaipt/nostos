import { describe, expect, it } from "vitest";
// Módulo puro PARTILHADO com a edge import-saft — uma só implementação do
// abate do SAF-T (conversão, estimado, modo de consumo). Stock S2 (0033).
import {
  computeDepletions,
  type Ingredient,
  type MatchedLine,
  type Sheet,
} from "../../../../supabase/functions/import-saft/deplete";

function sheets(...list: Sheet[]): Map<string, Sheet> {
  return new Map(list.map((s) => [s.menu_item_id, s]));
}
function ingredients(...list: Ingredient[]): Map<string, Ingredient> {
  return new Map(list.map((i) => [i.id, i]));
}

describe("computeDepletions (Stock S2)", () => {
  it("abate a ficha validada na unidade do ingrediente", () => {
    const matched: MatchedLine[] = [
      { invoice_no: "FT 1/1", qty: 3, menu_item_id: "m1" },
    ];
    const r = computeDepletions(
      matched,
      sheets({
        menu_item_id: "m1",
        servings: 1,
        status: "validada",
        tech_sheet_ingredients: [{ ingredient_id: "i1", qty: 100, unit: "g" }],
      }),
      ingredients({ id: "i1", name: "Massa", unit: "g" }),
    );
    expect(r.depletions).toHaveLength(1);
    expect(r.depletions[0].qty).toBe(300); // 3 doses × 100 g
    expect(r.depletions[0].unit).toBe("g");
    expect(r.depletions[0].estimated).toBe(false);
    expect(r.unitMismatch).toEqual([]);
    expect(r.consumoPorContagem).toEqual([]);
  });

  it("marca estimado quando a ficha está em rascunho", () => {
    const r = computeDepletions(
      [{ invoice_no: "FT 1/2", qty: 1, menu_item_id: "m1" }],
      sheets({
        menu_item_id: "m1",
        servings: 1,
        status: "rascunho",
        tech_sheet_ingredients: [{ ingredient_id: "i1", qty: 50, unit: "g" }],
      }),
      ingredients({ id: "i1", name: "Molho", unit: "g" }),
    );
    expect(r.depletions[0].estimated).toBe(true);
  });

  it("estimado se ALGUMA ficha que contribui está em rascunho", () => {
    // Duas vendas na mesma fatura usam o mesmo ingrediente; uma das fichas é
    // rascunho. O abate agregado fica estimado.
    const r = computeDepletions(
      [
        { invoice_no: "FT 1/3", qty: 1, menu_item_id: "val" },
        { invoice_no: "FT 1/3", qty: 1, menu_item_id: "rasc" },
      ],
      sheets(
        {
          menu_item_id: "val",
          servings: 1,
          status: "validada",
          tech_sheet_ingredients: [{ ingredient_id: "i1", qty: 10, unit: "g" }],
        },
        {
          menu_item_id: "rasc",
          servings: 1,
          status: "rascunho",
          tech_sheet_ingredients: [{ ingredient_id: "i1", qty: 10, unit: "g" }],
        },
      ),
      ingredients({ id: "i1", name: "Sal fino", unit: "g" }),
    );
    expect(r.depletions).toHaveLength(1);
    expect(r.depletions[0].qty).toBe(20);
    expect(r.depletions[0].estimated).toBe(true);
  });

  it("não abate ingredientes em modo contagem; lista-os em consumoPorContagem", () => {
    const r = computeDepletions(
      [{ invoice_no: "FT 1/4", qty: 1, menu_item_id: "m1" }],
      sheets({
        menu_item_id: "m1",
        servings: 1,
        status: "validada",
        tech_sheet_ingredients: [
          { ingredient_id: "i1", qty: 100, unit: "g" },
          { ingredient_id: "iazeite", qty: 5, unit: "ml" },
        ],
      }),
      ingredients(
        { id: "i1", name: "Massa", unit: "g", depletion_mode: "ficha" },
        { id: "iazeite", name: "Azeite de mesa", unit: "ml", depletion_mode: "contagem" },
      ),
    );
    expect(r.depletions).toHaveLength(1);
    expect(r.depletions[0].ingredientId).toBe("i1");
    expect(r.consumoPorContagem).toEqual(["Azeite de mesa"]);
  });

  it("reporta unitMismatch quando a conversão não é possível", () => {
    const r = computeDepletions(
      [{ invoice_no: "FT 1/5", qty: 1, menu_item_id: "m1" }],
      sheets({
        menu_item_id: "m1",
        servings: 1,
        status: "validada",
        tech_sheet_ingredients: [{ ingredient_id: "i1", qty: 1, unit: "l" }],
      }),
      ingredients({ id: "i1", name: "Farinha", unit: "g" }), // volume contra massa
    );
    expect(r.depletions).toEqual([]);
    expect(r.unitMismatch).toEqual(["Farinha"]);
  });

  it("agrega linhas da mesma fatura e ingrediente", () => {
    const r = computeDepletions(
      [
        { invoice_no: "FT 1/6", qty: 2, menu_item_id: "m1" },
        { invoice_no: "FT 1/6", qty: 3, menu_item_id: "m1" },
      ],
      sheets({
        menu_item_id: "m1",
        servings: 1,
        status: "validada",
        tech_sheet_ingredients: [{ ingredient_id: "i1", qty: 10, unit: "g" }],
      }),
      ingredients({ id: "i1", name: "Arroz", unit: "g" }),
    );
    expect(r.depletions).toHaveLength(1);
    expect(r.depletions[0].qty).toBe(50); // (2+3) × 10 g
  });

  it("ignora linhas livres (sem ingrediente da despensa)", () => {
    const r = computeDepletions(
      [{ invoice_no: "FT 1/7", qty: 1, menu_item_id: "m1" }],
      sheets({
        menu_item_id: "m1",
        servings: 1,
        status: "validada",
        tech_sheet_ingredients: [{ ingredient_id: null, qty: 1, unit: "un" }],
      }),
      ingredients(),
    );
    expect(r.depletions).toEqual([]);
    expect(r.unitMismatch).toEqual([]);
    expect(r.consumoPorContagem).toEqual([]);
  });
});
