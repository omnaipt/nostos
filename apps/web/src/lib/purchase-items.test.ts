import { describe, expect, it } from "vitest";
import {
  packEntryBaseCostCents,
  packEntryQty,
  parsePackFromText,
  proposeArticleFromRawName,
  proposeEntryFromAlias,
} from "@/lib/purchase-items";

// Stock S1 (item 4): cálculo de embalagens e proposta de artigo a partir do
// alias. Caso-âncora da spec: "Azeite Gallo VE 5L, 2 un, 39,80 €" -> 10 l a
// 3,98 €/l (398 cents/l).

describe("packEntryQty", () => {
  it("2 embalagens de 5 l num ingrediente em l = 10 l", () => {
    expect(packEntryQty(2, 5, "l", "l")).toBe(10);
  });

  it("2 embalagens de 5 l num ingrediente em ml = 10000 ml", () => {
    expect(packEntryQty(2, 5, "l", "ml")).toBe(10000);
  });

  it("3 embalagens de 1 kg num ingrediente em g = 3000 g", () => {
    expect(packEntryQty(3, 1, "kg", "g")).toBe(3000);
  });

  it("un contra peso médio: 2 caixas de 6 un num ingrediente em g a 150 g/un = 1800 g", () => {
    expect(packEntryQty(2, 6, "un", "g", 150)).toBe(1800);
  });

  it("formato incompatível (l num ingrediente em kg) => null", () => {
    expect(packEntryQty(2, 5, "l", "kg")).toBeNull();
  });

  it("packs/pack_qty inválidos => null", () => {
    expect(packEntryQty(0, 5, "l", "l")).toBeNull();
    expect(packEntryQty(2, 0, "l", "l")).toBeNull();
  });
});

describe("packEntryBaseCostCents", () => {
  it("garrafão de 5 l a 1990 cents = 398 cents/l", () => {
    expect(packEntryBaseCostCents(1990, 5, "l", "l")).toBe(398);
  });

  it("garrafão de 5 l a 1990 cents num ingrediente em ml = 0,398 cents/ml", () => {
    expect(packEntryBaseCostCents(1990, 5, "l", "ml")).toBeCloseTo(0.398, 5);
  });

  it("sem custo => null", () => {
    expect(packEntryBaseCostCents(null, 5, "l", "l")).toBeNull();
  });
});

describe("parsePackFromText / proposeArticleFromRawName", () => {
  it("lê 5L", () => {
    expect(parsePackFromText("Azeite Gallo VE 5L")).toEqual({ packQty: 5, packUnit: "l" });
  });

  it("lê 750 ml e 1kg e 500g", () => {
    expect(parsePackFromText("Leite meio-gordo 750 ml")).toEqual({ packQty: 750, packUnit: "ml" });
    expect(parsePackFromText("Farinha T65 1kg")).toEqual({ packQty: 1, packUnit: "kg" });
    expect(parsePackFromText("Sal fino 500g")).toEqual({ packQty: 500, packUnit: "g" });
  });

  it("lê vírgula decimal e 'lt' como litro", () => {
    expect(parsePackFromText("Vinho tinto 0,75 lt")).toEqual({ packQty: 0.75, packUnit: "l" });
  });

  it("sem par número+unidade => null", () => {
    expect(parsePackFromText("Coentros molho")).toBeNull();
  });

  it("proposta preenche label e conteúdo, deixa marca para editar", () => {
    const d = proposeArticleFromRawName("Azeite Gallo VE 5L");
    expect(d.label).toBe("Azeite Gallo VE 5L");
    expect(d.packQty).toBe(5);
    expect(d.packUnit).toBe("l");
    expect(d.brand).toBe("");
  });
});

describe("proposeEntryFromAlias", () => {
  const purchaseItem = { id: "pi-1", pack_qty: 5, pack_unit: "l" };

  it("caso-âncora: 2 un do garrafão de 5 l a 1990 cents/un -> 10 l a 398 cents/l", () => {
    const p = proposeEntryFromAlias({
      invoiceQty: 2,
      costPerPackCents: 1990,
      purchaseItem,
      ingredientUnit: "l",
    });
    expect(p).not.toBeNull();
    expect(p?.purchaseItemId).toBe("pi-1");
    expect(p?.packs).toBe(2);
    expect(p?.qty).toBe(10);
    expect(p?.baseCostCents).toBe(398);
  });

  it("mesmo artigo num ingrediente em ml -> 10000 ml", () => {
    const p = proposeEntryFromAlias({
      invoiceQty: 2,
      costPerPackCents: null,
      purchaseItem,
      ingredientUnit: "ml",
    });
    expect(p?.qty).toBe(10000);
    expect(p?.baseCostCents).toBeNull();
  });

  it("formato incompatível => null", () => {
    const p = proposeEntryFromAlias({
      invoiceQty: 2,
      costPerPackCents: 1990,
      purchaseItem,
      ingredientUnit: "kg",
    });
    expect(p).toBeNull();
  });
});
