import { describe, expect, it } from "vitest";
import {
  computePantrySummary,
  formatSignedQty,
  groupUnmatched,
  isBelowMin,
  isInternalNote,
  sortPantry,
} from "./stock";

const ing = (
  name: string,
  stock: number,
  min: number | null,
  cost: number | null = null,
) => ({
  name,
  stock_qty: stock,
  low_stock_threshold: min,
  cost_per_unit_cents: cost,
});

describe("isBelowMin", () => {
  it("sem mínimo definido nunca alerta", () => {
    expect(isBelowMin(ing("sal", 0, null))).toBe(false);
  });
  it("abaixo do mínimo alerta; igual ao mínimo não", () => {
    expect(isBelowMin(ing("polvo", 4.5, 6))).toBe(true);
    expect(isBelowMin(ing("polvo", 6, 6))).toBe(false);
  });
});

describe("computePantrySummary", () => {
  it("conta abaixo do mínimo e soma valor só de saldos positivos com custo", () => {
    const s = computePantrySummary([
      ing("polvo", 12, 6, 980), // 12 × 980 = 11760
      ing("coentros", 3.5, 4, 200), // abaixo; 3.5 × 200 = 700
      ing("sal", -1, null, 50), // saldo negativo: anomalia, não subtrai
      ing("azeite", 10, null, null), // sem custo: fora do valor
    ]);
    expect(s.belowMinCount).toBe(1);
    expect(s.stockValueCents).toBe(11760 + 700);
  });
});

describe("sortPantry", () => {
  it("repor primeiro, depois alfabético", () => {
    const sorted = sortPantry([
      ing("azeite", 10, null),
      ing("coentros", 1, 4),
      ing("bacalhau", 2, null),
      ing("polvo", 4, 6),
    ]);
    expect(sorted.map((i) => i.name)).toEqual(["coentros", "polvo", "azeite", "bacalhau"]);
  });
});

describe("formatSignedQty", () => {
  it("mostra o sinal explícito", () => {
    expect(formatSignedQty(12)).toBe("+12");
    expect(formatSignedQty(-7.5)).toBe("−7,5");
  });
});

describe("isInternalNote", () => {
  it("esconde a tag de idempotência da edge e mantém notas humanas", () => {
    expect(isInternalNote("saft_import:abc-123")).toBe(true);
    expect(isInternalNote("caiu ao chão")).toBe(false);
    expect(isInternalNote(null)).toBe(false);
  });
});

describe("groupUnmatched", () => {
  it("agrupa por código POS com contagem e quantidade total", () => {
    const groups = groupUnmatched([
      { pos_code: "401", pos_description: "POLVO LAGAR.", qty: 2 },
      { pos_code: "203", pos_description: "SAPATEIRA RECH", qty: 1 },
      { pos_code: "401", pos_description: null, qty: 3 },
    ]);
    expect(groups).toHaveLength(2);
    const g401 = groups.find((g) => g.posCode === "401");
    expect(g401).toMatchObject({
      posDescription: "POLVO LAGAR.",
      lineCount: 2,
      totalQty: 5,
    });
    expect(groups.map((g) => g.posCode)).toEqual(["203", "401"]);
  });
});
