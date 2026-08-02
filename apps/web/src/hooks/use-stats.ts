import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

// Estatísticas v0 (0024). Duas RPCs, security invoker: a RLS das tabelas de
// base é que isola o tenant, o cliente não filtra restaurant_id à mão.
//
// A agregação é toda no servidor de propósito. Trazer linhas de venda cruas
// para o browser funcionaria na demo e partia no primeiro cliente com um ano
// de histórico.

export interface SalesFilters {
  from: string;
  to: string;
  turnIds: string[] | null;
  weekdays: number[] | null;
}

export interface SalesSummary {
  gross_cents: number;
  docs: number;
  units: number;
  days: number;
  lines_total: number;
  lines_mapped: number;
  lines_no_time: number;
  first_date: string | null;
  last_date: string | null;
}

export interface SalesItemRow {
  menu_item_id: string;
  item_name: string;
  qty: number;
  gross_cents: number;
  days: number;
}

const EMPTY_SUMMARY: SalesSummary = {
  gross_cents: 0,
  docs: 0,
  units: 0,
  days: 0,
  lines_total: 0,
  lines_mapped: 0,
  lines_no_time: 0,
  first_date: null,
  last_date: null,
};

function rpcArgs(restaurantId: string, f: SalesFilters) {
  return {
    p_restaurant: restaurantId,
    p_from: f.from,
    p_to: f.to,
    p_turns: f.turnIds ?? undefined,
    p_weekdays: f.weekdays ?? undefined,
  };
}

export function useSalesSummary(restaurantId: string | undefined, f: SalesFilters) {
  return useQuery({
    queryKey: queryKeys.salesSummary(restaurantId, f),
    queryFn: async (): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc(
        "sales_summary",
        rpcArgs(restaurantId as string, f),
      );
      if (error) throw error;
      // A função devolve sempre uma linha (agregado sem group by); defensivo
      // na mesma para não rebentar a página se isso mudar.
      return (data?.[0] as SalesSummary | undefined) ?? EMPTY_SUMMARY;
    },
    enabled: !!restaurantId,
  });
}

export function useSalesByItem(restaurantId: string | undefined, f: SalesFilters) {
  return useQuery({
    queryKey: queryKeys.salesByItem(restaurantId, f),
    queryFn: async (): Promise<SalesItemRow[]> => {
      const { data, error } = await supabase.rpc(
        "sales_by_item",
        rpcArgs(restaurantId as string, f),
      );
      if (error) throw error;
      return (data ?? []) as SalesItemRow[];
    },
    enabled: !!restaurantId,
  });
}
