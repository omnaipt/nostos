import * as React from "react";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReservationFormDialog } from "@/components/reservations/ReservationFormDialog";
import { OrderQueue, useReceivedCount } from "@/components/balcao/OrderQueue";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useTables } from "@/hooks/use-tables";
import { useTurns } from "@/hooks/use-turns";
import { useAvailability } from "@/hooks/use-availability";
import { useConfirmReservation, useUpdateReservationStatus } from "@/hooks/use-reservations";
import { todayServiceDate } from "@/lib/service-date";
import {
  isoWeekdayOf,
  RESERVATION_STATUS_LABEL,
  type Reservation,
  type ReservationStatus,
} from "@/lib/types";

// Modo balcão (spec §2): tablet/telemóvel pousado no balcão. Um ecrã touch-first
// com as reservas de HOJE por turno, "Nova reserva" grande (walk-in/telefone,
// reaproveita o RPC staff de sempre), e auto-refresh — o empregado não faz F5.
// Take-away (fila) entra como tab ao lado em Fase D.

const REFRESH_MS = 20_000;

const STATUS_BADGE: Record<ReservationStatus, Parameters<typeof Badge>[0]["variant"]> = {
  pendente: "pendente",
  confirmada: "confirmada",
  sentada: "sentada",
  cancelada: "cancelada",
  no_show: "no_show",
};

export default function Balcao() {
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const date = todayServiceDate();

  const tablesQuery = useTables(restaurantId);
  const turnsQuery = useTurns(restaurantId);
  const [turnId, setTurnId] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"reservas" | "takeaway">("reservas");

  // Encomendas por atender: badge na tab + título da página (o tablet pode
  // estar noutra tab). A fila degrada a [] se o take-away ainda não existir.
  const receivedCount = useReceivedCount(restaurantId);
  React.useEffect(() => {
    document.title = receivedCount > 0 ? `(${receivedCount}) Balcão · nostos` : "Balcão · nostos";
    return () => {
      document.title = "nostos";
    };
  }, [receivedCount]);

  const confirmReservation = useConfirmReservation(restaurant ?? undefined);
  const updateStatus = useUpdateReservationStatus();

  const tables = React.useMemo(() => (tablesQuery.data ?? []).filter((t) => t.active), [tablesQuery.data]);
  const turns = React.useMemo(() => turnsQuery.data ?? [], [turnsQuery.data]);

  // Turnos de hoje (derivados dos turnos — sem horário separado).
  const todaysTurns = React.useMemo(() => {
    const wd = isoWeekdayOf(new Date(`${date}T00:00:00`));
    return turns.filter((t) => t.active && t.weekdays.includes(wd));
  }, [turns, date]);

  React.useEffect(() => {
    if (todaysTurns.length === 0) setTurnId("");
    else if (!todaysTurns.some((t) => t.id === turnId)) setTurnId(todaysTurns[0].id);
  }, [todaysTurns, turnId]);

  const availability = useAvailability(restaurantId, date, turnId, { refetchInterval: REFRESH_MS });
  const reservations = React.useMemo(
    () =>
      [...(availability.data ?? [])].sort(
        (a, b) => (a.reserved_at ?? "").localeCompare(b.reserved_at ?? ""),
      ),
    [availability.data],
  );

  const loading = tablesQuery.isLoading || turnsQuery.isLoading;

  return (
    <div className="container max-w-3xl py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">Balcão</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Hoje ·{" "}
            {new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long" }).format(
              new Date(`${date}T12:00:00`),
            )}
            {availability.isFetching && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="a actualizar" />
            )}
          </p>
        </div>
        {tab === "reservas" && (
          <Button
            size="lg"
            className="h-12 px-5 text-base"
            disabled={todaysTurns.length === 0}
            onClick={() => setFormOpen(true)}
          >
            <Plus className="h-5 w-5" /> Nova reserva
          </Button>
        )}
      </header>

      {/* Tabs: reservas | take-away (com badge de encomendas por atender). */}
      <div className="mb-4 flex gap-2">
        {(["reservas", "takeaway"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                "flex min-h-11 items-center gap-2 rounded-full border px-4 text-base transition-colors " +
                (active
                  ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                  : "border-input bg-card text-foreground hover:bg-muted")
              }
            >
              {t === "reservas" ? "Reservas" : "Take-away"}
              {t === "takeaway" && receivedCount > 0 && (
                <span
                  className={
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold " +
                    (active ? "bg-areia-50 text-terracota-600" : "bg-terracota-600 text-areia-50")
                  }
                >
                  {receivedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "takeaway" && restaurant && <OrderQueue restaurant={restaurant} />}

      {tab === "reservas" && loading && (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {tab === "reservas" && !loading && todaysTurns.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Hoje não há turnos com serviço. Podes na mesma receber quem chegar
            assim que houver um turno definido nas Definições.
          </CardContent>
        </Card>
      )}

      {tab === "reservas" && !loading && todaysTurns.length > 0 && (
        <>
          {/* Turnos como pills grandes (targets ≥44px). */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {todaysTurns.map((t) => {
              const active = t.id === turnId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTurnId(t.id)}
                  className={
                    "min-h-11 shrink-0 rounded-full border px-4 text-base transition-colors " +
                    (active
                      ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                      : "border-input bg-card text-foreground hover:bg-muted")
                  }
                >
                  {t.label} · {t.start_time.slice(0, 5)}
                </button>
              );
            })}
          </div>

          {availability.isError && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Não foi possível carregar as reservas. Volta a tentar.
              </CardContent>
            </Card>
          )}

          {!availability.isError && reservations.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Ainda sem reservas neste turno. Toca em <strong>Nova reserva</strong> para
                quem chega ou liga.
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {reservations.map((r) => (
              <BalcaoCard
                key={r.id}
                reservation={r}
                onConfirm={() =>
                  confirmReservation.mutate(r.id, {
                    onSuccess: () => toast.success("Reserva confirmada"),
                    onError: () => toast.error("Não foi possível confirmar."),
                  })
                }
                onStatus={(status) =>
                  updateStatus.mutate(
                    { reservationId: r.id, status },
                    {
                      onSuccess: () =>
                        toast.success(status === "sentada" ? "Sentada" : "Marcada como faltou"),
                      onError: () => toast.error("Não foi possível actualizar."),
                    },
                  )
                }
              />
            ))}
          </div>
        </>
      )}

      <ReservationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tables={tables}
        turns={turns}
        existing={reservations}
        presetTurnId={turnId}
        presetDate={date}
        onSaved={() => {
          setFormOpen(false);
          void availability.refetch();
        }}
      />
    </div>
  );
}

function BalcaoCard({
  reservation: r,
  onConfirm,
  onStatus,
}: {
  reservation: Reservation;
  onConfirm: () => void;
  onStatus: (status: "sentada" | "no_show") => void;
}) {
  const time = r.reserved_at
    ? new Date(r.reserved_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="rounded-lg border border-input bg-card p-4 shadow-warm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-medium">{r.customer_name}</p>
          <p className="text-sm text-muted-foreground">
            {r.party_size} {r.party_size === 1 ? "pessoa" : "pessoas"}
            {time && ` · ${time}`}
            {r.customer_phone && ` · ${r.customer_phone}`}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[r.status]}>{RESERVATION_STATUS_LABEL[r.status]}</Badge>
      </div>
      {r.notes && <p className="mt-2 text-sm text-muted-foreground">{r.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.status === "pendente" && (
          <Button size="lg" className="h-11 flex-1" onClick={onConfirm}>
            Confirmar
          </Button>
        )}
        {(r.status === "confirmada" || r.status === "pendente") && (
          <>
            <Button size="lg" variant="outline" className="h-11 flex-1" onClick={() => onStatus("sentada")}>
              Sentada
            </Button>
            <Button size="lg" variant="ghost" className="h-11 flex-1" onClick={() => onStatus("no_show")}>
              Faltou
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
