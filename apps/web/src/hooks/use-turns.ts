import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { IsoWeekday, Turn, TurnUpdate } from "@/lib/types";

// C2 — turnos. Query tenant-scoped via RLS (turns_member_all). service vazio
// grava-se como null (texto livre opcional).

async function fetchTurns(restaurantId: string): Promise<Turn[]> {
  const { data, error } = await supabase
    .from("turns")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Turn[];
}

export function useTurns(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.turns(restaurantId),
    queryFn: () => fetchTurns(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export interface TurnCreateInput {
  restaurantId: string;
  label: string;
  service: string | null;
  startTime: string;
  weekdays: IsoWeekday[];
  active: boolean;
}

export function useCreateTurn(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TurnCreateInput) => {
      const { error } = await supabase.from("turns").insert({
        restaurant_id: input.restaurantId,
        label: input.label,
        service: input.service,
        start_time: input.startTime,
        weekdays: input.weekdays,
        active: input.active,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.turns(restaurantId) }),
  });
}

export function useUpdateTurn(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TurnUpdate }) => {
      const { error } = await supabase.from("turns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.turns(restaurantId) }),
  });
}

export function useDeleteTurn(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("turns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.turns(restaurantId) }),
  });
}
