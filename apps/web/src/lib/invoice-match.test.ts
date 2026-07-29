import { describe, expect, it } from "vitest";
// Módulo puro PARTILHADO com a edge parse-invoice — uma só implementação
// (prompt §aliases: "a MESMA função de normalização, num módulo puro partilhado").
import {
  matchLine,
  norm,
  normalizeUnit,
  type ParsedLine,
} from "../../../../supabase/functions/parse-invoice/match";

const CATALOG = [
  { id: "coentros", name: "Coentros (molho)", unit: "un" },
  { id: "salsa", name: "Salsa (molho)", unit: "un" },
  { id: "polvo", name: "Polvo fresco", unit: "kg" },
  { id: "gelado", name: "Gelado baunilha", unit: "l" },
  { id: "azeite", name: "Azeite virgem extra", unit: "l" },
];

function line(partial: Partial<ParsedLine>): ParsedLine {
  return {
    raw_name: "x",
    qty: 1,
    unit: "un",
    unit_cost_cents_ex_vat: 100,
    confidence: "alta",
    note: null,
    catalog_match: null,
    ...partial,
  };
}

describe("norm / normalizeUnit", () => {
  it("normaliza acentos, caixa e espaços", () => {
    expect(norm("  Coentros  (Molho)! ")).toBe("coentros molho");
    expect(norm("AZEITE Vírgem")).toBe("azeite virgem");
  });

  it("unidades PT e ES inequívocas; ambíguas a null", () => {
    expect(normalizeUnit("KGS")).toBe("kg");
    expect(normalizeUnit("UD")).toBe("un");
    expect(normalizeUnit("gramos")).toBe("g");
    expect(normalizeUnit("Litros")).toBe("l");
    expect(normalizeUnit("caixa de 6")).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe("cascata de matching", () => {
  it("a) alias do fornecedor decide — VERDE, vence a contenção", () => {
    // "molho de coentros" contém "coentros"? contenção apanharia coentros e
    // salsa não — mas o alias tem de vencer SEM olhar ao texto.
    const aliases = [{ raw_name_norm: "molho de coentros", ingredient_id: "salsa" }];
    const r = matchLine(line({ raw_name: "Molho de Coentros" }), CATALOG, aliases);
    expect(r.ingredient_id).toBe("salsa"); // o que o dono escolheu, não o texto
    expect(r.match_kind).toBe("alias");
    expect(r.match_grade).toBe("verde");
  });

  it("b) norma exacta — VERDE", () => {
    const r = matchLine(line({ raw_name: "coentros (molho)" }), CATALOG, []);
    expect(r.ingredient_id).toBe("coentros");
    expect(r.match_kind).toBe("exact");
    expect(r.match_grade).toBe("verde");
  });

  it("c) contenção única — ÂMBAR, nunca auto (aceitação 5: gel vs gelado)", () => {
    const r = matchLine(line({ raw_name: "Gel baunilha", unit: "l" }), CATALOG, []);
    // "gel baunilha" está contido em "gelado baunilha"? norm("gel baunilha")
    // não é substring de norm("gelado baunilha") — sem contenção → vazio.
    // O caso perigoso NUNCA chega a verde.
    expect(r.match_grade === "verde").toBe(false);
  });

  it("c) contenção única aplica em ÂMBAR quando existe uma só", () => {
    const r = matchLine(line({ raw_name: "Polvo", unit: "kg" }), CATALOG, []);
    expect(r.ingredient_id).toBe("polvo");
    expect(r.match_kind).toBe("containment");
    expect(r.match_grade).toBe("ambar");
  });

  it("c) contenção ambígua NÃO aplica", () => {
    const r = matchLine(line({ raw_name: "molho" }), CATALOG, []);
    // "molho" contido em coentros (molho) E salsa (molho) → ambíguo → vazio.
    expect(r.ingredient_id).toBeNull();
    expect(r.match_kind).toBe("none");
  });

  it("d) sugestão do modelo — ÂMBAR, resolvida por norma exacta", () => {
    const r = matchLine(
      line({ raw_name: "PULPO FRESCO GALICIA", unit: "kg", catalog_match: "Polvo fresco" }),
      CATALOG,
      [],
    );
    expect(r.ingredient_id).toBe("polvo");
    expect(r.match_kind).toBe("model");
    expect(r.match_grade).toBe("ambar");
  });

  it("e) nada — select vazio com raw_name", () => {
    const r = matchLine(line({ raw_name: "Detergente lava-tudo" }), CATALOG, []);
    expect(r.ingredient_id).toBeNull();
    expect(r.match_grade).toBeNull();
    expect(r.raw_name).toBe("Detergente lava-tudo");
  });
});

describe("guarda de unidade", () => {
  it("unidade igual: verde mantém-se, valores directos", () => {
    const r = matchLine(
      line({ raw_name: "Polvo fresco", unit: "kg", qty: 12, unit_cost_cents_ex_vat: 980 }),
      CATALOG,
      [],
    );
    expect(r.match_grade).toBe("verde");
    expect(r.fill_qty).toBe(12);
    expect(r.fill_unit).toBe("kg");
    expect(r.fill_cost_cents).toBe(980);
  });

  it("mesma família (kg→g? catálogo em kg, fatura em g): conversão exacta, despromove p/ ÂMBAR", () => {
    const r = matchLine(
      line({ raw_name: "Polvo fresco", unit: "g", qty: 12000, unit_cost_cents_ex_vat: 1 }),
      CATALOG,
      [],
    );
    expect(r.match_grade).toBe("ambar");
    expect(r.fill_qty).toBe(12);
    expect(r.fill_unit).toBe("kg");
    expect(r.fill_cost_cents).toBe(1000); // 1 c/g = 1000 c/kg
    expect(r.unit_warning).toContain("convertido");
  });

  it("famílias diferentes: ÂMBAR com note, sem conversão à sorte (aceitação 5)", () => {
    const r = matchLine(
      line({ raw_name: "Coentros (molho)", unit: "kg", qty: 2 }),
      CATALOG,
      [],
    );
    expect(r.ingredient_id).toBe("coentros");
    expect(r.match_grade).toBe("ambar");
    expect(r.unit_warning).toContain("sem conversão");
    expect(r.fill_qty).toBeNull();
    expect(r.fill_cost_cents).toBeNull();
  });

  it("unidade não lida: despromove p/ ÂMBAR com aviso", () => {
    const r = matchLine(
      line({ raw_name: "Polvo fresco", unit: null, qty: 12 }),
      CATALOG,
      [],
    );
    expect(r.match_grade).toBe("ambar");
    expect(r.unit_warning).toContain("confirmar");
    expect(r.fill_qty).toBe(12);
  });
});
