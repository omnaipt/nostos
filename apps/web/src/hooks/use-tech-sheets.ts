import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { TechSheet, TechSheetIngredient } from "@/lib/types";

// Fichas técnicas — leitura em bloco por restaurante (o MenuManager precisa do
// food cost de TODOS os pratos para mostrar margens na lista) + gravação da
// ficha completa (upsert da ficha + substituição das linhas). Tenant via RLS.

async function fetchSheets(restaurantId: string): Promise<TechSheet[]> {
  const { data, error } = await supabase
    .from("tech_sheets")
    .select("*")
    .eq("restaurant_id", restaurantId);
  if (error) throw error;
  return (data ?? []) as TechSheet[];
}

async function fetchLines(restaurantId: string): Promise<TechSheetIngredient[]> {
  const { data, error } = await supabase
    .from("tech_sheet_ingredients")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TechSheetIngredient[];
}

export function useTechSheets(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.techSheets(restaurantId),
    queryFn: () => fetchSheets(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export function useTechSheetLines(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.techSheetLines(restaurantId),
    queryFn: () => fetchLines(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export interface SheetLineInput {
  ingredientId: string | null;
  name: string;
  qty: number;
  unit: string;
}

export interface SaveSheetInput {
  menuItemId: string;
  servings: number;
  steps: string[];
  notes: string | null;
  status: "rascunho" | "validada";
  aiGenerated: boolean;
  lines: SheetLineInput[];
}

// Grava a ficha completa: upsert por menu_item_id (unique) + replace das linhas.
export function useSaveTechSheet(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveSheetInput) => {
      const { data: sheet, error } = await supabase
        .from("tech_sheets")
        .upsert(
          {
            restaurant_id: restaurantId as string,
            menu_item_id: input.menuItemId,
            servings: input.servings,
            steps: input.steps,
            notes: input.notes,
            status: input.status,
            ai_generated: input.aiGenerated,
          },
          { onConflict: "menu_item_id" },
        )
        .select("*")
        .single();
      if (error) throw error;

      const sheetId = (sheet as TechSheet).id;
      const { error: delError } = await supabase
        .from("tech_sheet_ingredients")
        .delete()
        .eq("tech_sheet_id", sheetId);
      if (delError) throw delError;

      if (input.lines.length > 0) {
        const { error: insError } = await supabase.from("tech_sheet_ingredients").insert(
          input.lines.map((l, i) => ({
            restaurant_id: restaurantId as string,
            tech_sheet_id: sheetId,
            ingredient_id: l.ingredientId,
            name: l.name,
            qty: l.qty,
            unit: l.unit,
            sort_order: i,
          })),
        );
        if (insError) throw insError;
      }
      return sheet as TechSheet;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.techSheets(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.techSheetLines(restaurantId) });
    },
  });
}

export function useDeleteTechSheet(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sheetId: string) => {
      const { error } = await supabase.from("tech_sheets").delete().eq("id", sheetId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.techSheets(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.techSheetLines(restaurantId) });
    },
  });
}

// ── IA: rascunho da ficha via edge function (gated na ANTHROPIC_API_KEY) ────
export interface DraftIngredient {
  name: string;
  qty: number;
  unit: string;
}

export interface SheetDraft {
  servings: number;
  ingredients: DraftIngredient[];
  steps: string[];
  allergens: string[];
  notes: string | null;
}

export interface GenerateResult {
  generated: boolean;
  reason?: string;
  sheet?: SheetDraft;
}

export function useGenerateTechSheet() {
  return useMutation({
    mutationFn: async (input: {
      dishName: string;
      description: string | null;
      servings: number;
    }): Promise<GenerateResult> => {
      const { data, error } = await supabase.functions.invoke("generate-tech-sheet", {
        body: {
          dishName: input.dishName,
          description: input.description,
          servings: input.servings,
        },
      });
      if (error) throw error;
      return data as GenerateResult;
    },
  });
}
