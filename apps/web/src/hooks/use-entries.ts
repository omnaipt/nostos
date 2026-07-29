import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { StockMovement } from "@/lib/types";

// Entradas de compra (Gap A, auditoria 29-07): registo manual de faturas de
// fornecedor → stock_movements kind=purchase por linha. O trigger da 0011/0016
// aplica saldo E custo médio ponderado — aqui NUNCA se escreve em ingredients.
// A note leva "Fatura {fornecedor} {nº}" para o rasto da /despensa e para o
// agrupamento da lista; created_at leva a DATA da fatura (a janela de 6 meses
// do custo médio segue a data da compra, não a do registo).

export interface PurchaseEntryLine {
  ingredientId: string;
  unit: string;
  qty: number;
  costPerUnitCents: number | null; // custo unitário s/IVA; null = sem custo
  // Validade ESTIMADA (0017): data da fatura + shelf life resolvido (override
  // > categoria > fallback), editável no acto do registo. null = sem estimativa.
  expiresAt: string | null;
}

export interface PurchaseEntryInput {
  supplier: string;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  lines: PurchaseEntryLine[];
  // Aprendizagem de aliases (0018): para linhas vindas do PARSE em que o dono
  // escolheu/confirmou o ingrediente, upsert silencioso fornecedor+raw_name →
  // ingredient. Reescolher noutra fatura corrige (upsert substitui). A chave é
  // a supplier_norm devolvida pela edge (estável entre faturas do fornecedor).
  aliasLearning?: {
    supplierNorm: string;
    items: { rawNameNorm: string; ingredientId: string }[];
  } | null;
}

export function useCreatePurchaseEntry(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseEntryInput) => {
      const note = `Fatura ${input.supplier} ${input.invoiceNo}`.trim();
      const createdAt = `${input.invoiceDate}T12:00:00Z`;
      const rows = input.lines.map((l) => ({
        restaurant_id: restaurantId as string,
        ingredient_id: l.ingredientId,
        kind: "purchase" as const,
        qty: l.qty,
        unit: l.unit,
        cost_per_unit_cents: l.costPerUnitCents,
        source: "invoice" as const,
        source_ref: input.invoiceNo || null,
        note,
        created_at: createdAt,
        expires_at: l.expiresAt,
      }));
      const { error } = await supabase.from("stock_movements").insert(rows);
      if (error) throw error;

      // Aprendizagem best-effort: nunca falha a entrada por causa do alias.
      const learning = input.aliasLearning;
      if (learning && learning.supplierNorm && learning.items.length > 0) {
        const { error: aliasError } = await supabase
          .from("supplier_product_aliases")
          .upsert(
            learning.items.map((a) => ({
              restaurant_id: restaurantId as string,
              supplier_norm: learning.supplierNorm,
              raw_name_norm: a.rawNameNorm,
              ingredient_id: a.ingredientId,
            })),
            { onConflict: "restaurant_id,supplier_norm,raw_name_norm" },
          );
        if (aliasError) {
          console.warn("[nostos] Alias não aprendido (ignorado):", aliasError.message);
        }
      }
      return rows.length;
    },
    onSuccess: () => {
      // O trigger mexeu em saldo e custo médio: refrescar despensa, fichas e rasto.
      qc.invalidateQueries({ queryKey: queryKeys.ingredients(restaurantId) });
      qc.invalidateQueries({ queryKey: queryKeys.fichasRoot });
      qc.invalidateQueries({ queryKey: queryKeys.stockRoot });
    },
  });
}

// Entradas recentes agrupadas por fatura (note + source_ref + dia). O volume
// v0 é pequeno; agrupar no cliente evita view nova.
export interface PurchaseEntryGroup {
  key: string;
  note: string | null;
  sourceRef: string | null;
  date: string; // YYYY-MM-DD do created_at
  lines: StockMovement[];
  totalCents: number; // soma qty × custo (linhas com custo)
}

export function useRecentPurchaseEntries(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchaseEntries(restaurantId),
    queryFn: async (): Promise<PurchaseEntryGroup[]> => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .eq("restaurant_id", restaurantId as string)
        .eq("kind", "purchase")
        .eq("source", "invoice")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const groups = new Map<string, PurchaseEntryGroup>();
      for (const m of (data ?? []) as StockMovement[]) {
        const date = m.created_at.slice(0, 10);
        const key = `${m.note ?? ""}|${m.source_ref ?? ""}|${date}`;
        let g = groups.get(key);
        if (!g) {
          g = { key, note: m.note, sourceRef: m.source_ref, date, lines: [], totalCents: 0 };
          groups.set(key, g);
        }
        g.lines.push(m);
        if (m.cost_per_unit_cents != null) g.totalCents += m.qty * m.cost_per_unit_cents;
      }
      return [...groups.values()];
    },
    enabled: !!restaurantId,
  });
}

// Último custo por ingrediente (informativo na UI; o principal é o médio, que
// vive em ingredients.cost_per_unit_cents desde a 0016).
export function useLastPurchaseCosts(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lastPurchaseCosts(restaurantId),
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("ingredient_id, cost_per_unit_cents, created_at")
        .eq("restaurant_id", restaurantId as string)
        .eq("kind", "purchase")
        .not("cost_per_unit_cents", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const latest = new Map<string, number>();
      for (const m of data ?? []) {
        if (!latest.has(m.ingredient_id)) {
          latest.set(m.ingredient_id, m.cost_per_unit_cents as number);
        }
      }
      return latest;
    },
    enabled: !!restaurantId,
  });
}
