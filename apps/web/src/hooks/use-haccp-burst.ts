import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { shiftIsoDate, todayServiceDate } from "@/lib/service-date";

// Anti-métrica (item 4): registos em bloco (3+ do mesmo utilizador em 2 min)
// via haccp_burst_check. A RPC guarda owner/gestor/consultor, por isso o hook só
// deve ser activado para esses roles. Também expõe a existência de qualquer
// registo (item 5, cartão de arranque).

export interface BurstGroup {
  recorded_by: string;
  window_start: string;
  readings: number;
  control_points: number;
}

export function useHaccpBurst(restaurantId: string | undefined, enabled: boolean) {
  const to = todayServiceDate();
  const from = shiftIsoDate(to, -6); // últimos 7 dias inclusive
  return useQuery({
    queryKey: queryKeys.haccpBurst(restaurantId, from, to),
    queryFn: async (): Promise<BurstGroup[]> => {
      const { data, error } = await supabase.rpc("haccp_burst_check", {
        p_restaurant_id: restaurantId as string,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as BurstGroup[];
    },
    enabled: !!restaurantId && enabled,
  });
}

// Existe algum registo de temperatura de sempre? (cartão de arranque, item 5.)
export function useHaccpHasReadings(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpReadingsExist(restaurantId),
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from("haccp_temperature_readings")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId as string);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!restaurantId,
  });
}
