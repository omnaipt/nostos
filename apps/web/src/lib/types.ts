// Tipos de domínio STOA (vertical Restaurantes) — modelo Fase 1: mesas + turnos.
//
// As FORMAS das tabelas vêm agora dos tipos GERADOS por
// `supabase gen types typescript` (integrations/supabase/database.types.ts),
// que são a fonte de verdade do schema. Aqui só:
//   1. Damos aliases de domínio (Restaurant, RestaurantTable, ...) sobre as Row
//      geradas, estreitando campos `string` para os literais de domínio
//      (status, assignment_mode) — o Postgres CHECK não gera enum em TS.
//   2. Exportamos aliases Insert/Update para o wiring (#4) usar nas mutações.
//   3. Mantemos as constantes/helpers de UI (WEEKDAYS, labels, isoWeekdayOf).
//
// Regenerar tipos: `supabase gen types typescript --project-id emuwqkdummdmacnkltte`.

import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/database.types";

export type ReservationStatus =
  | "pendente"
  | "confirmada"
  | "sentada"
  | "cancelada"
  | "no_show";

// Dias da semana ISO-8601: 1 = Segunda ... 7 = Domingo (igual ao schema: turns.weekdays int[]).
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── Restaurante (public.restaurants) ────────────────────────────────────────
export type Restaurant = Omit<Tables<"restaurants">, "assignment_mode"> & {
  assignment_mode: "manual" | "auto"; // Fase 1 = sempre 'manual'
};
export type RestaurantInsert = TablesInsert<"restaurants">;
export type RestaurantUpdate = TablesUpdate<"restaurants">;

// ── Mesa (public.tables) ────────────────────────────────────────────────────
export type RestaurantTable = Tables<"tables">;
export type RestaurantTableInsert = TablesInsert<"tables">;
export type RestaurantTableUpdate = TablesUpdate<"tables">;

// ── Turno (public.turns) ────────────────────────────────────────────────────
// weekdays gerado como number[]; estreitamos para IsoWeekday[] no domínio.
export type Turn = Omit<Tables<"turns">, "weekdays"> & {
  weekdays: IsoWeekday[];
};
export type TurnInsert = TablesInsert<"turns">;
export type TurnUpdate = TablesUpdate<"turns">;

// ── Cliente (public.customers) ──────────────────────────────────────────────
export type Customer = Tables<"customers">;
export type CustomerInsert = TablesInsert<"customers">;
export type CustomerUpdate = TablesUpdate<"customers">;

// ── Reserva (public.reservations) ───────────────────────────────────────────
// Atribuição Fase 1: turno OBRIGATÓRIO no fluxo da app (schema permite null
// para reservas órfãs); mesa OPCIONAL (null => POR ATRIBUIR). status estreitado.
export type Reservation = Omit<Tables<"reservations">, "status"> & {
  status: ReservationStatus;
};
export type ReservationInsert = TablesInsert<"reservations">;
export type ReservationUpdate = TablesUpdate<"reservations">;

export const WEEKDAYS: { key: IsoWeekday; label: string; short: string }[] = [
  { key: 1, label: "Segunda", short: "Seg" },
  { key: 2, label: "Terça", short: "Ter" },
  { key: 3, label: "Quarta", short: "Qua" },
  { key: 4, label: "Quinta", short: "Qui" },
  { key: 5, label: "Sexta", short: "Sex" },
  { key: 6, label: "Sábado", short: "Sáb" },
  { key: 7, label: "Domingo", short: "Dom" },
];

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  sentada: "Sentada",
  cancelada: "Cancelada",
  no_show: "No-show",
};

// Estados que contam para a ocupação/resumo do turno (exclui cancelada/no_show).
export const STATUSES_COUNTING_FOR_OCCUPANCY: ReservationStatus[] = [
  "pendente",
  "confirmada",
  "sentada",
];

// JS Date.getDay(): 0=Domingo..6=Sábado. Converte para ISO 1..7.
export function isoWeekdayOf(date: Date): IsoWeekday {
  const js = date.getDay();
  return (js === 0 ? 7 : js) as IsoWeekday;
}

// ── Menu Digital (public.menu_categories / public.menu_items) ────────────────
export type MenuCategory = Tables<"menu_categories">;
export type MenuCategoryInsert = TablesInsert<"menu_categories">;
export type MenuCategoryUpdate = TablesUpdate<"menu_categories">;

export type MenuItem = Tables<"menu_items">;
export type MenuItemInsert = TablesInsert<"menu_items">;
export type MenuItemUpdate = TablesUpdate<"menu_items">;

// Alergénios de declaração obrigatória na UE (Reg. 1169/2011, anexo II).
export const ALLERGENS: { code: string; label: string }[] = [
  { code: "gluten", label: "Glúten" },
  { code: "crustaceos", label: "Crustáceos" },
  { code: "ovos", label: "Ovos" },
  { code: "peixe", label: "Peixe" },
  { code: "amendoins", label: "Amendoins" },
  { code: "soja", label: "Soja" },
  { code: "leite", label: "Leite" },
  { code: "frutos_casca", label: "Frutos de casca rija" },
  { code: "aipo", label: "Aipo" },
  { code: "mostarda", label: "Mostarda" },
  { code: "sesamo", label: "Sésamo" },
  { code: "sulfitos", label: "Sulfitos" },
  { code: "tremoco", label: "Tremoço" },
  { code: "moluscos", label: "Moluscos" },
];

export const ALLERGEN_LABEL: Record<string, string> = Object.fromEntries(
  ALLERGENS.map((a) => [a.code, a.label]),
);

// Preço em cêntimos -> "12,50 €" (ou "—" quando sem preço, ex.: preço de mercado).
export function formatPriceCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  });
}

// "12,50" | "12.5" | "12" | "12,50 €" -> cêntimos (int) ou null se vazio/inválido.
export function parsePriceToCents(input: string): number | null {
  const t = input.trim().replace(/[\s€]/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// ── Ficha Técnica + Despensa (migration 0006) ────────────────────────────────
export type Ingredient = Tables<"ingredients">;
export type IngredientInsert = TablesInsert<"ingredients">;
export type IngredientUpdate = TablesUpdate<"ingredients">;

export type TechSheet = Tables<"tech_sheets">;
export type TechSheetInsert = TablesInsert<"tech_sheets">;
export type TechSheetUpdate = TablesUpdate<"tech_sheets">;

export type TechSheetIngredient = Tables<"tech_sheet_ingredients">;
export type TechSheetIngredientInsert = TablesInsert<"tech_sheet_ingredients">;

export const UNIT_OPTIONS = [
  { code: "g", label: "g" },
  { code: "kg", label: "kg" },
  { code: "ml", label: "ml" },
  { code: "l", label: "L" },
  { code: "un", label: "un" },
] as const;
export type Unit = (typeof UNIT_OPTIONS)[number]["code"];

// Famílias de unidade para a conversão FIXA da v0: g↔kg e ml↔l (factor 1000).
// Sem tabela de conversões; unidades de famílias diferentes não têm custo.
function unitFamily(u: string): "mass" | "vol" | "count" | null {
  if (u === "g" || u === "kg") return "mass";
  if (u === "ml" || u === "l") return "vol";
  if (u === "un") return "count";
  return null;
}

function toBase(qty: number, unit: string): number {
  return unit === "kg" || unit === "l" ? qty * 1000 : qty;
}

// Custo de uma linha da ficha em cêntimos, convertendo entre g/kg e ml/l.
// null quando não há custo do ingrediente ou as famílias não coincidem.
export function computeLineCostCents(
  qty: number,
  lineUnit: string,
  ingredientUnit: string,
  costPerUnitCents: number | null | undefined,
): number | null {
  if (costPerUnitCents == null || costPerUnitCents < 0 || qty <= 0) return null;
  const lf = unitFamily(lineUnit);
  const inf = unitFamily(ingredientUnit);
  if (!lf || !inf || lf !== inf) return null;
  const qtyBase = toBase(qty, lineUnit);
  const costPerBase = costPerUnitCents / (ingredientUnit === "kg" || ingredientUnit === "l" ? 1000 : 1);
  return qtyBase * costPerBase;
}

export interface FoodCostSummary {
  costCents: number; // soma das linhas com custo calculável
  costed: number; // nº de linhas com custo
  total: number; // nº total de linhas
}

// Food cost da ficha: soma as linhas ligadas a ingredientes com custo.
// Linhas livres (sem ingredient_id) ou sem custo contam em total mas não em costed.
export function computeFoodCost(
  lines: { qty: number; unit: string; ingredient_id: string | null }[],
  ingredientsById: Map<string, { unit: string; cost_per_unit_cents: number | null }>,
): FoodCostSummary {
  let costCents = 0;
  let costed = 0;
  for (const line of lines) {
    if (!line.ingredient_id) continue;
    const ing = ingredientsById.get(line.ingredient_id);
    if (!ing) continue;
    const c = computeLineCostCents(line.qty, line.unit, ing.unit, ing.cost_per_unit_cents);
    if (c != null) {
      costCents += c;
      costed += 1;
    }
  }
  return { costCents, costed, total: lines.length };
}

// Margem percentual sobre o preço de venda. null sem preço ou preço 0.
export function computeMarginPct(
  priceCents: number | null | undefined,
  costCents: number,
): number | null {
  if (priceCents == null || priceCents <= 0) return null;
  return ((priceCents - costCents) / priceCents) * 100;
}
