import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/query-keys";
import type {
  HaccpNcStatus,
  HaccpNonconformity,
  HaccpReception,
  HaccpTurnStatusRow,
} from "@/lib/types";

// Dados do dossiê de inspecção (item 1, E1). Uma query por secção, sem N+1: o
// intervalo é validado com a mesma regra do contrato (máximo 92 dias, guardado
// por haccp_expected_readings). Todas as leituras são de reader (o consultor
// também gera o dossiê).

export interface PeriodSummary {
  expected: number;
  recorded: number;
  missing: number;
  deviations: number;
  deviations_unanswered: number;
  nc_open: number;
  nc_verified: number;
  receptions: number;
  rejections: number;
  completion_rate: number;
}

export function useHaccpPeriodSummary(
  restaurantId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.haccpPeriodSummary(restaurantId, from ?? "", to ?? ""),
    queryFn: async (): Promise<PeriodSummary> => {
      const { data, error } = await supabase.rpc("haccp_period_summary", {
        p_restaurant_id: restaurantId as string,
        p_from: from as string,
        p_to: to as string,
      });
      if (error) throw error;
      return data as unknown as PeriodSummary;
    },
    enabled: !!restaurantId && !!from && !!to,
  });
}

// Estado esperado vs registado por (dia, turno, ponto) no período. Base da
// grelha de temperaturas e das linhas EM FALTA.
export function useHaccpExpectedReadings(
  restaurantId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.haccpExpectedReadings(restaurantId, from ?? "", to ?? ""),
    queryFn: async (): Promise<HaccpTurnStatusRow[]> => {
      const { data, error } = await supabase.rpc("haccp_expected_readings", {
        p_restaurant_id: restaurantId as string,
        p_from: from as string,
        p_to: to as string,
      });
      if (error) throw error;
      return (data ?? []) as HaccpTurnStatusRow[];
    },
    enabled: !!restaurantId && !!from && !!to,
  });
}

// Registos brutos do período (captured_at, recorded_by, min/max, rectifies_id,
// nota) que a RPC de estado não devolve. Uma só query pela tabela (RLS SELECT
// para readers), indexada no cliente.
export interface RawReading {
  id: string;
  control_point_id: string;
  turn_id: string;
  service_date: string;
  value_c: number;
  min_c: number | null;
  max_c: number | null;
  within_limits: boolean;
  sync_mode: string;
  captured_at: string | null;
  recorded_at: string;
  recorded_by: string;
  rectifies_id: string | null;
  note: string | null;
}

export function useHaccpReadingsRange(
  restaurantId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.haccpReadingsRange(restaurantId, from ?? "", to ?? ""),
    queryFn: async (): Promise<RawReading[]> => {
      const { data, error } = await supabase
        .from("haccp_temperature_readings")
        .select(
          "id, control_point_id, turn_id, service_date, value_c, min_c, max_c, within_limits, sync_mode, captured_at, recorded_at, recorded_by, rectifies_id, note",
        )
        .eq("restaurant_id", restaurantId as string)
        .gte("service_date", from as string)
        .lte("service_date", to as string);
      if (error) throw error;
      return (data ?? []) as RawReading[];
    },
    enabled: !!restaurantId && !!from && !!to,
  });
}

export interface DossierReception extends HaccpReception {
  supplier_name: string | null;
  rejection_cause: string | null;
  rejection_quantity: string | null;
  rejection_description: string | null;
}

export function useHaccpReceptionsRange(
  restaurantId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.haccpReceptionsRange(restaurantId, from ?? "", to ?? ""),
    queryFn: async (): Promise<DossierReception[]> => {
      const { data, error } = await supabase
        .from("haccp_receptions")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .gte("service_date", from as string)
        .lte("service_date", to as string)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      const receptions = (data ?? []) as HaccpReception[];
      if (receptions.length === 0) return [];
      const [suppliersRes, rejectionsRes] = await Promise.all([
        supabase.from("suppliers").select("id, name").eq("restaurant_id", restaurantId as string),
        supabase
          .from("haccp_rejections")
          .select("reception_id, cause, quantity_text, description")
          .eq("restaurant_id", restaurantId as string)
          .in(
            "reception_id",
            receptions.map((r) => r.id),
          ),
      ]);
      if (suppliersRes.error) throw suppliersRes.error;
      if (rejectionsRes.error) throw rejectionsRes.error;
      const supplierName = new Map((suppliersRes.data ?? []).map((s) => [s.id, s.name as string]));
      const rejByReception = new Map(
        (rejectionsRes.data ?? []).map((r) => [
          r.reception_id,
          { cause: r.cause as string, quantity: r.quantity_text as string | null, description: r.description as string | null },
        ]),
      );
      return receptions.map((r) => {
        const rej = rejByReception.get(r.id);
        return {
          ...r,
          supplier_name: supplierName.get(r.supplier_id) ?? null,
          rejection_cause: rej?.cause ?? null,
          rejection_quantity: rej?.quantity ?? null,
          rejection_description: rej?.description ?? null,
        };
      });
    },
    enabled: !!restaurantId && !!from && !!to,
  });
}

export type DossierNc = HaccpNonconformity & {
  nc_status: string | null;
  open_hours: number | null;
  overdue: boolean | null;
  effective: boolean | null;
  verified_at: string | null;
};

export function useHaccpNcRange(
  restaurantId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.haccpNcRange(restaurantId, from ?? "", to ?? ""),
    queryFn: async (): Promise<DossierNc[]> => {
      const [ncRes, stRes] = await Promise.all([
        supabase
          .from("haccp_nonconformities")
          .select("*")
          .eq("restaurant_id", restaurantId as string)
          .gte("service_date", from as string)
          .lte("service_date", to as string)
          .order("occurred_at", { ascending: false }),
        supabase.from("haccp_nc_status").select("*").eq("restaurant_id", restaurantId as string),
      ]);
      if (ncRes.error) throw ncRes.error;
      if (stRes.error) throw stRes.error;
      const byId = new Map(((stRes.data ?? []) as HaccpNcStatus[]).map((s) => [s.nonconformity_id, s]));
      return ((ncRes.data ?? []) as HaccpNonconformity[]).map((r) => {
        const s = byId.get(r.id);
        return {
          ...r,
          nc_status: s?.status ?? null,
          open_hours: s?.open_hours ?? null,
          overdue: s?.overdue ?? null,
          effective: s?.effective ?? null,
          verified_at: s?.verified_at ?? null,
        };
      });
    },
    enabled: !!restaurantId && !!from && !!to,
  });
}

// Nome do perfil actual, para a capa ("gerado por"). profiles é self-only, por
// isso só se lê o próprio; cai no email quando não há nome.
export function useProfileName() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.haccpProfileName(user?.id),
    queryFn: async (): Promise<string> => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user?.id as string)
        .maybeSingle();
      return data?.full_name ?? user?.email ?? "não identificado";
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
