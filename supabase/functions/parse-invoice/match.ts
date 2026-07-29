// Lógica PURA do parse de faturas: normalização, cascata de matching e guarda
// de unidade. Módulo partilhado (prompt §aliases): a edge importa-o via
// ./match.ts e o frontend/vitest via caminho relativo — uma só implementação.
//
// Regra de ouro (David 29-07): semelhança de texto nunca DECIDE, só sugere;
// o que decide é o alias aprendido da confirmação do dono. Cascata, parando
// no primeiro hit:
//   a) alias do fornecedor (determinístico)      → VERDE, auto-aplicado
//   b) norma exacta contra o catálogo            → VERDE
//   c) contenção ÚNICA (padrão sommelier v3)     → ÂMBAR (pede confirmação;
//      "gel baunilha" vs "gelado baunilha" cai aqui ou abaixo, NUNCA em auto)
//   d) sugestão do modelo (catalog_match)        → ÂMBAR
//   e) nada                                      → select vazio, raw_name visível
// Guarda de unidade: linha ≠ catálogo → despromove para ÂMBAR com note; a
// conversão kg↔g / l↔ml é matemática exacta e entra como PRÉ-preenchimento
// (sempre âmbar, o dono confirma); famílias diferentes nunca se convertem.
// Factores de conversão por alias (ex.: caixa=24un) ficam para a v2.

export interface CatalogIngredient {
  id: string;
  name: string;
  unit: string; // g | kg | ml | l | un
}

export interface SupplierAlias {
  raw_name_norm: string;
  ingredient_id: string;
}

export interface ParsedLine {
  raw_name: string;
  qty: number | null;
  unit: string | null;
  unit_cost_cents_ex_vat: number | null;
  confidence: "alta" | "media" | "baixa";
  note: string | null;
  // Sugestão do modelo (nível d): nome EXACTO do catálogo fornecido no prompt,
  // só quando o modelo tem confiança; null caso contrário.
  catalog_match: string | null;
}

export type MatchKind = "alias" | "exact" | "containment" | "model" | "none";

export interface MatchedLine extends ParsedLine {
  ingredient_id: string | null;
  ingredient_name: string | null;
  match_kind: MatchKind;
  /** verde = auto-aplicado; ambar = pré-seleccionado, pede confirmação. */
  match_grade: "verde" | "ambar" | null;
  unit_warning: string | null;
  // Valores prontos a pré-preencher, já na unidade do CATÁLOGO.
  fill_qty: number | null;
  fill_unit: string | null;
  fill_cost_cents: number | null;
}

// Mesma normalização do sommelier (lib/sommelier.ts): lowercase, sem acentos,
// espaços colapsados.
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Unidades da fatura → unidades do sistema (0011). Cobre variantes PT e ES
// (as faturas Makro do David vêm em espanhol). Inequívoco ou null.
const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", quilo: "kg", quilos: "kg",
  g: "g", gr: "g", grs: "g", grama: "g", gramas: "g", gramo: "g", gramos: "g",
  l: "l", lt: "l", lts: "l", litro: "l", litros: "l",
  ml: "ml",
  un: "un", und: "un", unid: "un", unidad: "un", unidade: "un",
  unidades: "un", ud: "un", uds: "un", pc: "un", pcs: "un", pza: "un",
};

export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = norm(raw);
  return UNIT_ALIASES[n] ?? null;
}

function family(u: string): "mass" | "vol" | "count" | null {
  if (u === "g" || u === "kg") return "mass";
  if (u === "ml" || u === "l") return "vol";
  if (u === "un") return "count";
  return null;
}

interface CascadeHit {
  ingredient: CatalogIngredient;
  kind: MatchKind;
  grade: "verde" | "ambar";
}

function runCascade(
  line: ParsedLine,
  catalog: CatalogIngredient[],
  aliases: SupplierAlias[],
): CascadeHit | null {
  const n = norm(line.raw_name);
  if (!n) return null;
  const byId = new Map(catalog.map((c) => [c.id, c]));

  // a) alias do fornecedor — determinístico, decide.
  const alias = aliases.find((a) => a.raw_name_norm === n);
  if (alias) {
    const ing = byId.get(alias.ingredient_id);
    if (ing) return { ingredient: ing, kind: "alias", grade: "verde" };
  }

  // b) norma exacta.
  const exact = catalog.find((c) => norm(c.name) === n);
  if (exact) return { ingredient: exact, kind: "exact", grade: "verde" };

  // c) contenção ÚNICA — sugere, não decide.
  const contained = catalog.filter((c) => {
    const cn = norm(c.name);
    return cn.length > 0 && (cn.includes(n) || n.includes(cn));
  });
  if (contained.length === 1) {
    return { ingredient: contained[0], kind: "containment", grade: "ambar" };
  }

  // d) sugestão do modelo, resolvida por norma exacta contra o catálogo.
  if (line.catalog_match) {
    const mn = norm(line.catalog_match);
    const suggested = catalog.find((c) => norm(c.name) === mn);
    if (suggested) return { ingredient: suggested, kind: "model", grade: "ambar" };
  }

  return null;
}

// Compõe a linha final: cascata + guarda de unidade + pré-preenchimento.
export function matchLine(
  line: ParsedLine,
  catalog: CatalogIngredient[],
  aliases: SupplierAlias[],
): MatchedLine {
  const hit = runCascade(line, catalog, aliases);
  if (!hit) {
    return {
      ...line,
      ingredient_id: null,
      ingredient_name: null,
      match_kind: "none",
      match_grade: null,
      unit_warning: null,
      fill_qty: null,
      fill_unit: null,
      fill_cost_cents: null,
    };
  }

  const ing = hit.ingredient;
  let grade: "verde" | "ambar" = hit.grade;
  let warning: string | null = null;
  let fillQty = line.qty;
  let fillCost = line.unit_cost_cents_ex_vat;
  let fillUnit: string | null = ing.unit;

  if (line.unit == null) {
    // Sem unidade lida: assume-se a do catálogo mas pede confirmação.
    grade = "ambar";
    warning = "unidade não lida da fatura — confirmar quantidade";
  } else if (line.unit !== ing.unit) {
    const from = family(line.unit);
    const to = family(ing.unit);
    if (from && to && from === to) {
      // Conversão exacta (×1000) como pré-preenchimento; sempre âmbar.
      const factor = line.unit === "kg" || line.unit === "l" ? 1000 : 1 / 1000;
      fillQty = line.qty != null ? Math.round(line.qty * factor * 1000) / 1000 : null;
      fillCost = line.unit_cost_cents_ex_vat != null
        ? Math.round((line.unit_cost_cents_ex_vat / factor) * 10000) / 10000
        : null;
      grade = "ambar";
      warning = `fatura em ${line.unit} → convertido para ${ing.unit}`;
    } else {
      // Famílias diferentes: nunca converter à sorte.
      grade = "ambar";
      warning = `fatura em ${line.unit}, catálogo em ${ing.unit} — sem conversão`;
      fillQty = null;
      fillCost = null;
      fillUnit = null;
    }
  }

  return {
    ...line,
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    match_kind: hit.kind,
    match_grade: grade,
    unit_warning: warning,
    fill_qty: fillQty,
    fill_unit: fillUnit,
    fill_cost_cents: fillCost,
  };
}
