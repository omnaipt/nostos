import { describe, expect, it } from "vitest";
import {
  lineBlockReason,
  packCostCentsFromInvoice,
  packEntryBaseCostCents,
  packEntryQty,
  packsFromDirectQty,
  packsOnArticleChange,
  parsePackFromText,
  proposeArticleForIngredient,
  proposeArticleFromRawName,
  proposeEntryFromAlias,
  proposeIngredientFromRawName,
  shouldOpenNewArticle,
  unconvertibleFormatMessage,
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

// ── Sprint 06 ───────────────────────────────────────────────────────────────

describe("packsFromDirectQty (item 1)", () => {
  it("24 un num artigo de 1 un -> 24 embalagens", () => {
    expect(packsFromDirectQty(24, { packQty: 1, packUnit: "un" }, "un")).toEqual({
      packs: "24",
      flagged: false,
    });
  });

  it("10 kg num artigo de 1 kg -> 10 embalagens", () => {
    expect(packsFromDirectQty(10, { packQty: 1, packUnit: "kg" }, "kg")).toEqual({
      packs: "10",
      flagged: false,
    });
  });

  it("10 l num artigo de 5 l -> 2 embalagens", () => {
    expect(packsFromDirectQty(10, { packQty: 5, packUnit: "l" }, "l")).toEqual({
      packs: "2",
      flagged: false,
    });
  });

  it("7 kg num artigo de 5 kg -> vazio e assinalado", () => {
    expect(packsFromDirectQty(7, { packQty: 5, packUnit: "kg" }, "kg")).toEqual({
      packs: "",
      flagged: true,
    });
  });

  it("sem quantidade -> vazio, sem assinalar (nunca por omissão 1)", () => {
    expect(packsFromDirectQty(null, { packQty: 5, packUnit: "l" }, "l")).toEqual({
      packs: "",
      flagged: false,
    });
    expect(packsFromDirectQty(0, { packQty: 5, packUnit: "l" }, "l")).toEqual({
      packs: "",
      flagged: false,
    });
  });

  it("formato não convertível -> vazio e assinalado", () => {
    expect(packsFromDirectQty(10, { packQty: 5, packUnit: "l" }, "kg")).toEqual({
      packs: "",
      flagged: true,
    });
  });
});

describe("packsOnArticleChange (item 1, fluxo da fatura)", () => {
  it("azeite 2 un (ingrediente em l) para artigo de 5 l -> 2 embalagens", () => {
    // A quantidade directa "2" é a contagem da fatura, não 2 litros: usa-se a
    // quantidade da fatura, não a conversão pelo conteúdo.
    expect(
      packsOnArticleChange({
        invoiceUnit: "un",
        invoiceQty: 2,
        directQty: 2,
        pack: { packQty: 5, packUnit: "l" },
        ingredientUnit: "l",
      }),
    ).toEqual({ packs: "2", flagged: false });
  });

  it("sem contexto de fatura cai na conversão pelo conteúdo (10 l / 5 l = 2)", () => {
    expect(
      packsOnArticleChange({
        invoiceUnit: undefined,
        invoiceQty: undefined,
        directQty: 10,
        pack: { packQty: 5, packUnit: "l" },
        ingredientUnit: "l",
      }),
    ).toEqual({ packs: "2", flagged: false });
  });
});

describe("shouldOpenNewArticle / lineBlockReason (item 2)", () => {
  it("abre novo artigo quando há conteúdo no nome e não há artigo", () => {
    expect(
      shouldOpenNewArticle({
        rawName: "AZEITE GALLO GARRAFAO 5L",
        invoiceUnit: "un",
        ingredientUnit: "l",
        hasArticle: false,
      }),
    ).toBe(true);
  });

  it("abre novo artigo quando a fatura vem em un para ingrediente em massa", () => {
    expect(
      shouldOpenNewArticle({
        rawName: "ATUM POSTA RAMIREZ",
        invoiceUnit: "un",
        ingredientUnit: "kg",
        hasArticle: false,
      }),
    ).toBe(true);
  });

  it("não abre quando já há artigo", () => {
    expect(
      shouldOpenNewArticle({
        rawName: "AZEITE GALLO 5L",
        invoiceUnit: "un",
        ingredientUnit: "l",
        hasArticle: true,
      }),
    ).toBe(false);
  });

  it("não abre em entrada directa simples (un para ingrediente em un)", () => {
    expect(
      shouldOpenNewArticle({
        rawName: "OVOS M",
        invoiceUnit: "un",
        ingredientUnit: "un",
        hasArticle: false,
      }),
    ).toBe(false);
  });

  it("bloqueia o registo quando a unidade da fatura não converte e não há artigo", () => {
    expect(
      lineBlockReason({ invoiceUnit: "un", ingredientUnit: "l", hasArticle: false }),
    ).toBe("Escolha ou crie o artigo, ou indique a quantidade em litros.");
  });

  it("não bloqueia quando há artigo ou a unidade converte", () => {
    expect(
      lineBlockReason({ invoiceUnit: "un", ingredientUnit: "l", hasArticle: true }),
    ).toBeNull();
    expect(
      lineBlockReason({ invoiceUnit: "l", ingredientUnit: "ml", hasArticle: false }),
    ).toBeNull();
    expect(
      lineBlockReason({ invoiceUnit: null, ingredientUnit: "l", hasArticle: false }),
    ).toBeNull();
  });
});

describe("packCostCentsFromInvoice (item 3)", () => {
  it("fatura em un -> o preço unitário é o preço por embalagem", () => {
    // azeite 2 × 19,90; arroz 10 × 1,29; atum 24 × 1,65.
    expect(packCostCentsFromInvoice({ invoiceUnit: "un", invoiceUnitCostCents: 1990 })).toBe(1990);
    expect(packCostCentsFromInvoice({ invoiceUnit: "un", invoiceUnitCostCents: 129 })).toBe(129);
    expect(packCostCentsFromInvoice({ invoiceUnit: "un", invoiceUnitCostCents: 165 })).toBe(165);
  });

  it("confirma o custo por unidade base com packEntryBaseCostCents", () => {
    // azeite: 1990 cents/embalagem, 5 l -> 398 cents/l
    expect(packEntryBaseCostCents(1990, 5, "l", "l")).toBe(398);
    // arroz: 129 cents/embalagem, 1 kg -> 129 cents/kg
    expect(packEntryBaseCostCents(129, 1, "kg", "kg")).toBe(129);
    // atum: 165 cents/embalagem, 1 un -> 165 cents/un
    expect(packEntryBaseCostCents(165, 1, "un", "un")).toBe(165);
  });

  it("sem preço ou unidade diferente de un -> null", () => {
    expect(packCostCentsFromInvoice({ invoiceUnit: "un", invoiceUnitCostCents: null })).toBeNull();
    expect(packCostCentsFromInvoice({ invoiceUnit: "l", invoiceUnitCostCents: 1990 })).toBeNull();
  });
});

describe("proposeIngredientFromRawName (item 4)", () => {
  it("'SAL MARINHO GROSSO 1KG' -> 'Sal marinho grosso', kg", () => {
    expect(proposeIngredientFromRawName("SAL MARINHO GROSSO 1KG")).toEqual({
      name: "Sal marinho grosso",
      unit: "kg",
    });
  });

  it("volume -> l; sem conteúdo -> un", () => {
    expect(proposeIngredientFromRawName("AZEITE V.EXTRA GALLO GARRAFAO 5L").unit).toBe("l");
    expect(proposeIngredientFromRawName("ARROZ CAROLINO CIGALA 1KG").unit).toBe("kg");
    expect(proposeIngredientFromRawName("COENTROS MOLHO")).toEqual({
      name: "Coentros molho",
      unit: "un",
    });
  });

  it("tira o formato do nome (não deixa o conteúdo)", () => {
    expect(proposeIngredientFromRawName("ARROZ CAROLINO CIGALA 1KG").name).not.toMatch(/1\s*kg/i);
    // a palavra de embalagem final também sai
    expect(proposeIngredientFromRawName("AZEITE V.EXTRA GALLO GARRAFAO 5L").name.toLowerCase()).not.toContain(
      "garrafao",
    );
  });
});

describe("proposeArticleForIngredient (item 5)", () => {
  it("ingrediente em un sem peso: conteúdo 1 un, formato lido do nome", () => {
    const atum = { name: "Atum", unit: "un", unit_weight_g: null };
    const d = proposeArticleForIngredient("ATUM POSTA AZEITE RAMIREZ 120G", atum);
    expect(d.packQty).toBe(1);
    expect(d.packUnit).toBe("un");
    expect(d.label).toContain("120 g");
    expect(d.brand).toBe("Ramirez");
  });

  it("azeite: conteúdo 5 l, marca Gallo, formato com a embalagem", () => {
    const azeite = { name: "Azeite", unit: "l", unit_weight_g: null };
    const d = proposeArticleForIngredient("AZEITE V.EXTRA GALLO GARRAFAO 5L", azeite);
    expect(d.packQty).toBe(5);
    expect(d.packUnit).toBe("l");
    expect(d.brand).toBe("Gallo");
    expect(d.label).toBe("Garrafão 5 L");
  });

  it("arroz: conteúdo 1 kg, marca Cigala, formato curto", () => {
    const arroz = { name: "Arroz carolino", unit: "kg", unit_weight_g: null };
    const d = proposeArticleForIngredient("ARROZ CAROLINO CIGALA 1KG", arroz);
    expect(d.packQty).toBe(1);
    expect(d.packUnit).toBe("kg");
    expect(d.brand).toBe("Cigala");
    expect(d.label).toBe("Embalagem 1 kg");
  });

  it("marca que faz parte do nome do ingrediente fica vazia", () => {
    const sal = { name: "Sal marinho grosso", unit: "kg", unit_weight_g: null };
    const d = proposeArticleForIngredient("SAL MARINHO GROSSO 1KG", sal);
    expect(d.packQty).toBe(1);
    expect(d.packUnit).toBe("kg");
    expect(d.brand).toBe("");
    expect(d.label).toBe("Embalagem 1 kg");
  });

  it("mensagem de formato não convertível diz o que fazer", () => {
    expect(unconvertibleFormatMessage("un")).toContain("conta-se em unidades");
    expect(unconvertibleFormatMessage("l")).toContain("mililitros ou litros");
    expect(unconvertibleFormatMessage("l")).toContain("peso médio");
  });
});
