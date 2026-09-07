import * as React from "react";
import { Link } from "react-router-dom";
import { Thermometer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { HaccpLayout, HaccpChip } from "@/components/haccp/HaccpLayout";
import { useRole } from "@/contexts/RoleContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import {
  useHaccpServiceDate,
  useHaccpTurnStatus,
  type HaccpTurnGroup,
} from "@/hooks/use-haccp-status";
import { useHaccpControlPoints } from "@/hooks/use-haccp-points";
import { useHaccpSync } from "@/hooks/use-haccp-sync";
import { shiftIsoDate } from "@/lib/service-date";

// Hub /haccp (item 2, A3): estado do turno de hoje. Cabeçalho com o dia de
// serviço + selector ontem/hoje; um cartão por turno com contagem e chips;
// botão grande para registar quando a janela está aberta (escondido a
// consultor); estado vazio honesto e banner da fila offline.

function formatDayLabel(iso: string, timezone: string | undefined): string {
  const d = new Date(`${iso}T12:00:00`);
  const s = new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(d);
  // "seg., 7 set." → "Seg, 7 Set" (capitaliza, tira pontos).
  return s
    .replace(/\./g, "")
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function formatTime(iso: string | null, timezone: string | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

export default function Haccp() {
  const { role } = useRole();
  const isConsultor = role === "consultor";
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const timezone = restaurant?.timezone ?? undefined;

  const serviceDateQuery = useHaccpServiceDate(restaurantId);
  const today = serviceDateQuery.data;
  const [selected, setSelected] = React.useState<"ontem" | "hoje">("hoje");
  const viewDate = today ? (selected === "hoje" ? today : shiftIsoDate(today, -1)) : undefined;

  const statusQuery = useHaccpTurnStatus(restaurantId, viewDate);
  const pointsQuery = useHaccpControlPoints(restaurantId);

  // Resolver de nomes para os toasts da sincronização diferida.
  const nameByPoint = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of statusQuery.data ?? [])
      for (const p of g.points) m.set(p.control_point_id, p.control_point_name);
    return m;
  }, [statusQuery.data]);
  const sync = useHaccpSync(restaurantId, (id) => nameByPoint.get(id));

  const groups = statusQuery.data ?? [];
  // Chips "por sincronizar" só fazem sentido no dia de serviço actual: os itens
  // da fila offline são captados no presente.
  const isToday = !!viewDate && viewDate === today;
  const noControlPoints = (pointsQuery.data ?? []).length === 0 && !pointsQuery.isLoading;
  const loading = serviceDateQuery.isLoading || statusQuery.isLoading || pointsQuery.isLoading;

  return (
    <HaccpLayout>
      {/* Banner da fila offline */}
      {sync.pendingCount > 0 && (
        <div className="mb-4 rounded-md border border-ambar-600/30 bg-ambar-100 px-3 py-2 text-sm font-medium text-ambar-600">
          {sync.pendingCount} registo{sync.pendingCount > 1 ? "s" : ""} por sincronizar
          {sync.trying && " · a tentar"}
        </div>
      )}

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">HACCP</h1>
          <p className="text-sm text-muted-foreground">
            {viewDate ? formatDayLabel(viewDate, timezone) : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {(["ontem", "hoje"] as const).map((opt) => {
            const active = selected === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSelected(opt)}
                aria-pressed={active}
                className={
                  "min-h-11 rounded-full border px-4 text-sm transition-colors " +
                  (active
                    ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                    : "border-input bg-card text-foreground hover:bg-muted")
                }
              >
                {opt === "hoje" ? "Hoje" : "Ontem"}
              </button>
            );
          })}
        </div>
      </header>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!loading && noControlPoints && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Ainda não há pontos de controlo. Comece por declarar os equipamentos
              de frio e de quente.
            </p>
            {role === "owner" || role === "gestor" ? (
              <Link to="/haccp/pontos" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Declarar pontos de controlo
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">Peça ao gerente para os configurar.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !noControlPoints && groups.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Neste dia não há turnos com serviço a verificar.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <TurnCard
            key={g.turnId}
            group={g}
            timezone={timezone}
            showButton={!isConsultor}
            isPending={(cpId) => isToday && sync.isPendingSync(cpId, g.turnId)}
          />
        ))}
      </div>
    </HaccpLayout>
  );
}

function TurnCard({
  group: g,
  timezone,
  showButton,
  isPending,
}: {
  group: HaccpTurnGroup;
  timezone: string | undefined;
  showButton: boolean;
  isPending: (controlPointId: string) => boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium">{g.turnLabel}</h2>
          <span className="text-sm text-muted-foreground">
            {g.verifiedCount} de {g.total} verificados
          </span>
        </div>

        <ul className="divide-y divide-border">
          {g.points.map((p) => (
            <li
              key={p.control_point_id}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span className="min-w-0 truncate text-sm">{p.control_point_name}</span>
              <HaccpChip status={p.status} pendingSync={isPending(p.control_point_id)} />
            </li>
          ))}
        </ul>

        {showButton && g.hasOpen && (
          <Link
            to={`/haccp/registar/${g.turnId}`}
            className={
              buttonVariants({ size: "lg" }) + " flex h-14 w-full items-center justify-center text-base"
            }
          >
            <Thermometer className="h-5 w-5" /> Registar temperaturas
          </Link>
        )}
        {showButton && !g.hasOpen && g.allFuture && (
          <p className="rounded-md border border-input bg-muted/30 py-3 text-center text-sm text-muted-foreground">
            Abre às {formatTime(g.opensAt, timezone)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
