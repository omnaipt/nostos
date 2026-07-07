import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Menu público (/m/{slug}). Superfície anónima via RPC security definer
// public_menu_by_slug (0005): só categorias/itens ACTIVOS. A existência e o
// nome do restaurante vêm de usePublicRestaurant (use-public-booking).

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  allergens: string[];
  available: boolean;
}

export interface PublicMenuCategory {
  id: string;
  label: string;
  items: PublicMenuItem[];
}

// A RPC devolve linhas categoria×item (left join), logo item_* pode vir null
// para uma categoria sem itens activos. O tipo gerado é conservador; aqui
// modelamos o null real do left join.
interface MenuRow {
  category_id: string;
  category_label: string;
  category_sort: number;
  item_id: string | null;
  item_name: string | null;
  item_description: string | null;
  price_cents: number | null;
  allergens: string[] | null;
  item_sort: number | null;
  available: boolean | null;
}

export function usePublicMenu(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-menu", slug],
    queryFn: async (): Promise<PublicMenuCategory[]> => {
      const { data, error } = await supabase.rpc("public_menu_by_slug", {
        p_slug: slug as string,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as MenuRow[];
      const byCat = new Map<string, PublicMenuCategory>();
      for (const r of rows) {
        let cat = byCat.get(r.category_id);
        if (!cat) {
          cat = { id: r.category_id, label: r.category_label, items: [] };
          byCat.set(r.category_id, cat);
        }
        if (r.item_id) {
          cat.items.push({
            id: r.item_id,
            name: r.item_name ?? "",
            description: r.item_description,
            priceCents: r.price_cents,
            allergens: r.allergens ?? [],
            available: r.available ?? true,
          });
        }
      }
      return [...byCat.values()];
    },
    enabled: !!slug,
    staleTime: 60 * 1000,
  });
}
