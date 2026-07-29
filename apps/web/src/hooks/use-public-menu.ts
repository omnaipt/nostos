import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Menu público (/m/{slug}). Superfície anónima via RPC security definer
// public_menu_by_slug (0005): só categorias/itens ACTIVOS. A existência e o
// nome do restaurante vêm de usePublicRestaurant (use-public-booking).

export type PublicPriceType = "fixed" | "per_kg" | "market" | "variants";

export interface PublicMenuVariant {
  label: string;
  priceCents: number | null;
  unit: string;
  serves: number | null;
}

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  priceType: PublicPriceType;
  serves: number | null;
  variants: PublicMenuVariant[];
  allergens: string[];
  available: boolean;
  // Prato por encomenda (0013): confeção lenta, pré-pedido na reserva.
  byOrder: boolean;
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
  price_type: string | null;
  serves: number | null;
  allergens: string[] | null;
  variants: unknown;
  item_sort: number | null;
  available: boolean | null;
  // Opcional enquanto a 0013 não estiver aplicada em todos os ambientes.
  by_order?: boolean | null;
}

const PRICE_TYPES: readonly PublicPriceType[] = [
  "fixed",
  "per_kg",
  "market",
  "variants",
];

// O jsonb da RPC chega sem tipo; validamos a forma antes de usar.
function parseVariants(raw: unknown): PublicMenuVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    if (typeof v !== "object" || v === null) return [];
    const o = v as Record<string, unknown>;
    if (typeof o.label !== "string") return [];
    return [
      {
        label: o.label,
        priceCents: typeof o.price_cents === "number" ? o.price_cents : null,
        unit: typeof o.unit === "string" ? o.unit : "dose",
        serves: typeof o.serves === "number" ? o.serves : null,
      },
    ];
  });
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
            priceType: PRICE_TYPES.includes(r.price_type as PublicPriceType)
              ? (r.price_type as PublicPriceType)
              : "fixed",
            serves: r.serves,
            variants: parseVariants(r.variants),
            allergens: r.allergens ?? [],
            available: r.available ?? true,
            byOrder: r.by_order ?? false,
          });
        }
      }
      return [...byCat.values()];
    },
    enabled: !!slug,
    staleTime: 60 * 1000,
  });
}
