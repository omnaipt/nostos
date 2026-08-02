import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ORDER_STATUS_LABEL,
  useAdvanceOrder,
  useOrders,
  sendTakeawayMessage,
  type Order,
  type OrderStatus,
} from "@/hooks/use-takeaway";
import { formatPriceCents, type Restaurant } from "@/lib/types";

// Fila de take-away no modo balcão (spec §D.2): cartões por estado, 1 toque
// avança; ao passar a "pronta" o frontend dispara a mensagem ao cliente
// (best-effort, como as reservas). Recusar pede nota. Auto-refresh.

const REFRESH_MS = 15_000;

const STATUS_BADGE: Record<OrderStatus, Parameters<typeof Badge>[0]["variant"]> = {
  recebida: "pendente",
  aceite: "confirmada",
  pronta: "sentada",
  levantada: "neutral",
  recusada: "no_show",
};

export function OrderQueue({ restaurant }: { restaurant: Restaurant }) {
  const ordersQuery = useOrders(restaurant.id, { refetchInterval: REFRESH_MS });
  const advance = useAdvanceOrder(restaurant.id);
  const orders = ordersQuery.data ?? [];

  function move(order: Order, status: OrderStatus) {
    advance.mutate(
      { orderId: order.id, status },
      {
        onSuccess: async () => {
          toast.success(`Encomenda ${ORDER_STATUS_LABEL[status].toLowerCase()}`);
          if (status === "pronta") {
            const enviado = await sendTakeawayMessage({
              orderId: order.id,
              slug: restaurant.slug,
              restaurantName: restaurant.name,
              tone: (restaurant as { tone?: string }).tone ?? "proximo",
              toPhone: order.phone,
              // Sem isto a edge não tinha destino e saltava o email em silêncio.
              // Quando o WhatsApp entrar, este aviso é o candidato natural: é
              // o momento em que o cliente quer ser tocado no telemóvel.
              toEmail: order.email,
              customerName: order.customer_name,
              kind: "takeaway_ready",
              pickupAt: order.pickup_at,
              timezone: (restaurant as { timezone?: string | null }).timezone ?? null,
            });
            // O balcão tem de saber se o cliente foi mesmo avisado: senão fica
            // à espera de alguém que não sabe que a encomenda está pronta.
            if (!enviado) {
              toast.warning("A encomenda ficou pronta, mas o aviso ao cliente não saiu. Ligue-lhe.");
            }
          }
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível actualizar."),
      },
    );
  }

  function refuse(order: Order) {
    const note = window.prompt("Motivo (fica no registo, o cliente não vê):", "") ?? undefined;
    advance.mutate(
      { orderId: order.id, status: "recusada", note },
      {
        onSuccess: () => toast.success("Encomenda recusada"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível recusar."),
      },
    );
  }

  if (ordersQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Sem encomendas de momento. As novas aparecem aqui automaticamente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-lg border border-input bg-card p-4 shadow-warm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-medium">{o.customer_name}</p>
              <p className="text-sm text-muted-foreground">
                {o.pickup_at &&
                  `Levantar às ${new Date(o.pickup_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`}
                {o.phone && ` · ${o.phone}`}
              </p>
            </div>
            <Badge variant={STATUS_BADGE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
          </div>

          <ul className="mt-2 space-y-0.5 text-sm">
            {o.items.map((it) => (
              <li key={it.id} className="flex justify-between gap-2">
                <span>
                  {it.qty}× {it.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatPriceCents(it.price_cents * it.qty)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm font-medium">
            Total <span className="tabular-nums">{formatPriceCents(o.total_cents)}</span>
            <span className="ml-1 font-normal text-muted-foreground">· paga ao levantar</span>
          </p>
          {o.note && <p className="mt-1 text-sm text-muted-foreground">{o.note}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            {o.status === "recebida" && (
              <>
                <Button size="lg" className="h-11 flex-1" disabled={advance.isPending} onClick={() => move(o, "aceite")}>
                  {advance.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Aceitar
                </Button>
                <Button size="lg" variant="ghost" className="h-11" onClick={() => refuse(o)}>
                  Recusar
                </Button>
              </>
            )}
            {o.status === "aceite" && (
              <Button size="lg" className="h-11 flex-1" disabled={advance.isPending} onClick={() => move(o, "pronta")}>
                Pronta
              </Button>
            )}
            {o.status === "pronta" && (
              <Button size="lg" variant="outline" className="h-11 flex-1" disabled={advance.isPending} onClick={() => move(o, "levantada")}>
                Entregue
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Contagem de "recebida" para o badge da tab e o título da página.
export function useReceivedCount(restaurantId: string | undefined): number {
  const ordersQuery = useOrders(restaurantId, { refetchInterval: REFRESH_MS });
  return React.useMemo(
    () => (ordersQuery.data ?? []).filter((o) => o.status === "recebida").length,
    [ordersQuery.data],
  );
}
