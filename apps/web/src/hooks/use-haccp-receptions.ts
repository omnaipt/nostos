import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { shiftIsoDate, todayServiceDate } from "@/lib/service-date";
import type {
  HaccpReception,
  HaccpRejectionCause,
  HaccpSupplierStat,
  Supplier,
} from "@/lib/types";

// Recepção de mercadoria e fornecedores (item 6, B1/B2). Escrita: membro (não
// consultor). Imutável: recepções e recusas não se editam nem apagam.

const COMBINING_MARKS = /[̀-ͯ]/g;
function nameNorm(name: string): string {
  // O gatilho do servidor recalcula name_norm; enviamos um valor coerente
  // (o Insert exige-o) para não depender da ordem dos gatilhos.
  return name.trim().toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
}

export function useSuppliers(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpSuppliers(restaurantId),
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
    enabled: !!restaurantId,
  });
}

export function useHaccpSupplierStats(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpSupplierStats(restaurantId),
    queryFn: async (): Promise<HaccpSupplierStat[]> => {
      const { data, error } = await supabase
        .from("haccp_supplier_stats")
        .select("*")
        .eq("restaurant_id", restaurantId as string);
      if (error) throw error;
      return (data ?? []) as HaccpSupplierStat[];
    },
    enabled: !!restaurantId,
  });
}

export function useCreateSupplier(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; nif?: string | null }): Promise<Supplier> => {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          restaurant_id: restaurantId as string,
          name: input.name.trim(),
          name_norm: nameNorm(input.name),
          nif: input.nif?.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.haccpSuppliers(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.haccpSupplierStats(restaurantId) });
    },
  });
}

export function useUpdateSupplier(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      nif?: string | null;
      active?: boolean;
    }) => {
      const patch: {
        name?: string;
        name_norm?: string;
        nif?: string | null;
        active?: boolean;
      } = {};
      if (input.name != null) {
        patch.name = input.name.trim();
        patch.name_norm = nameNorm(input.name);
      }
      if (input.nif !== undefined) patch.nif = input.nif?.trim() || null;
      if (input.active != null) patch.active = input.active;
      const { error } = await supabase.from("suppliers").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.haccpSuppliers(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.haccpSupplierStats(restaurantId) });
    },
  });
}

export interface ReceptionRow extends HaccpReception {
  supplier_name: string | null;
  rejection_cause: string | null;
}

export function useHaccpReceptions(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.haccpReceptions(restaurantId),
    queryFn: async (): Promise<ReceptionRow[]> => {
      const from = shiftIsoDate(todayServiceDate(), -14);
      const { data, error } = await supabase
        .from("haccp_receptions")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .gte("delivered_on", from)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      const receptions = (data ?? []) as HaccpReception[];
      if (receptions.length === 0) return [];

      const [suppliersRes, rejectionsRes] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, name")
          .eq("restaurant_id", restaurantId as string),
        supabase
          .from("haccp_rejections")
          .select("reception_id, cause")
          .eq("restaurant_id", restaurantId as string)
          .in(
            "reception_id",
            receptions.map((r) => r.id),
          ),
      ]);
      if (suppliersRes.error) throw suppliersRes.error;
      if (rejectionsRes.error) throw rejectionsRes.error;
      const supplierName = new Map(
        (suppliersRes.data ?? []).map((s) => [s.id, s.name as string]),
      );
      const rejByReception = new Map(
        (rejectionsRes.data ?? []).map((r) => [r.reception_id, r.cause as string]),
      );
      return receptions.map((r) => ({
        ...r,
        supplier_name: supplierName.get(r.supplier_id) ?? null,
        rejection_cause: rejByReception.get(r.id) ?? null,
      }));
    },
    enabled: !!restaurantId,
  });
}

export interface CreateReceptionInput {
  restaurantId: string;
  supplierId: string;
  deliveredOn: string;
  serviceDate: string;
  temperatureApplicable: boolean;
  temperatureC?: number | null;
  expiryOk: boolean;
  packagingOk: boolean;
  conforming: boolean;
  photoPath?: string | null;
  note?: string | null;
}

export function useCreateReception(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReceptionInput): Promise<HaccpReception> => {
      const { data, error } = await supabase
        .from("haccp_receptions")
        .insert({
          restaurant_id: input.restaurantId,
          supplier_id: input.supplierId,
          delivered_on: input.deliveredOn,
          service_date: input.serviceDate,
          temperature_applicable: input.temperatureApplicable,
          temperature_c: input.temperatureApplicable ? input.temperatureC ?? null : null,
          expiry_ok: input.expiryOk,
          packaging_ok: input.packagingOk,
          conforming: input.conforming,
          photo_path: input.photoPath ?? null,
          note: input.note ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as HaccpReception;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["haccp", restaurantId] }),
  });
}

export function useCreateRejection(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      receptionId: string;
      cause: HaccpRejectionCause;
      quantityText?: string | null;
      description?: string | null;
    }) => {
      const { error } = await supabase.from("haccp_rejections").insert({
        restaurant_id: restaurantId as string,
        reception_id: input.receptionId,
        cause: input.cause,
        quantity_text: input.quantityText ?? null,
        description: input.description ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["haccp", restaurantId] }),
  });
}
