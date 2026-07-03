import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type {
  MenuCategory,
  MenuCategoryUpdate,
  MenuItem,
  MenuItemUpdate,
} from "@/lib/types";

// Menu Digital — CRUD tenant-scoped via RLS (menu_*_member_all). Nunca
// filtramos restaurant_id no cliente para leitura; ele entra só nas mutações
// de criação (RLS valida a pertença na escrita).

async function fetchCategories(restaurantId: string): Promise<MenuCategory[]> {
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MenuCategory[];
}

async function fetchItems(restaurantId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MenuItem[];
}

export function useMenuCategories(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menuCategories(restaurantId),
    queryFn: () => fetchCategories(restaurantId as string),
    enabled: !!restaurantId,
  });
}

export function useMenuItems(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.menuItems(restaurantId),
    queryFn: () => fetchItems(restaurantId as string),
    enabled: !!restaurantId,
  });
}

function useInvalidateMenu(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.menuCategories(restaurantId) });
    qc.invalidateQueries({ queryKey: queryKeys.menuItems(restaurantId) });
  };
}

// ── Categorias ──────────────────────────────────────────────────────────────
export function useCreateCategory(restaurantId: string | undefined) {
  const invalidate = useInvalidateMenu(restaurantId);
  return useMutation({
    mutationFn: async (input: { label: string; sortOrder: number }) => {
      const { error } = await supabase.from("menu_categories").insert({
        restaurant_id: restaurantId as string,
        label: input.label,
        sort_order: input.sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCategory(restaurantId: string | undefined) {
  const invalidate = useInvalidateMenu(restaurantId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MenuCategoryUpdate }) => {
      const { error } = await supabase.from("menu_categories").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCategory(restaurantId: string | undefined) {
  const invalidate = useInvalidateMenu(restaurantId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ── Itens ───────────────────────────────────────────────────────────────────
export interface ItemCreateInput {
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  allergens: string[];
  sortOrder: number;
}

export function useCreateItem(restaurantId: string | undefined) {
  const invalidate = useInvalidateMenu(restaurantId);
  return useMutation({
    mutationFn: async (input: ItemCreateInput) => {
      const { error } = await supabase.from("menu_items").insert({
        restaurant_id: restaurantId as string,
        category_id: input.categoryId,
        name: input.name,
        description: input.description,
        price_cents: input.priceCents,
        allergens: input.allergens,
        sort_order: input.sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateItem(restaurantId: string | undefined) {
  const invalidate = useInvalidateMenu(restaurantId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MenuItemUpdate }) => {
      const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteItem(restaurantId: string | undefined) {
  const invalidate = useInvalidateMenu(restaurantId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
