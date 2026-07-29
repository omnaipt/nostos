import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { looseFrom, looseRpc, isMissingContract } from "@/lib/contract-rpc";

// Take-away v1 (spec §3, fase D). TUDO contra o contrato da fase C do Marco
// (orders/order_items + submit_takeaway_order + advance_order), ainda não em
// prod: as leituras degradam a [] se a tabela não existir, e as escritas
// devolvem erro legível. Duas fronteiras da spec são respeitadas aqui:
//   • v1 SEM pagamento online — paga-se ao levantar (nenhuma chamada a PSP).
//   • o take-away NÃO abate stock — só capta+fila+notifica; o abate é do fecho
//     SAF-T. Nada aqui toca em stock_movements.

export type OrderStatus = "recebida" | "aceite" | "pronta" | "levantada" | "recusada";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  recebida: "Recebida",
  aceite: "Aceite",
  pronta: "Pronta",
  levantada: "Levantada",
  recusada: "Recusada",
};

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price_cents: number;
  variant_id: string | null;
}

export interface Order {
  id: string;
  customer_name: string;
  phone: string;
  pickup_at: string | null;
  status: OrderStatus;
  note: string | null;
  total_cents: number;
  created_at: string;
  items: OrderItem[];
}

export interface SubmitTakeawayItem {
  menu_item_id: string;
  variant_id: string | null;
  qty: number;
}

// ── Público: submeter encomenda (preço é snapshot DO SERVIDOR, nunca do
// cliente — o cliente só manda ids + qty; o total real vem da RPC). ──────────
export function useSubmitTakeawayOrder() {
  return useMutation({
    mutationFn: async (input: {
      slug: string;
      customerName: string;
      phone: string;
      pickupAt: string;
      note: string | null;
      items: SubmitTakeawayItem[];
      website: string; // honeypot (mesmo anti-spam do booking)
    }): Promise<{ orderId: string }> => {
      if (input.website.trim() !== "") {
        // Bot apanhado no honeypot: finge sucesso sem submeter.
        return { orderId: "" };
      }
      const { data, error } = await looseRpc<string>("submit_takeaway_order", {
        p_slug: input.slug,
        p_customer_name: input.customerName,
        p_phone: input.phone,
        p_pickup_at: input.pickupAt,
        p_note: input.note,
        p_items: input.items,
      });
      if (error) {
        if (isMissingContract(error)) {
          throw new Error("As encomendas ainda não estão activas. Tente mais logo.");
        }
        throw new Error(error.message);
      }
      return { orderId: (data as string) ?? "" };
    },
  });
}

// ── Staff: fila de encomendas activas (recebida/aceite/pronta). Auto-refresh
// no balcão. Degrada a [] se a tabela ainda não existir. ─────────────────────
const ORDERS_KEY = (restaurantId: string | undefined) => ["orders", restaurantId] as const;

export function useOrders(restaurantId: string | undefined, opts?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ORDERS_KEY(restaurantId),
    queryFn: async (): Promise<Order[]> => {
      const res = await looseFrom("orders")
        .select("*, order_items(*)")
        .eq("restaurant_id", restaurantId as string)
        .in("status", ["recebida", "aceite", "pronta"])
        .order("created_at", { ascending: true });
      const error = (res as { error: { message: string; code?: string } | null }).error;
      if (error) {
        if (isMissingContract(error)) return []; // fase C do Marco ainda por fundir
        throw new Error(error.message);
      }
      const rows = ((res as { data: unknown[] }).data ?? []) as (Omit<Order, "items"> & {
        order_items?: OrderItem[];
      })[];
      return rows.map((r) => ({ ...r, items: r.order_items ?? [] }));
    },
    enabled: !!restaurantId,
    refetchInterval: opts?.refetchInterval,
    retry: false,
  });
}

// Toggle do módulo (owner/gestor). `takeaway_enabled` é da fase C do Marco;
// via looseFrom porque ainda não está nos tipos. Erro claro se a coluna faltar.
export function useToggleTakeaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { restaurantId: string; enabled: boolean }) => {
      const res = await looseFrom("restaurants")
        .update({ takeaway_enabled: input.enabled })
        .eq("id", input.restaurantId);
      const error = (res as { error: { message: string; code?: string } | null }).error;
      if (error) {
        if (isMissingContract(error)) throw new Error("O take-away ainda não está activo neste ambiente.");
        throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-restaurant"] }),
  });
}

export function useAdvanceOrder(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; status: OrderStatus; note?: string }) => {
      const { error } = await looseRpc("advance_order", {
        p_order_id: input.orderId,
        p_status: input.status,
        p_note: input.note ?? null,
      });
      if (error) {
        if (isMissingContract(error)) throw new Error("As encomendas ainda não estão activas.");
        throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ORDERS_KEY(restaurantId) }),
  });
}

// Mensagem ao cliente (best-effort, mesmo padrão das reservas): a edge
// send-reservation-message ganha `kind` na fase C do Marco. Nunca lança.
export async function sendTakeawayMessage(input: {
  orderId: string;
  slug: string;
  restaurantName: string;
  tone: string;
  toPhone: string | null;
  toEmail: string | null;
  customerName: string;
  kind: "takeaway_received" | "takeaway_ready";
  pickupAt: string | null;
}): Promise<void> {
  try {
    await supabase.functions.invoke("send-reservation-message", {
      body: {
        kind: input.kind,
        orderId: input.orderId,
        restaurantSlug: input.slug,
        restaurantName: input.restaurantName,
        tone: input.tone,
        toPhone: input.toPhone ?? undefined,
        toEmail: input.toEmail ?? undefined,
        customerName: input.customerName,
        pickupAt: input.pickupAt ?? undefined,
      },
    });
  } catch (e) {
    console.warn("[nostos] mensagem de take-away ignorada:", e);
  }
}
