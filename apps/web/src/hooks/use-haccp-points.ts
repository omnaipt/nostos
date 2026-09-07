import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { HaccpControlPoint, HaccpKindDefault } from "@/lib/types";

// Pontos de controlo (item 7, A1). Escrita owner/gestor (RLS); leitura para
// qualquer reader. A associação a turnos vive em haccp_control_point_turns.

// Defaults de limites por tipo (tabela global, só leitura).
export function useHaccpKindDefaults() {
  return useQuery({
    queryKey: queryKeys.haccpKindDefaults,
    queryFn: async (): Promise<HaccpKindDefault[]> => {
      const { data, error } = await supabase
        .from("haccp_kind_defaults")
        .select("*")
        .order("kind", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HaccpKindDefault[];
    },
    staleTime: 60 * 60 * 1000,
  });
}

export interface ControlPointWithTurns extends HaccpControlPoint {
  turnIds: string[]; // vazio quando all_turns=true
}

export function useHaccpControlPoints(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpControlPoints(restaurantId),
    queryFn: async (): Promise<ControlPointWithTurns[]> => {
      const [pointsRes, turnsRes] = await Promise.all([
        supabase
          .from("haccp_control_points")
          .select("*")
          .eq("restaurant_id", restaurantId as string)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("haccp_control_point_turns")
          .select("control_point_id, turn_id")
          .eq("restaurant_id", restaurantId as string),
      ]);
      if (pointsRes.error) throw pointsRes.error;
      if (turnsRes.error) throw turnsRes.error;
      const byPoint = new Map<string, string[]>();
      for (const t of turnsRes.data ?? []) {
        const arr = byPoint.get(t.control_point_id) ?? [];
        arr.push(t.turn_id);
        byPoint.set(t.control_point_id, arr);
      }
      return (pointsRes.data ?? []).map((p) => ({
        ...(p as HaccpControlPoint),
        turnIds: byPoint.get((p as HaccpControlPoint).id) ?? [],
      }));
    },
    enabled: !!restaurantId,
  });
}

export interface UpsertControlPointInput {
  id?: string; // presente = edição
  restaurantId: string;
  name: string;
  kind: string;
  minC: number | null;
  maxC: number | null;
  allTurns: boolean;
  turnIds: string[]; // relevante quando allTurns=false
  sortOrder: number;
  active?: boolean;
}

// Sincroniza a associação de turnos de um ponto (só quando all_turns=false).
async function syncPointTurns(
  restaurantId: string,
  controlPointId: string,
  allTurns: boolean,
  turnIds: string[],
) {
  // Limpa o que houver; se all_turns=true não há linhas a manter.
  const del = await supabase
    .from("haccp_control_point_turns")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("control_point_id", controlPointId);
  if (del.error) throw del.error;
  if (allTurns || turnIds.length === 0) return;
  const ins = await supabase.from("haccp_control_point_turns").insert(
    turnIds.map((turn_id) => ({
      restaurant_id: restaurantId,
      control_point_id: controlPointId,
      turn_id,
    })),
  );
  if (ins.error) throw ins.error;
}

export function useUpsertControlPoint(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertControlPointInput) => {
      const base = {
        restaurant_id: input.restaurantId,
        name: input.name,
        kind: input.kind,
        min_c: input.minC,
        max_c: input.maxC,
        all_turns: input.allTurns,
        sort_order: input.sortOrder,
        ...(input.active != null ? { active: input.active } : {}),
      };
      let pointId = input.id;
      if (pointId) {
        const { error } = await supabase
          .from("haccp_control_points")
          .update(base)
          .eq("id", pointId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("haccp_control_points")
          .insert(base)
          .select("id")
          .single();
        if (error) throw error;
        pointId = (data as { id: string }).id;
      }
      await syncPointTurns(input.restaurantId, pointId, input.allTurns, input.turnIds);
      return pointId;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.haccpControlPoints(restaurantId) }),
  });
}

// Desactivar (active=false): o gatilho preenche deactivated_at. Sem apagar.
export function useDeactivateControlPoint(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("haccp_control_points")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.haccpControlPoints(restaurantId) }),
  });
}

// Onboarding rápido: 3 pontos habituais, todos em todos os turnos. Os limites
// herdam do kind (gatilho); enviamos só nome, tipo e all_turns.
export function useCreateDefaultControlPoints(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const rows = [
        { name: "Frigorífico 1", kind: "frio_positivo", sort_order: 0 },
        { name: "Arca congeladora", kind: "congelacao", sort_order: 1 },
        { name: "Banho-maria", kind: "quente", sort_order: 2 },
      ].map((r) => ({
        restaurant_id: restaurantId as string,
        name: r.name,
        kind: r.kind,
        all_turns: true,
        sort_order: r.sort_order,
      }));
      const { error } = await supabase.from("haccp_control_points").insert(rows);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.haccpControlPoints(restaurantId) }),
  });
}
