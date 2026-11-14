import { describe, expect, it } from "vitest";
import {
  computeFoodCost,
  computeLineCostCents,
  computeMarginPct,
  unitFactor,
} from "@/lib/types";

// Helpers de food cost da Ficha Técnica (0006): conversão fixa g↔kg e ml↔l,
// famílias incompatíveis sem custo, margem sobre PVP.

describe("computeLineCostCents", () => {
  it("mesma unidade: 300 g a 1.8 cents/g = 540 cents", () => {
    expect(computeLineCostCents(300, "g", "g", 1.8)).toBe(540);
  });

  it("converte g -> kg: 300 g a 1250 cents/kg = 375 cents", () => {
    expect(computeLineCostCents(300, "g", "kg", 1250)).toBe(375);
  });

  it("converte kg -> g: 0.5 kg a 1.2 cents/g = 600 cents", () => {
    expect(computeLineCostCents(0.5, "kg", "g", 1.2)).toBe(600);
  });

  it("converte ml -> l: 250 ml a 400 cents/l = 100 cents", () => {
    expect(computeLineCostCents(250, "ml", "l", 400)).toBe(100);
  });

  it("unidades de contagem: 2 un a 50 cents/un = 100 cents", () => {
    expect(computeLineCostCents(2, "un", "un", 50)).toBe(100);
  });

  it("famílias incompatíveis (g vs l) => null", () => {
    expect(computeLineCostCents(100, "g", "l", 400)).toBeNull();
  });

  it("un vs g sem peso médio => null", () => {
    expect(computeLineCostCents(1, "un", "g", 1)).toBeNull();
  });

  // Stock S1: un contra peso quando o ingrediente tem peso médio por unidade.
  it("2 un a 150 g/un num ingrediente em g (300 g) a 2 cents/g = 600 cents", () => {
    expect(computeLineCostCents(2, "un", "g", 2, 150)).toBe(600);
  });

  it("2 un a 150 g/un num ingrediente em kg (0.3 kg) a 1000 cents/kg = 300 cents", () => {
    expect(computeLineCostCents(2, "un", "kg", 1000, 150)).toBe(300);
  });

  it("sem custo do ingrediente => null", () => {
    expect(computeLineCostCents(100, "g", "g", null)).toBeNull();
    expect(computeLineCostCents(100, "g", "g", undefined)).toBeNull();
  });

  it("qty inválida => null", () => {
    expect(computeLineCostCents(0, "g", "g", 1)).toBeNull();
  });
});

describe("computeFoodCost", () => {
  const ings = new Map([
    ["bacalhau", { unit: "kg", cost_per_unit_cents: 1250 }],
    ["azeite", { unit: "l", cost_per_unit_cents: 800 }],
    ["semcusto", { unit: "un", cost_per_unit_cents: null }],
  ]);

  it("soma linhas com custo e conta costed/total", () => {
    const r = computeFoodCost(
      [
        { qty: 300, unit: "g", ingredient_id: "bacalhau" }, // 375
        { qty: 50, unit: "ml", ingredient_id: "azeite" }, // 40
        { qty: 1, unit: "un", ingredient_id: "semcusto" }, // sem custo
        { qty: 2, unit: "un", ingredient_id: null }, // linha livre
      ],
      ings,
    );
    expect(r.costCents).toBe(415);
    expect(r.costed).toBe(2);
    expect(r.total).toBe(4);
  });

  it("ficha vazia", () => {
    const r = computeFoodCost([], ings);
    expect(r.costCents).toBe(0);
    expect(r.total).toBe(0);
  });
});

// Stock S1: tabela de casos de unitFactor (espelha public.unit_factor da 0031 e
// toIngredientUnit da edge import-saft). Os mesmos casos da evidência do item 1.
describe("unitFactor", () => {
  it("2 kg -> g: factor 1000 (2 kg = 2000 g)", () => {
    expect(unitFactor("kg", "g")).toBe(1000);
    expect(2 * (unitFactor("kg", "g") as number)).toBe(2000);
  });

  it("10 l -> ml: factor 1000 (10 l = 10000 ml)", () => {
    expect(unitFactor("l", "ml")).toBe(1000);
    expect(10 * (unitFactor("l", "ml") as number)).toBe(10000);
  });

  it("un -> g com peso médio 150: factor 150 (2 un = 300 g)", () => {
    expect(unitFactor("un", "g", 150)).toBe(150);
    expect(2 * (unitFactor("un", "g", 150) as number)).toBe(300);
  });

  it("un -> g sem peso médio => null", () => {
    expect(unitFactor("un", "g")).toBeNull();
    expect(unitFactor("un", "g", 0)).toBeNull();
  });

  it("kg -> ml (massa contra volume) => null", () => {
    expect(unitFactor("kg", "ml")).toBeNull();
  });

  it("mesma unidade => 1", () => {
    expect(unitFactor("l", "l")).toBe(1);
  });
});

describe("computeMarginPct", () => {
  it("PVP 1450, custo 415 => ~71.4%", () => {
    expect(computeMarginPct(1450, 415)).toBeCloseTo(71.379, 2);
  });

  it("sem PVP => null", () => {
    expect(computeMarginPct(null, 415)).toBeNull();
    expect(computeMarginPct(0, 415)).toBeNull();
  });

  it("custo acima do PVP => margem negativa", () => {
    const m = computeMarginPct(400, 500);
    expect(m).not.toBeNull();
    expect(m as number).toBeLessThan(0);
  });
});
