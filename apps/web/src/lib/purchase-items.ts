// Artigos de compra (Stock S1, public.purchase_items da 0032): cálculos puros
// partilhados pela UI de entradas/despensa e pelos testes. A conversão usa a
// mesma unitFactor da ficha técnica (lib/types.ts), espelho de public.unit_factor.

import { unitFactor } from "@/lib/types";

// Quantidade na unidade do ingrediente para `packs` embalagens de um artigo
// (pack_qty + pack_unit). null quando packs/pack_qty inválidos ou o formato não
// é convertível para a unidade do ingrediente (a guarda da 0032 rejeitaria).
export function packEntryQty(
  packs: number,
  packQty: number,
  packUnit: string,
  ingredientUnit: string,
  ingredientUnitWeightG?: number | null,
): number | null {
  if (!Number.isFinite(packs) || packs <= 0) return null;
  if (!Number.isFinite(packQty) || packQty <= 0) return null;
  const factor = unitFactor(packUnit, ingredientUnit, ingredientUnitWeightG);
  if (factor == null) return null;
  return packs * packQty * factor;
}

// Custo por unidade base (a do ingrediente) a partir do custo de UMA embalagem
// s/IVA. Divide pelo conteúdo convertido (pack_qty × factor). null sem custo ou
// quando o formato não é convertível.
export function packEntryBaseCostCents(
  costPerPackCents: number | null,
  packQty: number,
  packUnit: string,
  ingredientUnit: string,
  ingredientUnitWeightG?: number | null,
): number | null {
  if (costPerPackCents == null || costPerPackCents < 0) return null;
  if (!Number.isFinite(packQty) || packQty <= 0) return null;
  const factor = unitFactor(packUnit, ingredientUnit, ingredientUnitWeightG);
  if (factor == null || factor === 0) return null;
  return costPerPackCents / (packQty * factor);
}

// Conteúdo (pack_qty + pack_unit) lido de um texto livre do formato, por exemplo
// "Azeite Gallo VE 5L" -> { packQty: 5, packUnit: "l" }, "Farinha 1kg" -> 1 kg,
// "Leite 750 ml" -> 750 ml. null quando não há um par número+unidade legível.
// Só as unidades do domínio (g, kg, ml, l); cl e outras ficam para edição manual.
export function parsePackFromText(
  text: string,
): { packQty: number; packUnit: "g" | "kg" | "ml" | "l" } | null {
  const m = text
    .toLowerCase()
    .match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|lt|l)\b/);
  if (!m) return null;
  const qty = Number(m[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const raw = m[2];
  const packUnit = raw === "lt" ? "l" : (raw as "g" | "kg" | "ml" | "l");
  return { packQty: qty, packUnit };
}

export interface ArticleDraft {
  brand: string;
  label: string;
  packQty: number | null;
  packUnit: "g" | "kg" | "ml" | "l" | "un" | null;
}

// Proposta de artigo a partir do nome do produto na fatura (o que parse-invoice
// devolve). Preenche o que consegue ler; o resto fica para o dono editar antes
// de confirmar. label = texto livre do formato (o próprio nome da linha).
export function proposeArticleFromRawName(rawName: string): ArticleDraft {
  const label = rawName.trim();
  const pack = parsePackFromText(label);
  return {
    brand: "",
    label,
    packQty: pack?.packQty ?? null,
    packUnit: pack?.packUnit ?? null,
  };
}

export interface AliasEntryProposal {
  purchaseItemId: string;
  packs: number;
  qty: number; // na unidade do ingrediente
  baseCostCents: number | null; // custo por unidade base
}

// Proposta de entrada a partir de um alias já ligado a um artigo (segunda fatura
// do mesmo fornecedor com o mesmo nome de linha): mesmo artigo, mesmas
// embalagens, sem intervenção. invoiceQty é o nº de embalagens da linha.
export function proposeEntryFromAlias(args: {
  invoiceQty: number;
  costPerPackCents: number | null;
  purchaseItem: { id: string; pack_qty: number; pack_unit: string };
  ingredientUnit: string;
  ingredientUnitWeightG?: number | null;
}): AliasEntryProposal | null {
  const packs = args.invoiceQty;
  const qty = packEntryQty(
    packs,
    args.purchaseItem.pack_qty,
    args.purchaseItem.pack_unit,
    args.ingredientUnit,
    args.ingredientUnitWeightG,
  );
  if (qty == null) return null;
  const baseCostCents = packEntryBaseCostCents(
    args.costPerPackCents,
    args.purchaseItem.pack_qty,
    args.purchaseItem.pack_unit,
    args.ingredientUnit,
    args.ingredientUnitWeightG,
  );
  return { purchaseItemId: args.purchaseItem.id, packs, qty, baseCostCents };
}
