import { unitFactor } from "@/lib/types";

// Lógica pura do consumo interno (Stock S2). Sem I/O: a pré-visualização do
// consumo por prato e a ordenação da fila "fichas por validar" vivem aqui para
// serem testáveis (padrão dos outros módulos lib/*.test.ts). A pré-visualização
// ESPELHA public.register_dish_consumption (0033): mesma regra de expansão da
// ficha, mesma lista de nao_abatidas. O servidor é a fonte de verdade; isto só
// mostra ao dono o que vai sair antes de gravar.

export const CONSUMPTION_REASONS = [
  { code: "pessoal", label: "Refeição do pessoal" },
  { code: "oferta", label: "Oferta da casa" },
  { code: "prova", label: "Prova / acerto de tempero" },
  { code: "outro", label: "Outro" },
] as const;
export type ConsumptionReason = (typeof CONSUMPTION_REASONS)[number]["code"];

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  CONSUMPTION_REASONS.map((r) => [r.code, r.label]),
);

// Motivos por que uma linha da ficha não gera abate, devolvidos pela RPC em
// nao_abatidas (e pela pré-visualização).
export const NAO_ABATIDA_MOTIVO_LABEL: Record<string, string> = {
  linha_livre: "Linha livre (sem ingrediente da despensa)",
  contagem: "Apurado na contagem",
  sem_conversao: "Unidade incompatível",
  quantidade_nula: "Quantidade residual",
};

export interface PreviewLine {
  ingredient_id: string | null;
  name: string;
  qty: number;
  unit: string;
}

export interface PreviewIngredient {
  id: string;
  name: string;
  unit: string;
  unit_weight_g?: number | null;
  depletion_mode?: string | null;
}

export interface AbatePreview {
  ingredientId: string;
  name: string;
  qty: number; // positivo (vai sair); a gravação põe o sinal negativo
  unit: string;
}

export interface NaoAbatida {
  name: string;
  motivo: string;
}

export interface DishConsumptionPreview {
  estimated: boolean; // a ficha está em rascunho
  abatidas: AbatePreview[];
  naoAbatidas: NaoAbatida[];
}

// Expande a ficha de um prato para p_portions doses, igual ao servidor: por
// cada linha ligada a um ingrediente calcula portions × qty ÷ servings
// convertido para a unidade do ingrediente. Linhas livres, ingredientes em
// modo contagem e conversões impossíveis voltam em naoAbatidas.
export function previewDishConsumption(
  sheet: { servings: number; status: string },
  lines: PreviewLine[],
  ingredientsById: Map<string, PreviewIngredient>,
  portions: number,
): DishConsumptionPreview {
  const servings = Math.max(sheet.servings || 1, 1);
  const estimated = sheet.status === "rascunho";
  const abatidas: AbatePreview[] = [];
  const naoAbatidas: NaoAbatida[] = [];

  for (const line of lines) {
    if (!line.ingredient_id) {
      naoAbatidas.push({ name: line.name, motivo: "linha_livre" });
      continue;
    }
    const ing = ingredientsById.get(line.ingredient_id);
    if (!ing) {
      // Ingrediente desconhecido no cliente (despensa desactualizada): trata-se
      // como sem conversão, para não afirmar um abate que o servidor recusaria.
      naoAbatidas.push({ name: line.name, motivo: "sem_conversao" });
      continue;
    }
    if ((ing.depletion_mode ?? "ficha") === "contagem") {
      naoAbatidas.push({ name: ing.name, motivo: "contagem" });
      continue;
    }
    const factor = unitFactor(line.unit, ing.unit, ing.unit_weight_g);
    if (factor == null) {
      naoAbatidas.push({ name: ing.name, motivo: "sem_conversao" });
      continue;
    }
    const qty = Math.round(((portions * line.qty) / servings) * factor * 1000) / 1000;
    if (qty <= 0) {
      naoAbatidas.push({ name: ing.name, motivo: "quantidade_nula" });
      continue;
    }
    abatidas.push({ ingredientId: ing.id, name: ing.name, qty, unit: ing.unit });
  }

  return { estimated, abatidas, naoAbatidas };
}

export interface FichaPorValidar {
  sheetId: string;
  menuItemId: string;
  name: string;
  unitsSold: number; // unidades vendidas nos últimos 90 dias
}

// Fila "fichas por validar": fichas em rascunho ordenadas pelas unidades
// vendidas do prato (desc), para o dono atacar primeiro as que mais pesam no
// stock. Empate: alfabético.
export function orderFichasPorValidar(
  draftSheets: { id: string; menu_item_id: string }[],
  itemNameById: Map<string, string>,
  unitsByItem: Map<string, number>,
): FichaPorValidar[] {
  return draftSheets
    .map((s) => ({
      sheetId: s.id,
      menuItemId: s.menu_item_id,
      name: itemNameById.get(s.menu_item_id) ?? "Prato sem nome",
      unitsSold: unitsByItem.get(s.menu_item_id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
      return a.name.localeCompare(b.name, "pt");
    });
}

// Total do consumo interno em cêntimos, ao custo médio corrente do ingrediente
// (ingredients.cost_per_unit_cents, por unidade base). Movimentos internal_use
// têm qty negativa; o valor usa o módulo. Ingredientes sem custo não contam.
export function internalUseTotalCents(
  movements: { ingredient_id: string; qty: number }[],
  costByIngredient: Map<string, number | null>,
): number {
  let cents = 0;
  for (const m of movements) {
    const cost = costByIngredient.get(m.ingredient_id);
    if (cost == null) continue;
    cents += Math.abs(m.qty) * cost;
  }
  return Math.round(cents);
}
