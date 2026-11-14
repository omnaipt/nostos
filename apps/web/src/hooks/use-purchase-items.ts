import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type {
  IngredientFamily,
  PurchaseItem,
  PurchaseItemInsert,
  PurchaseItemUpdate,
} from "@/lib/types";

// Artigos de compra e famílias (Stock S1, migration 0031). Tudo tenant-scoped
// via RLS (*_member_all); restaurant_id só entra nas criações. As guardas da
// 0031 garantem ingrediente/família/artigo do mesmo restaurante e formatos
// convertíveis — aqui só se reporta o erro ao utilizador.

export function usePurchaseItems(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchaseItems(restaurantId),
    queryFn: async (): Promise<PurchaseItem[]> => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PurchaseItem[];
    },
    enabled: !!restaurantId,
  });
}

export function useIngredientFamilies(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.ingredientFamilies(restaurantId),
    queryFn: async (): Promise<IngredientFamily[]> => {
      const { data, error } = await supabase
        .from("ingredient_families")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as IngredientFamily[];
    },
    enabled: !!restaurantId,
  });
}

// Aliases ligados a artigo (supplier_product_aliases com purchase_item_id), para
// a segunda fatura do mesmo fornecedor propor o mesmo artigo sem intervenção.
export interface SupplierAliasArticle {
  supplier_norm: string;
  raw_name_norm: string;
  ingredient_id: string;
  purchase_item_id: string | null;
}

export function useSupplierAliases(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierAliases(restaurantId),
    queryFn: async (): Promise<SupplierAliasArticle[]> => {
      const { data, error } = await supabase
        .from("supplier_product_aliases")
        .select("supplier_norm, raw_name_norm, ingredient_id, purchase_item_id")
        .eq("restaurant_id", restaurantId as string);
      if (error) throw error;
      return (data ?? []) as SupplierAliasArticle[];
    },
    enabled: !!restaurantId,
  });
}

function useInvalidatePantry() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.fichasRoot });
  };
}

export function useCreatePurchaseItem(restaurantId: string | undefined) {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: async (input: Omit<PurchaseItemInsert, "restaurant_id">) => {
      const { data, error } = await supabase
        .from("purchase_items")
        .insert({ ...input, restaurant_id: restaurantId as string })
        .select("*")
        .single();
      if (error) throw error;
      return data as PurchaseItem;
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseItem(restaurantId: string | undefined) {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PurchaseItemUpdate }) => {
      const { error } = await supabase
        .from("purchase_items")
        .update(patch)
        .eq("id", id)
        .eq("restaurant_id", restaurantId as string);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCreateFamily(restaurantId: string | undefined) {
  const invalidate = useInvalidatePantry();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("ingredient_families")
        .insert({ restaurant_id: restaurantId as string, name })
        .select("*")
        .single();
      if (error) throw error;
      return data as IngredientFamily;
    },
    onSuccess: invalidate,
  });
}
