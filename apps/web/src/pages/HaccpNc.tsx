import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { HaccpLayout } from "@/components/haccp/HaccpLayout";
import {
  NonconformityForm,
  type NonconformityFormValues,
} from "@/components/haccp/NonconformityForm";
import { useRole } from "@/contexts/RoleContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpServiceDate } from "@/hooks/use-haccp-status";
import {
  useHaccpNonconformities,
  useCreateNonconformity,
  type NcListRow,
} from "@/hooks/use-haccp-nc";

// Lista de não conformidades (item 5, C1). Filtro Abertas/Verificadas/Todas,
// ordenada por occurred_at desc, "há Nh" e destaque coral em overdue. Consultor
// vê tudo (e verifica no detalhe) mas não regista manualmente.

type Filter = "abertas" | "verificadas" | "todas";

function hoursLabel(row: NcListRow): string {
  if (row.open_hours == null) return "";
  return `há ${Math.round(row.open_hours)}h`;
}

export default function HaccpNc() {
  const { role } = useRole();
  const canWrite = role !== "consultor";
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const listQuery = useHaccpNonconformities(restaurantId);
  const serviceDateQuery = useHaccpServiceDate(restaurantId);
  const createNc = useCreateNonconformity(restaurantId);

  const [filter, setFilter] = React.useState<Filter>("abertas");
  const [manualOpen, setManualOpen] = React.useState(false);

  const rows = (listQuery.data ?? []).filter((r) => {
    if (filter === "abertas") return r.nc_status !== "verificada";
    if (filter === "verificadas") return r.nc_status === "verificada";
    return true;
  });

  function submitManual(values: NonconformityFormValues) {
    if (!serviceDateQuery.data) return;
    createNc.mutate(
      {
        restaurantId: restaurantId as string,
        source: "manual",
        serviceDate: serviceDateQuery.data,
        ...values,
      },
      {
        onSuccess: () => {
          toast.success("Não conformidade registada.");
          setManualOpen(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registar."),
      },
    );
  }

  return (
    <HaccpLayout>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">
          Não conformidades
        </h1>
        {canWrite && (
          <Button onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> Registar manualmente
          </Button>
        )}
      </header>

      <div className="mb-4 flex gap-2">
        {(["abertas", "verificadas", "todas"] as const).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "min-h-9 rounded-full border px-3 text-sm transition-colors " +
                (active
                  ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                  : "border-input bg-card text-foreground hover:bg-muted")
              }
            >
              {f === "abertas" ? "Abertas" : f === "verificadas" ? "Verificadas" : "Todas"}
            </button>
          );
        })}
      </div>

      {listQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!listQuery.isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sem não conformidades neste filtro.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <Link
            key={r.id}
            to={`/haccp/nc/${r.id}`}
            className={
              "block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 " +
              (r.overdue ? "border-coral-600/50" : "border-input")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm font-medium">{r.description}</p>
              {r.nc_status === "verificada" ? (
                <span className="shrink-0 rounded-full bg-alga-100 px-2.5 py-0.5 text-xs font-medium text-alga-600">
                  verificada
                </span>
              ) : (
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                    (r.overdue ? "bg-coral-100 text-coral-600" : "bg-ambar-100 text-ambar-600")
                  }
                >
                  aberta · {hoursLabel(r)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat("pt-PT", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(r.occurred_at))}
              {r.source === "reception" && " · recepção"}
              {r.source === "temperature" && " · temperatura"}
              {r.source === "manual" && " · manual"}
            </p>
          </Link>
        ))}
      </div>

      <Dialog open={manualOpen} onOpenChange={setManualOpen} title="Registar não conformidade">
        <NonconformityForm submitting={createNc.isPending} onSubmit={submitManual} />
      </Dialog>
    </HaccpLayout>
  );
}
