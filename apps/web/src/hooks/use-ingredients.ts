import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Ingredient, IngredientUpdate } from "@/lib/types";

// Despensa — CRUD tenant-scoped via RLS (ingredients_member_all).
// restaurant_id só entra nas mutações de criação; leitura confia no RLS.

async function fetchIngredients(restaurantId: string): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from("ingredients")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Ingredient[];
}

export function useIngredients(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ingredients(restaurantId),
    queryFn: () => fetchIngredients(restaurantId as string),
    enabled: !!restaurantId,
  });
}

function useInvalidateFichas(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
    qc.invalidateQueries({ queryKey: queryKeys.techSheets(restaurantId) });
    qc.invalidateQueries({ queryKey: queryKeys.techSheetLines(restaurantId) });
  };
}

export interface IngredientCreateInput {
  name: string;
  unit: string;
  costPerUnitCents: number | null;
}

export function useCreateIngredient(restaurantId: string | undefined) {
  const invalidate = useInvalidateFichas(restaurantId);
  return useMutation({
    mutationFn: async (input: IngredientCreateInput) => {
      const { data, error } = await supabase
        .from("ingredients")
        .insert({
          restaurant_id: restaurantId as string,
          name: input.name,
          unit: input.unit,
          cost_per_unit_cents: input.costPerUnitCents,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Ingredient;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateIngredient(restaurantId: string | undefined) {
  const invalidate = useInvalidateFichas(restaurantId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: IngredientUpdate }) => {
      const { error } = await supabase.from("ingredients").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteIngredient(restaurantId: string | undefined) {
  const invalidate = useInvalidateFichas(restaurantId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ingredients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
