import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { RestaurantTable, RestaurantTableUpdate } from "@/lib/types";

// C1 — mesas. Query tenant-scoped via RLS (tables_member_all). NÃO filtramos
// restaurant_id no select além do necessário para o índice; a RLS garante que
// só vêm mesas dos restaurantes do user. Passamos restaurantId só p/ ordenar e
// para as chaves de cache.

async function fetchTables(restaurantId: string): Promise<RestaurantTable[]> {
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RestaurantTable[];
}

export function useTables(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.tables(restaurantId),
    queryFn: () => fetchTables(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export interface TableCreateInput {
  restaurantId: string;
  label: string;
  seats: number;
  sortOrder: number;
  active: boolean;
}

export function useCreateTable(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TableCreateInput) => {
      const { error } = await supabase.from("tables").insert({
        restaurant_id: input.restaurantId,
        label: input.label,
        seats: input.seats,
        sort_order: input.sortOrder,
        active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables(restaurantId) }),
  });
}

export function useUpdateTable(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: RestaurantTableUpdate }) => {
      const { error } = await supabase.from("tables").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables(restaurantId) }),
  });
}

export function useDeleteTable(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tables(restaurantId) }),
  });
}
