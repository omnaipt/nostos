import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Tables } from "@/integrations/supabase/database.types";

// Import de menu por foto/PDF (PR 2/2 do parse-menu): a edge faz o staging em
// menu_imports (status review); aqui lê-se o draft, publica-se via RPC
// transaccional publish_menu_import (0020), ou descarta-se. O parse NUNCA
// publica sozinho — o ecrã de revisão é obrigatório.

export type MenuImport = Tables<"menu_imports">;

export interface ParseMenuFile {
  kind: "image" | "pdf";
  mediaType: string;
  dataBase64: string;
}

export interface ParseMenuResult {
  parsed: boolean;
  reason?: string;
  import_id?: string;
  draft?: unknown;
  remaining?: number;
}

export function useReviewImports(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menuImports(restaurantId),
    queryFn: async (): Promise<MenuImport[]> => {
      const { data, error } = await supabase
        .from("menu_imports")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .eq("status", "review")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MenuImport[];
    },
    enabled: !!restaurantId,
  });
}

export function useMenuImport(importId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menuImport(importId),
    queryFn: async (): Promise<MenuImport | null> => {
      const { data, error } = await supabase
        .from("menu_imports")
        .select("*")
        .eq("id", importId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as MenuImport) ?? null;
    },
    enabled: !!importId,
  });
}

export function useParseMenu(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      files: ParseMenuFile[];
      mode?: "menu" | "wine_list";
      sourceRef?: string;
    }): Promise<ParseMenuResult> => {
      const { data, error } = await supabase.functions.invoke("parse-menu", {
        body: {
          restaurantId,
          files: input.files,
          mode: input.mode ?? "menu",
          sourceRef: input.sourceRef,
        },
      });
      if (error) throw error;
      return data as ParseMenuResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuImports(restaurantId) });
    },
  });
}

export function usePublishMenuImport(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { importId: string; menu: unknown }) => {
      const { data, error } = await supabase.rpc("publish_menu_import", {
        p_restaurant_id: restaurantId as string,
        p_import_id: input.importId,
        p_menu: input.menu as never,
      });
      if (error) throw error;
      return data as {
        categories_created: number;
        categories_reused: number;
        items_created: number;
        variants_created: number;
      };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.menuRoot });
      qc.invalidateQueries({ queryKey: queryKeys.menuImports(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.menuImport(vars.importId) });
    },
  });
}

export function useDiscardMenuImport(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importId: string) => {
      const { error } = await supabase
        .from("menu_imports")
        .update({ status: "failed", unparsed_note: "descartado pelo dono no ecrã de revisão" })
        .eq("id", importId);
      if (error) throw error;
    },
    onSuccess: (_data, importId) => {
      qc.invalidateQueries({ queryKey: queryKeys.menuImports(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.menuImport(importId) });
    },
  });
}
