import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { SaftImport, SaftImportLine } from "@/lib/types";

// Imports SAF-T (0012) — o fecho do dia. Leitura dos lotes/linhas via RLS;
// o processamento (parse, match, abates) é TODO da edge import-saft. A UI
// só orquestra: envia o XML, concilia códigos, manda re-aplicar.

// Resposta da edge (contrato no comentário final de 0012 + cabeçalho da edge).
export interface SaftEdgeResponse {
  imported: boolean;
  reason?: string;
  importId?: string;
  status?: "review" | "applied";
  invoices?: number;
  lines?: number;
  matched?: number;
  unmatched?: number;
  unmatchedCodes?: string[];
  skippedDocs?: number;
  // Relatório do apply (só quando status=applied)
  movements?: number;
  ingredientsTouched?: number;
  dishesWithoutSheet?: string[];
  unitMismatch?: string[];
}

// A edge devolve a razão honesta no corpo mesmo em erro HTTP; o invoke do
// supabase-js esconde-a dentro de error.context (Response). Extraímo-la para
// a UI mostrar "sem documentos FT/FS/FR no ficheiro" em vez de "non-2xx".
async function invokeImportSaft(body: Record<string, unknown>): Promise<SaftEdgeResponse> {
  const { data, error } = await supabase.functions.invoke("import-saft", { body });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    let reason: string | null = null;
    if (ctx instanceof Response) {
      reason = await ctx
        .json()
        .then((b: { reason?: string }) => b?.reason ?? null)
        .catch(() => null);
    }
    throw new Error(reason ?? (error instanceof Error ? error.message : "falha no import-saft"));
  }
  const res = data as SaftEdgeResponse;
  if (!res.imported) throw new Error(res.reason ?? "falha no import-saft");
  return res;
}

async function fetchImports(restaurantId: string): Promise<SaftImport[]> {
  const { data, error } = await supabase
    .from("saft_imports")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export function useSaftImports(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.saftImports(restaurantId),
    queryFn: () => fetchImports(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export function useLastAppliedImport(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lastAppliedImport(restaurantId),
    queryFn: async (): Promise<SaftImport | null> => {
      const { data, error } = await supabase
        .from("saft_imports")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .eq("status", "applied")
        .order("applied_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!restaurantId,
  });
}

// Só as linhas por casar: é a fila de conciliação. As casadas contam-se pelos
// totais do lote, não precisam de vir para o cliente.
async function fetchUnmatchedLines(importId: string): Promise<SaftImportLine[]> {
  const { data, error } = await supabase
    .from("saft_import_lines")
    .select("*")
    .eq("import_id", importId)
    .eq("status", "unmatched")
    .order("pos_code", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function useUnmatchedLines(importId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.saftUnmatchedLines(importId),
    queryFn: () => fetchUnmatchedLines(importId as string),
    enabled: !!importId,
  });
}

function useInvalidateSaft(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.saftRoot });
    // O apply mexe em saldos da despensa (abates) — refrescar também.
    qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
    qc.invalidateQueries({ queryKey: queryKeys.stockRoot });
  };
}

export function useIngestSaft(restaurantId: string | undefined) {
  const invalidate = useInvalidateSaft(restaurantId);
  return useMutation({
    mutationFn: async (input: { filename: string; xml: string }) =>
      invokeImportSaft({
        restaurantId: restaurantId as string,
        filename: input.filename,
        xml: input.xml,
      }),
    onSuccess: invalidate,
    onError: invalidate, // a edge pode ter deixado o lote em failed: mostrar
  });
}

export function useApplySaft(restaurantId: string | undefined) {
  const invalidate = useInvalidateSaft(restaurantId);
  return useMutation({
    mutationFn: async (importId: string) =>
      invokeImportSaft({ restaurantId: restaurantId as string, importId }),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export interface ConcileInput {
  importId: string;
  posCode: string;
  posDescription: string | null;
  menuItemId: string;
}

// Conciliar UM código: grava a memória (pos_product_map, upsert por
// restaurant_id+pos_code) e casa já as linhas desse código neste lote.
// Imports futuros casam sozinhos via mapa — é o "1 clique e fica aprendido".
export function useConcileCode(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConcileInput) => {
      const { error: mapErr } = await supabase.from("pos_product_map").upsert(
        {
          restaurant_id: restaurantId as string,
          pos_code: input.posCode,
          pos_description: input.posDescription,
          menu_item_id: input.menuItemId,
          confirmed: true,
        },
        { onConflict: "restaurant_id,pos_code" },
      );
      if (mapErr) throw mapErr;
      const { error: lineErr } = await supabase
        .from("saft_import_lines")
        .update({ status: "matched", menu_item_id: input.menuItemId })
        .eq("import_id", input.importId)
        .eq("pos_code", input.posCode)
        .eq("status", "unmatched");
      if (lineErr) throw lineErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.saftRoot });
    },
  });
}
