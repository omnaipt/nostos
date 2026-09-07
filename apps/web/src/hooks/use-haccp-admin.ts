import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

// Administração HACCP (item 8): uso de storage, purga fora da retenção. A
// retenção e a quota vivem em colunas de `restaurants` (geridas via
// useUpdateRestaurant). Purga é owner-only no servidor (nao_autorizado).

export function useHaccpStorageUsage(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpStorageUsage(restaurantId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("haccp_storage_usage_bytes", {
        p_restaurant_id: restaurantId as string,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!restaurantId,
    staleTime: 60 * 1000,
  });
}

export interface PurgeResult {
  readings: number;
  nonconformities: number;
  verifications: number;
  receptions: number;
  rejections: number;
  photos: number;
}

export function usePurgeExpired(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PurgeResult> => {
      const { data, error } = await supabase.rpc("haccp_purge_expired", {
        p_restaurant_id: restaurantId as string,
      });
      if (error) throw error;
      return data as unknown as PurgeResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["haccp", restaurantId] }),
  });
}
