import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { ShelfLifeDefault } from "@/lib/expiry";
import type { StockMovement } from "@/lib/types";

// Inventário físico (Gap F) + validades (Gap G) — 0017.

// ── Inventário: acerto em bulk via RPC transaccional ─────────────────────────
export interface InventoryCount {
  ingredientId: string;
  counted: number;
}

export interface InventoryDeviation {
  ingredient_id: string;
  name: string;
  unit: string;
  diff: number;
  deviation_cents: number;
}

export interface InventoryResult {
  applied: number;
  skipped: number;
  total_deviation_cents: number;
  items: InventoryDeviation[];
}

export function useApplyInventoryCount(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { counts: InventoryCount[]; note: string }) => {
      const { data, error } = await supabase.rpc("apply_inventory_count", {
        p_restaurant_id: restaurantId as string,
        p_counts: input.counts.map((c) => ({
          ingredient_id: c.ingredientId,
          counted: c.counted,
        })),
        p_note: input.note,
      });
      if (error) throw error;
      return data as unknown as InventoryResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.stockRoot });
    },
  });
}

// ── Validades: defaults globais (tabela de referência, cache longa) ──────────
export function useShelfLifeDefaults() {
  return useQuery({
    queryKey: queryKeys.shelfLifeDefaults,
    queryFn: async (): Promise<ShelfLifeDefault[]> => {
      const { data, error } = await supabase
        .from("shelf_life_defaults")
        .select("category, storage_mode, shelf_life_days");
      // Defensivo enquanto a 0017 não estiver aplicada em todos os ambientes:
      // tabela em falta => sem estimativas, sem partir o resto da página.
      if (error) return [];
      return (data ?? []) as ShelfLifeDefault[];
    },
    staleTime: 60 * 60 * 1000,
  });
}

// ── Validades: compras com expires_at para os alertas da /despensa (Zé) ──────
// Exposto já como hook para o sprint seguinte: "a expirar ≤2 dias" âmbar,
// "expirado" vermelho. FEFO informativo, não bloqueante.
export function useExpiringPurchases(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expiringPurchases(restaurantId),
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .eq("kind", "purchase")
        .not("expires_at", "is", null)
        .order("expires_at", { ascending: true })
        .limit(500);
      if (error) return [];
      return (data ?? []) as StockMovement[];
    },
    enabled: !!restaurantId,
  });
}
