import type { Ingredient, SaftImportLine } from "@/lib/types";

// Lógica pura da Despensa + conciliação SAF-T (0011/0012). Sem I/O: tudo o
// que se calcula a partir dos dados vive aqui para ser testável (padrão dos
// outros módulos lib/*.test.ts).

// Abaixo do mínimo só conta quando há mínimo definido. Saldo igual ao mínimo
// ainda é "ok" (o alerta é para faltas, não para o limiar exacto).
export function isBelowMin(i: Pick<Ingredient, "stock_qty" | "low_stock_threshold">): boolean {
  return i.low_stock_threshold != null && i.stock_qty < i.low_stock_threshold;
}

export interface PantrySummary {
  belowMinCount: number;
  stockValueCents: number;
}

// Valor em stock = Σ saldo × custo/unidade. Saldos negativos são anomalias
// (abate além do existente) e não subtraem valor; ingredientes sem custo não
// contam. numeric(12,4) nos cêntimos, arredondamos no fim.
export function computePantrySummary(
  ingredients: Pick<Ingredient, "stock_qty" | "low_stock_threshold" | "cost_per_unit_cents">[],
): PantrySummary {
  let value = 0;
  let below = 0;
  for (const i of ingredients) {
    if (isBelowMin(i)) below += 1;
    if (i.cost_per_unit_cents != null && i.stock_qty > 0) {
      value += i.stock_qty * i.cost_per_unit_cents;
    }
  }
  return { belowMinCount: below, stockValueCents: Math.round(value) };
}

// Ordenação da lista: quem precisa de reposição primeiro, depois alfabético.
export function sortPantry<T extends Pick<Ingredient, "name" | "stock_qty" | "low_stock_threshold">>(
  ingredients: T[],
): T[] {
  return [...ingredients].sort((a, b) => {
    const belowA = isBelowMin(a) ? 0 : 1;
    const belowB = isBelowMin(b) ? 0 : 1;
    if (belowA !== belowB) return belowA - belowB;
    return a.name.localeCompare(b.name, "pt");
  });
}

// Quantidades numeric(14,3): pt-PT, até 3 casas, sem zeros à direita a mais.
export function formatQty(qty: number): string {
  return qty.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

// Sinal explícito para o rasto de movimentos ("+12" entra, "−7" sai).
export function formatSignedQty(qty: number): string {
  const abs = formatQty(Math.abs(qty));
  return qty >= 0 ? `+${abs}` : `−${abs}`;
}

export const MOVEMENT_KIND_LABEL: Record<string, string> = {
  purchase: "Entrada",
  sale_depletion: "Abate de venda",
  waste: "Quebra",
  adjustment: "Ajuste",
};

// A edge marca os movimentos do lote com note='saft_import:<id>' para a
// idempotência; é rasto interno, não se mostra ao dono.
export function isInternalNote(note: string | null): boolean {
  return note != null && note.startsWith("saft_import:");
}

// Fila de conciliação: as linhas unmatched agrupam-se por código POS. O dono
// concilia o CÓDIGO uma vez (cria pos_product_map) e todas as linhas desse
// código casam de seguida.
export interface UnmatchedGroup {
  posCode: string;
  posDescription: string | null;
  lineCount: number;
  totalQty: number;
}

export function groupUnmatched(
  lines: Pick<SaftImportLine, "pos_code" | "pos_description" | "qty">[],
): UnmatchedGroup[] {
  const byCode = new Map<string, UnmatchedGroup>();
  for (const l of lines) {
    const code = l.pos_code ?? "";
    const g = byCode.get(code);
    if (g) {
      g.lineCount += 1;
      g.totalQty += l.qty;
      if (!g.posDescription && l.pos_description) g.posDescription = l.pos_description;
    } else {
      byCode.set(code, {
        posCode: code,
        posDescription: l.pos_description,
        lineCount: 1,
        totalQty: l.qty,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => a.posCode.localeCompare(b.posCode, "pt"));
}
