import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { HaccpNcStatus, HaccpNonconformity } from "@/lib/types";

// Não conformidades e verificação de eficácia (item 5, C1). Escrita de NC:
// membro operacional (não consultor). Verificação: qualquer reader (o consultor
// PODE verificar), desde que não seja o autor da NC.

export type NcListRow = HaccpNonconformity & {
  nc_status: string | null;
  overdue: boolean | null;
  open_hours: number | null;
  verified_at: string | null;
  effective: boolean | null;
};

// Junta o detalhe (tabela) ao estado (vista haccp_nc_status) por id, no cliente.
function mergeStatus(
  rows: HaccpNonconformity[],
  statuses: HaccpNcStatus[],
): NcListRow[] {
  const byId = new Map(statuses.map((s) => [s.nonconformity_id, s]));
  return rows.map((r) => {
    const s = byId.get(r.id);
    return {
      ...r,
      nc_status: s?.status ?? null,
      overdue: s?.overdue ?? null,
      open_hours: s?.open_hours ?? null,
      verified_at: s?.verified_at ?? null,
      effective: s?.effective ?? null,
    };
  });
}

export function useHaccpNonconformities(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpNonconformities(restaurantId),
    queryFn: async (): Promise<NcListRow[]> => {
      const [ncRes, stRes] = await Promise.all([
        supabase
          .from("haccp_nonconformities")
          .select("*")
          .eq("restaurant_id", restaurantId as string)
          .order("occurred_at", { ascending: false }),
        supabase
          .from("haccp_nc_status")
          .select("*")
          .eq("restaurant_id", restaurantId as string),
      ]);
      if (ncRes.error) throw ncRes.error;
      if (stRes.error) throw stRes.error;
      return mergeStatus(
        (ncRes.data ?? []) as HaccpNonconformity[],
        (stRes.data ?? []) as HaccpNcStatus[],
      );
    },
    enabled: !!restaurantId,
  });
}

export function useHaccpNonconformity(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpNonconformity(id),
    queryFn: async (): Promise<NcListRow | null> => {
      const [ncRes, stRes] = await Promise.all([
        supabase.from("haccp_nonconformities").select("*").eq("id", id as string).maybeSingle(),
        supabase
          .from("haccp_nc_status")
          .select("*")
          .eq("nonconformity_id", id as string)
          .maybeSingle(),
      ]);
      if (ncRes.error) throw ncRes.error;
      if (stRes.error) throw stRes.error;
      if (!ncRes.data) return null;
      return mergeStatus(
        [ncRes.data as HaccpNonconformity],
        stRes.data ? [stRes.data as HaccpNcStatus] : [],
      )[0];
    },
    enabled: !!id,
  });
}

export interface CreateNonconformityInput {
  restaurantId: string;
  source: "temperature" | "reception" | "manual";
  readingId?: string | null;
  receptionId?: string | null;
  serviceDate: string;
  turnId?: string | null;
  description: string;
  measuredValue?: string | null;
  limitText?: string | null;
  productDisposition: string;
  immediateAction: string;
  rootCauseAction: string;
  executedByName: string;
}

export function useCreateNonconformity(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateNonconformityInput) => {
      const { data, error } = await supabase
        .from("haccp_nonconformities")
        .insert({
          restaurant_id: input.restaurantId,
          source: input.source,
          reading_id: input.readingId ?? null,
          reception_id: input.receptionId ?? null,
          service_date: input.serviceDate,
          turn_id: input.turnId ?? null,
          description: input.description,
          measured_value: input.measuredValue ?? null,
          limit_text: input.limitText ?? null,
          product_disposition: input.productDisposition,
          immediate_action: input.immediateAction,
          root_cause_action: input.rootCauseAction,
          executed_by_name: input.executedByName,
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["haccp", restaurantId] }),
  });
}

export function useVerifyNonconformity(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nonconformityId: string;
      effective: boolean;
      note?: string | null;
    }) => {
      const { error } = await supabase.from("haccp_nc_verifications").insert({
        restaurant_id: restaurantId as string,
        nonconformity_id: input.nonconformityId,
        effective: input.effective,
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["haccp", restaurantId] });
      qc.invalidateQueries({ queryKey: queryKeys.haccpNonconformity(vars.nonconformityId) });
    },
  });
}
