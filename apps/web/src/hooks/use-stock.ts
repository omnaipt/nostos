import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { StockMovement } from "@/lib/types";

// Stock (0011) — leitura de movimentos e registo manual de quebra/ajuste.
// O saldo NUNCA se escreve daqui: o trigger stock_movements_apply aplica-o
// a partir do movimento inserido. Tenant-scoped via RLS (member_all).

async function fetchMovements(ingredientId: string): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("ingredient_id", ingredientId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export function useStockMovements(
  restaurantId: string | undefined,
  ingredientId: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.stockMovements(restaurantId, ingredientId),
    queryFn: () => fetchMovements(ingredientId as string),
    enabled: !!restaurantId && !!ingredientId,
  });
}

// Última entrada (kind=purchase) por ingrediente, numa query só para evitar
// N+1 na lista da despensa. Volume v0 é pequeno (dezenas de entradas).
async function fetchLastPurchases(restaurantId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("ingredient_id, created_at")
    .eq("restaurant_id", restaurantId)
    .eq("kind", "purchase")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const latest = new Map<string, string>();
  for (const m of data ?? []) {
    if (!latest.has(m.ingredient_id)) latest.set(m.ingredient_id, m.created_at);
  }
  return latest;
}

export function useLastPurchases(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lastPurchases(restaurantId),
    queryFn: () => fetchLastPurchases(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export interface ManualMovementInput {
  ingredientId: string;
  unit: string;
  kind: "adjustment" | "waste";
  qty: number; // já com sinal (quebra é sempre negativa; ajuste pode entrar ou sair)
  note: string | null;
}

export function useCreateManualMovement(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualMovementInput) => {
      const { error } = await supabase.from("stock_movements").insert({
        restaurant_id: restaurantId as string,
        ingredient_id: input.ingredientId,
        kind: input.kind,
        qty: input.qty,
        unit: input.unit,
        source: "manual",
        note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // O trigger mexeu no saldo: refrescar a despensa e o rasto.
      qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.stockRoot });
    },
  });
}
