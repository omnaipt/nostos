import { describe, expect, it } from "vitest";
import {
  internalUseTotalCents,
  orderFichasPorValidar,
  previewDishConsumption,
  type PreviewIngredient,
  type PreviewLine,
} from "./consumo";

function ings(...list: PreviewIngredient[]): Map<string, PreviewIngredient> {
  return new Map(list.map((i) => [i.id, i]));
}

describe("previewDishConsumption (Stock S2)", () => {
  const lines: PreviewLine[] = [
    { ingredient_id: "i1", name: "Massa", qty: 100, unit: "g" },
    { ingredient_id: "i2", name: "Molho", qty: 50, unit: "ml" },
    { ingredient_id: "i3", name: "Queijo", qty: 20, unit: "g" },
  ];
  const map = ings(
    { id: "i1", name: "Massa", unit: "g" },
    { id: "i2", name: "Molho", unit: "ml" },
    { id: "i3", name: "Queijo", unit: "g" },
  );

  it("expande a ficha pelas doses e serventias (quantidades exactas)", () => {
    const r = previewDishConsumption({ servings: 2, status: "validada" }, lines, map, 6);
    expect(r.estimated).toBe(false);
    expect(r.abatidas).toEqual([
      { ingredientId: "i1", name: "Massa", qty: 300, unit: "g" },
      { ingredientId: "i2", name: "Molho", qty: 150, unit: "ml" },
      { ingredientId: "i3", name: "Queijo", qty: 60, unit: "g" },
    ]);
    expect(r.naoAbatidas).toEqual([]);
  });

  it("marca estimado quando a ficha está em rascunho", () => {
    const r = previewDishConsumption({ servings: 1, status: "rascunho" }, lines, map, 1);
    expect(r.estimated).toBe(true);
  });

  it("separa linha livre, ingrediente em contagem e conversão impossível", () => {
    const mix: PreviewLine[] = [
      { ingredient_id: null, name: "Sal grosso", qty: 5, unit: "g" },
      { ingredient_id: "cont", name: "Azeite mesa", qty: 10, unit: "ml" },
      { ingredient_id: "bad", name: "Farinha", qty: 1, unit: "l" }, // volume contra massa
      { ingredient_id: "ok", name: "Arroz", qty: 30, unit: "g" },
    ];
    const r = previewDishConsumption(
      { servings: 1, status: "validada" },
      mix,
      ings(
        { id: "cont", name: "Azeite mesa", unit: "ml", depletion_mode: "contagem" },
        { id: "bad", name: "Farinha", unit: "g" },
        { id: "ok", name: "Arroz", unit: "g" },
      ),
      1,
    );
    expect(r.abatidas).toEqual([{ ingredientId: "ok", name: "Arroz", qty: 30, unit: "g" }]);
    expect(r.naoAbatidas).toEqual([
      { name: "Sal grosso", motivo: "linha_livre" },
      { name: "Azeite mesa", motivo: "contagem" },
      { name: "Farinha", motivo: "sem_conversao" },
    ]);
  });

  it("descarta quantidade residual que arredonda a zero", () => {
    const r = previewDishConsumption(
      { servings: 10000, status: "validada" },
      [{ ingredient_id: "i1", name: "Massa", qty: 1, unit: "g" }],
      ings({ id: "i1", name: "Massa", unit: "g" }),
      1,
    );
    expect(r.abatidas).toEqual([]);
    expect(r.naoAbatidas).toEqual([{ name: "Massa", motivo: "quantidade_nula" }]);
  });
});

describe("orderFichasPorValidar", () => {
  it("ordena pelas unidades vendidas (desc), empate alfabético", () => {
    const drafts = [
      { id: "s1", menu_item_id: "m1" },
      { id: "s2", menu_item_id: "m2" },
      { id: "s3", menu_item_id: "m3" },
      { id: "s4", menu_item_id: "m4" },
    ];
    const names = new Map([
      ["m1", "Bacalhau"],
      ["m2", "Arroz de marisco"],
      ["m3", "Polvo"],
      ["m4", "Bitoque"],
    ]);
    const units = new Map([
      ["m1", 40],
      ["m2", 40],
      ["m3", 90],
      // m4 sem vendas (0)
    ]);
    const r = orderFichasPorValidar(drafts, names, units);
    expect(r.map((f) => f.menuItemId)).toEqual(["m3", "m2", "m1", "m4"]);
    expect(r[3].unitsSold).toBe(0);
  });
});

describe("internalUseTotalCents", () => {
  it("soma o módulo da qty × custo por unidade, ignorando sem custo", () => {
    const movements = [
      { ingredient_id: "i1", qty: -300 },
      { ingredient_id: "i2", qty: -150 },
      { ingredient_id: "i3", qty: -10 }, // sem custo
    ];
    const cost = new Map<string, number | null>([
      ["i1", 0.5],
      ["i2", 1],
      ["i3", null],
    ]);
    expect(internalUseTotalCents(movements, cost)).toBe(300); // 150 + 150
  });
});
