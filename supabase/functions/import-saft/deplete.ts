// Lógica PURA do abate do SAF-T: conversão de unidades e agregação da explosão
// das fichas técnicas em movimentos de stock. Módulo partilhado (padrão
// parse-invoice/match.ts): a edge importa-o via ./deplete.ts e o vitest via
// caminho relativo — uma só implementação.
//
// Stock S2 (0033): dois comportamentos novos face ao S1, isolados aqui para
// serem testáveis sem Deno nem base de dados:
//   - estimated: um abate sale_depletion fica marcado como estimado quando a
//     ficha do prato está em rascunho. Agregando por (fatura, ingrediente), o
//     abate é estimado se ALGUMA das fichas que contribuem estiver em rascunho.
//   - modo de consumo: ingredientes em modo contagem NÃO abatem; voltam numa
//     lista própria (consumoPorContagem), ao lado do unitMismatch do S1.

// Conversão de unidades (Stock S1). Tabela de casos ÚNICA, partilhada com
// apps/web/src/lib/types.ts (unitFactor) e public.unit_factor da 0032:
//   g↔kg, ml↔l                -> ×0.001 / ×1000
//   un→g/kg (com peso médio w)-> w / (w/1000)
//   g/kg→un (com peso médio w)-> 1/w / (1000/w)
//   massa↔volume, un sem peso -> null (sem conversão possível)
export function unitFactor(from: string, to: string, unitWeightG?: number | null): number | null {
  if (from === to) return 1;
  if (from === "g" && to === "kg") return 0.001;
  if (from === "kg" && to === "g") return 1000;
  if (from === "ml" && to === "l") return 0.001;
  if (from === "l" && to === "ml") return 1000;
  if (unitWeightG == null || unitWeightG <= 0) return null;
  if (from === "un" && to === "g") return unitWeightG;
  if (from === "un" && to === "kg") return unitWeightG * 0.001;
  if (from === "g" && to === "un") return 1 / unitWeightG;
  if (from === "kg" && to === "un") return 1000 / unitWeightG;
  return null;
}

// Converte a qty da linha da ficha para a unidade do ingrediente (exigida pelos
// movimentos, 0011). null quando a conversão não é possível.
export function toIngredientUnit(
  qty: number,
  from: string,
  to: string,
  unitWeightG?: number | null,
): number | null {
  const factor = unitFactor(from, to, unitWeightG);
  return factor == null ? null : qty * factor;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

export interface SheetLine {
  ingredient_id: string | null;
  qty: number | string;
  unit: string;
}

export interface Sheet {
  menu_item_id: string;
  servings: number;
  status: string; // 'rascunho' | 'validada'
  tech_sheet_ingredients: SheetLine[];
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unit_weight_g?: number | null;
  depletion_mode?: string | null; // 'ficha' | 'contagem'
}

export interface MatchedLine {
  invoice_no: string;
  qty: number;
  menu_item_id: string;
}

export interface Depletion {
  ingredientId: string;
  invoiceNo: string;
  qty: number; // positivo acumulado; o movimento grava-o negativo
  unit: string;
  estimated: boolean;
}

export interface DepletionResult {
  depletions: Depletion[];
  unitMismatch: string[];
  consumoPorContagem: string[];
}

// Agrega os abates por (fatura, ingrediente): source_ref = invoice_no (contrato
// 0012) sem gerar uma linha por cada ingrediente de cada linha de venda.
export function computeDepletions(
  matched: MatchedLine[],
  sheetByItem: Map<string, Sheet>,
  ingById: Map<string, Ingredient>,
): DepletionResult {
  const depletion = new Map<string, Depletion>();
  const unitMismatch = new Set<string>();
  const consumoPorContagem = new Set<string>();

  for (const line of matched) {
    const sheet = sheetByItem.get(line.menu_item_id);
    if (!sheet) continue;
    const servings = Math.max(Number(sheet.servings) || 1, 1);
    const isDraft = sheet.status === "rascunho";
    for (const si of asArray(sheet.tech_sheet_ingredients)) {
      if (!si.ingredient_id) continue; // linha livre, sem despensa
      const ing = ingById.get(si.ingredient_id);
      if (!ing) continue;
      // Modo contagem: não abate por vendas; apura-se na contagem (Sprint 06).
      if ((ing.depletion_mode ?? "ficha") === "contagem") {
        consumoPorContagem.add(ing.name);
        continue;
      }
      const converted = toIngredientUnit(
        Number(si.qty),
        String(si.unit),
        String(ing.unit),
        ing.unit_weight_g != null ? Number(ing.unit_weight_g) : null,
      );
      if (converted == null) {
        unitMismatch.add(ing.name);
        continue;
      }
      const used = (Number(line.qty) * converted) / servings;
      const key = `${line.invoice_no}|${si.ingredient_id}`;
      const cur = depletion.get(key);
      if (cur) {
        cur.qty += used;
        cur.estimated = cur.estimated || isDraft;
      } else {
        depletion.set(key, {
          ingredientId: si.ingredient_id,
          invoiceNo: line.invoice_no,
          qty: used,
          unit: String(ing.unit),
          estimated: isDraft,
        });
      }
    }
  }

  return {
    depletions: [...depletion.values()],
    unitMismatch: [...unitMismatch],
    consumoPorContagem: [...consumoPorContagem],
  };
}
