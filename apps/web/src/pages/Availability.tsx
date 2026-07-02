import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, RefreshCw, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/reservations/StatusBadge";
import { ReservationFormDialog } from "@/components/reservations/ReservationFormDialog";
import { AssignTableDialog } from "@/components/reservations/AssignTableDialog";
import { type ReservationFormInitial } from "@/components/reservations/ReservationForm";
import { todayServiceDate, shiftIsoDate } from "@/lib/service-date";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useTables } from "@/hooks/use-tables";
import { useTurns } from "@/hooks/use-turns";
import { useAvailability } from "@/hooks/use-availability";
import { useAssignTable } from "@/hooks/use-reservations";
import {
  STATUSES_COUNTING_FOR_OCCUPANCY,
  isoWeekdayOf,
  type Reservation,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// C5 — Vista de disponibilidade por turno. Ecrã âncora (substitui a Vista de Dia).
// WIRING #4: dados via TanStack Query (RLS tenant-scoped). Query de
// disponibilidade por (service_date, turn_id) + reservas POR ATRIBUIR
// (table_id null). Mutações invalidam as queries no save.

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
}

export default function Availability() {
  const [date, setDate] = React.useState(todayServiceDate());
  const [turnId, setTurnId] = React.useState<string>("");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editInitial, setEditInitial] = React.useState<ReservationFormInitial | undefined>();
  const [assignFor, setAssignFor] = React.useState<Reservation | null>(null);

  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;

  const tablesQuery = useTables(restaurantId);
  const turnsQuery = useTurns(restaurantId);
  const availabilityQuery = useAvailability(restaurantId, date, turnId);
  const assignTable = useAssignTable();

  const tables = React.useMemo(() => tablesQuery.data ?? [], [tablesQuery.data]);
  const turns = React.useMemo(() => turnsQuery.data ?? [], [turnsQuery.data]);

  const activeTables = React.useMemo(() => tables.filter((t) => t.active), [tables]);
  const activeTurns = React.useMemo(() => turns.filter((t) => t.active), [turns]);

  // Turnos aplicáveis ao dia (derivado dos turnos — sem horário separado).
  const applicableTurns = React.useMemo(() => {
    const wd = isoWeekdayOf(new Date(`${date}T00:00:00`));
    return activeTurns.filter((t) => t.weekdays.includes(wd));
  }, [activeTurns, date]);

  // Garante um turno válido selecionado para o dia.
  React.useEffect(() => {
    if (applicableTurns.length === 0) {
      setTurnId("");
    } else if (!applicableTurns.some((t) => t.id === turnId)) {
      setTurnId(applicableTurns[0].id);
    }
  }, [applicableTurns, turnId]);

  // Reservas do (date, turno) — já vêm sem canceladas do servidor.
  const turnReservations = React.useMemo(
    () => availabilityQuery.data ?? [],
    [availabilityQuery.data],
  );

  const reservationByTable = React.useMemo(() => {
    const map = new Map<string, Reservation>();
    for (const r of turnReservations) if (r.table_id) map.set(r.table_id, r);
    return map;
  }, [turnReservations]);

  const unassigned = React.useMemo(
    () => turnReservations.filter((r) => !r.table_id),
    [turnReservations],
  );

  // Resumo de topo.
  const occupiedCount = reservationByTable.size;
  const totalSeats = activeTables.reduce((s, t) => s + t.seats, 0);
  const occupiedSeats = activeTables
    .filter((t) => reservationByTable.has(t.id))
    .reduce((s, t) => s + t.seats, 0);
  const totalPax = turnReservations
    .filter((r) => STATUSES_COUNTING_FOR_OCCUPANCY.includes(r.status))
    .reduce((s, r) => s + r.party_size, 0);

  const selectedTurn = applicableTurns.find((t) => t.id === turnId);

  // Mesas livres no turno (para atribuição a partir do bloco POR ATRIBUIR).
  const freeTables = React.useMemo(
    () => activeTables.filter((t) => !reservationByTable.has(t.id)),
    [activeTables, reservationByTable],
  );

  // Estados de carregamento/erro (loading inicial e quando o turno muda).
  const baseLoading = tablesQuery.isLoading || turnsQuery.isLoading;
  const slotLoading = !!turnId && availabilityQuery.isLoading;
  const loading = baseLoading || slotLoading;
  const errored = tablesQuery.isError || turnsQuery.isError || availabilityQuery.isError;

  function openCreate() {
    setEditInitial(undefined);
    setFormOpen(true);
  }

  function openEdit(r: Reservation) {
    setEditInitial({
      id: r.id,
      customerName: r.customer_name,
      customerPhone: r.customer_phone ?? "",
      partySize: r.party_size,
      date: r.service_date,
      turnId: r.turn_id ?? turnId,
      tableId: r.table_id,
      notes: r.notes ?? "",
    });
    setFormOpen(true);
  }

  function handleAssign(reservationId: string, tableId: string) {
    assignTable.mutate(
      { reservationId, tableId },
      {
        onSuccess: () => {
          setAssignFor(null);
          toast.success("Mesa atribuída");
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "";
          toast.error(
            /duplicate key|23505/i.test(msg)
              ? "Essa mesa já foi ocupada neste turno."
              : "Não foi possível atribuir a mesa.",
          );
        },
      },
    );
  }

  return (
    <div className="container py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Disponibilidade</h1>
          <p className="text-sm capitalize text-muted-foreground">{formatDateLabel(date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/clientes" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Clientes
          </Link>
          <Link to="/definicoes" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Mesas e turnos
          </Link>
          <Button size="sm" onClick={openCreate} disabled={!turnId}>
            <Plus className="h-4 w-4" /> Criar reserva
          </Button>
        </div>
      </header>

      {/* Seletores de data + turno */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Dia anterior" onClick={() => setDate(shiftIsoDate(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Dia seguinte" onClick={() => setDate(shiftIsoDate(date, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(todayServiceDate())}>
            <CalendarDays className="h-4 w-4" /> Hoje
          </Button>
        </div>
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <Select value={turnId} onChange={(e) => setTurnId(e.target.value)} aria-label="Turno" disabled={applicableTurns.length === 0}>
            {applicableTurns.length === 0 ? (
              <option value="">Sem turnos neste dia</option>
            ) : (
              applicableTurns.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.start_time}
                  {t.service ? ` (${t.service})` : ""}
                </option>
              ))
            )}
          </Select>
        </div>
      </div>

      {/* ERRO */}
      {errored && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar a disponibilidade.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                tablesQuery.refetch();
                turnsQuery.refetch();
                availabilityQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* LOADING (skeleton da grelha) */}
      {!errored && loading && (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      )}

      {/* SEM TURNOS no dia (caso de configuração) */}
      {!errored && !loading && applicableTurns.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Não há turnos configurados para este dia. Define turnos em{" "}
            <Link to="/definicoes" className="underline">
              Mesas e turnos
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {!errored && !loading && applicableTurns.length > 0 && (
        <>
          {/* RESUMO de topo */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Mesas ocupadas" value={`${occupiedCount}/${activeTables.length}`} />
            <SummaryStat label="Lugares ocupados" value={`${occupiedSeats}/${totalSeats}`} />
            <SummaryStat label="Total pax" value={String(totalPax)} icon={<Users className="h-4 w-4" />} />
            <SummaryStat label="Por atribuir" value={String(unassigned.length)} highlight={unassigned.length > 0} />
          </div>

          {/* VAZIO: turno sem reservas (todas as mesas livres) */}
          {turnReservations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Sem reservas para {selectedTurn?.label ?? "este turno"}. Todas as mesas estão livres.
                </p>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Criar reserva
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Grelha de mesas (sempre visível quando há turno) */}
          <section aria-label="Mesas" className="mb-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Mesas</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {activeTables.map((t) => {
                const r = reservationByTable.get(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (r) {
                        openEdit(r);
                      } else {
                        openCreate();
                      }
                    }}
                    className={cn(
                      "min-h-24 rounded-lg border p-3 text-left transition-colors",
                      r
                        ? "border-[hsl(var(--status-seated-fg))]/30 bg-[hsl(var(--status-seated-bg))]"
                        : "border-input bg-card hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.seats} lug.</span>
                    </div>
                    {r ? (
                      <div className="mt-2 space-y-1">
                        <p className="truncate text-sm">{r.customer_name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{r.party_size} pax</span>
                          <StatusBadge status={r.status} />
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Livre</p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Bloco POR ATRIBUIR — visível e distinto */}
          <section aria-label="Reservas por atribuir">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-medium">Por atribuir</h2>
              {unassigned.length > 0 && <Badge variant="pendente">{unassigned.length}</Badge>}
            </div>
            {unassigned.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
                Nenhuma reserva por atribuir neste turno.
              </p>
            ) : (
              <ul className="space-y-2">
                {unassigned.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--status-pending-fg))]/30 bg-[hsl(var(--status-pending-bg))] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[hsl(var(--status-pending-fg))]">
                        {r.customer_name}
                      </p>
                      <p className="text-xs text-[hsl(var(--status-pending-fg))]/80">
                        {r.party_size} pax{r.notes ? ` · ${r.notes}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setAssignFor(r)}>
                      Atribuir mesa
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ReservationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        tables={tables}
        turns={turns}
        existing={turnReservations}
        initial={editInitial}
        presetTurnId={turnId}
        presetDate={date}
        onSaved={() => {
          setFormOpen(false);
          // Invalidação das queries é feita no hook de save; o refetch do slot
          // actualiza a vista automaticamente.
          toast.success(editInitial?.id ? "Reserva actualizada" : "Reserva guardada");
        }}
      />

      <AssignTableDialog
        open={assignFor !== null}
        onOpenChange={(o) => !o && setAssignFor(null)}
        reservation={assignFor}
        freeTables={freeTables}
        onAssign={handleAssign}
      />
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))]")}>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={cn("text-xl font-semibold", highlight && "text-[hsl(var(--status-pending-fg))]")}>
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
