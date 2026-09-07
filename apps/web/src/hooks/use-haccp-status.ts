import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { HaccpTurnStatusRow } from "@/lib/types";

// Estado do turno (item 2, A3). Tudo tenant-scoped por RLS; o dia de serviço é
// calculado no servidor (haccp_service_date), o cliente só o apresenta.

// Dia de serviço corrente no fuso do restaurante (corte às 06:00).
export function useHaccpServiceDate(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpServiceDate(restaurantId),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc("haccp_service_date", {
        p_restaurant_id: restaurantId as string,
      });
      if (error) throw error;
      return data as string;
    },
    enabled: !!restaurantId,
    staleTime: 60 * 1000,
  });
}

export interface HaccpTurnGroup {
  turnId: string;
  turnLabel: string;
  points: HaccpTurnStatusRow[];
  verifiedCount: number;
  total: number;
  // Estado agregado do turno para decidir o botão do hub.
  hasOpen: boolean; // algum ponto por_verificar (janela aberta)
  opensAt: string | null; // abertura do turno (para "abre às HH:MM" quando futuro)
  allFuture: boolean;
}

const VERIFIED_STATUSES = new Set([
  "conforme",
  "desvio_sem_resposta",
  "desvio_aberto",
  "desvio_resolvido",
]);

// Agrupa as linhas planas por turno, preservando a ordem de chegada (a RPC já
// devolve por turno/ponto). Calcula contagens e o estado agregado do turno.
export function groupByTurn(rows: HaccpTurnStatusRow[]): HaccpTurnGroup[] {
  const groups = new Map<string, HaccpTurnGroup>();
  for (const r of rows) {
    let g = groups.get(r.turn_id);
    if (!g) {
      g = {
        turnId: r.turn_id,
        turnLabel: r.turn_label,
        points: [],
        verifiedCount: 0,
        total: 0,
        hasOpen: false,
        opensAt: r.opens_at ?? null,
        allFuture: true,
      };
      groups.set(r.turn_id, g);
    }
    g.points.push(r);
    g.total += 1;
    if (VERIFIED_STATUSES.has(r.status)) g.verifiedCount += 1;
    if (r.status === "por_verificar") g.hasOpen = true;
    if (r.status !== "futuro") g.allFuture = false;
  }
  return [...groups.values()];
}

export function useHaccpTurnStatus(
  restaurantId: string | undefined,
  serviceDate: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.haccpTurnStatus(restaurantId, serviceDate ?? ""),
    queryFn: async (): Promise<HaccpTurnGroup[]> => {
      const { data, error } = await supabase.rpc("haccp_turn_status", {
        p_restaurant_id: restaurantId as string,
        p_service_date: serviceDate,
      });
      if (error) throw error;
      return groupByTurn((data ?? []) as HaccpTurnStatusRow[]);
    },
    enabled: !!restaurantId && !!serviceDate,
    // Refrescar com alguma frequência: a janela do turno muda de estado com o
    // tempo (futuro → por_verificar → em_falta) sem intervenção do utilizador.
    refetchInterval: 60 * 1000,
  });
}
