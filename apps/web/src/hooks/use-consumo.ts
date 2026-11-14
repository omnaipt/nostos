import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { looseRpc } from "@/lib/contract-rpc";
import { queryKeys } from "@/lib/query-keys";

// Consumo interno e quebras (Stock S2). O abate por prato passa pela RPC
// register_dish_consumption (0033), que expande a ficha no servidor; o abate de
// um ingrediente solto é um movimento internal_use directo (o trigger aplica o
// saldo e a guarda valida o perfil/modo de consumo). Tudo tenant-scoped via RLS.

export interface ConsumptionResult {
  menu_item_id: string;
  kind: string;
  portions: number;
  estimated: boolean;
  movimentos: number;
  abatidas: { ingredient_id: string; name: string; qty: number; unit: string; estimated: boolean }[];
  nao_abatidas: { ingredient_id: string | null; name: string; motivo: string }[];
}

export interface DishConsumptionInput {
  menuItemId: string;
  portions: number;
  kind: "internal_use" | "waste";
  reason: string | null;
  note: string | null;
}

export function useRegisterDishConsumption(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DishConsumptionInput): Promise<ConsumptionResult> => {
      const { data, error } = await looseRpc<ConsumptionResult>("register_dish_consumption", {
        p_restaurant_id: restaurantId as string,
        p_menu_item_id: input.menuItemId,
        p_portions: input.portions,
        p_kind: input.kind,
        p_reason: input.reason,
        p_note: input.note,
      });
      if (error) throw new Error(error.message);
      return data as ConsumptionResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.stockRoot });
    },
  });
}

export interface SingleInternalUseInput {
  ingredientId: string;
  unit: string;
  qty: number; // positivo; a gravação põe o sinal negativo
  reason: string;
  note: string | null;
}

export function useCreateInternalUse(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SingleInternalUseInput) => {
      const { error } = await supabase.from("stock_movements").insert({
        restaurant_id: restaurantId as string,
        ingredient_id: input.ingredientId,
        kind: "internal_use",
        qty: -Math.abs(input.qty),
        unit: input.unit,
        reason: input.reason,
        note: input.note,
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.stockRoot });
    },
  });
}

// Unidades vendidas por prato nos últimos 90 dias (saft_import_lines matched).
// Alimenta a ordenação da fila "fichas por validar".
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function fetchUnitsSold(restaurantId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("saft_import_lines")
    .select("menu_item_id, qty")
    .eq("restaurant_id", restaurantId)
    .eq("status", "matched")
    .gte("invoice_date", daysAgoISO(90));
  if (error) throw error;
  const byItem = new Map<string, number>();
  for (const l of data ?? []) {
    if (!l.menu_item_id) continue;
    byItem.set(l.menu_item_id, (byItem.get(l.menu_item_id) ?? 0) + Number(l.qty));
  }
  return byItem;
}

export function useUnitsSoldByItem(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.unitsSoldByItem(restaurantId),
    queryFn: () => fetchUnitsSold(restaurantId as string),
    enabled: !!restaurantId,
  });
}

// Movimentos de consumo interno do mês corrente (para o total em euros do dono).
function monthStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

async function fetchInternalUseThisMonth(
  restaurantId: string,
): Promise<{ ingredient_id: string; qty: number }[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("ingredient_id, qty")
    .eq("restaurant_id", restaurantId)
    .eq("kind", "internal_use")
    .gte("created_at", monthStartISO());
  if (error) throw error;
  return (data ?? []).map((m) => ({ ingredient_id: m.ingredient_id, qty: Number(m.qty) }));
}

export function useInternalUseThisMonth(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.internalUseMonth(restaurantId),
    queryFn: () => fetchInternalUseThisMonth(restaurantId as string),
    enabled: !!restaurantId,
  });
}
