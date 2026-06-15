import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableManager, type TableRow } from "@/components/tables/TableManager";
import { TurnManager, type TurnRow } from "@/components/turns/TurnManager";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useCreateTable, useDeleteTable, useTables, useUpdateTable } from "@/hooks/use-tables";
import { useCreateTurn, useDeleteTurn, useTurns, useUpdateTurn } from "@/hooks/use-turns";
import type { IsoWeekday } from "@/lib/types";

// C1 + C2 em definições: gerir mesas e turnos depois do onboarding.
// WIRING #4: dados via TanStack Query (RLS tenant-scoped). Os managers são
// controlados; cada onChange é diffado contra o estado servido para mapear a
// operação (create / update / toggle-active / delete) à mutação Supabase certa.

function tablesToRows(
  rows: { id: string; label: string; seats: number; sort_order: number; active: boolean }[],
): TableRow[] {
  return rows.map((m) => ({ id: m.id, label: m.label, seats: m.seats, sortOrder: m.sort_order, active: m.active }));
}

export default function Settings() {
  const { data: restaurant, isLoading: loadingRest, isError: restError } = useActiveRestaurant();
  const restaurantId = restaurant?.id;

  const tablesQuery = useTables(restaurantId);
  const turnsQuery = useTurns(restaurantId);

  const createTable = useCreateTable(restaurantId);
  const updateTable = useUpdateTable(restaurantId);
  const deleteTable = useDeleteTable(restaurantId);
  const createTurn = useCreateTurn(restaurantId);
  const updateTurn = useUpdateTurn(restaurantId);
  const deleteTurn = useDeleteTurn(restaurantId);

  const loading = loadingRest || tablesQuery.isLoading || turnsQuery.isLoading;
  const error = restError || tablesQuery.isError || turnsQuery.isError;

  const tables: TableRow[] = React.useMemo(
    () => tablesToRows(tablesQuery.data ?? []),
    [tablesQuery.data],
  );
  const turns: TurnRow[] = React.useMemo(
    () =>
      (turnsQuery.data ?? []).map((m) => ({
        id: m.id,
        label: m.label,
        startTime: m.start_time,
        service: m.service ?? "",
        weekdays: m.weekdays,
        active: m.active,
      })),
    [turnsQuery.data],
  );

  // Diff de mesas: o manager devolve a lista nova; deduzimos a operação.
  function onTablesChange(next: TableRow[]) {
    if (!restaurantId) return;
    const prevById = new Map(tables.map((t) => [t.id, t]));
    const nextById = new Map(next.map((t) => [t.id, t]));

    for (const t of next) {
      const prev = prevById.get(t.id);
      if (!prev) {
        // id local-* => criação.
        createTable.mutate(
          { restaurantId, label: t.label, seats: t.seats, sortOrder: t.sortOrder, active: t.active },
          { onSuccess: () => toast.success("Mesa criada"), onError: (e) => toast.error(errMsg(e)) },
        );
      } else if (
        prev.label !== t.label ||
        prev.seats !== t.seats ||
        prev.sortOrder !== t.sortOrder ||
        prev.active !== t.active
      ) {
        updateTable.mutate(
          { id: t.id, patch: { label: t.label, seats: t.seats, sort_order: t.sortOrder, active: t.active } },
          { onSuccess: () => toast.success("Mesa guardada"), onError: (e) => toast.error(errMsg(e)) },
        );
      }
    }
    for (const prev of tables) {
      if (!nextById.has(prev.id)) {
        deleteTable.mutate(prev.id, {
          onSuccess: () => toast.success("Mesa removida"),
          onError: (e) => toast.error(errMsg(e)),
        });
      }
    }
  }

  function onTurnsChange(next: TurnRow[]) {
    if (!restaurantId) return;
    const prevById = new Map(turns.map((t) => [t.id, t]));
    const nextById = new Map(next.map((t) => [t.id, t]));

    for (const t of next) {
      const prev = prevById.get(t.id);
      const service = t.service ? t.service : null;
      const weekdays = t.weekdays as IsoWeekday[];
      if (!prev) {
        createTurn.mutate(
          { restaurantId, label: t.label, service, startTime: t.startTime, weekdays, active: t.active },
          { onSuccess: () => toast.success("Turno criado"), onError: (e) => toast.error(errMsg(e)) },
        );
      } else if (
        prev.label !== t.label ||
        (prev.service ? prev.service : "") !== (t.service ?? "") ||
        prev.startTime !== t.startTime ||
        prev.active !== t.active ||
        JSON.stringify(prev.weekdays) !== JSON.stringify(t.weekdays)
      ) {
        updateTurn.mutate(
          { id: t.id, patch: { label: t.label, service, start_time: t.startTime, weekdays, active: t.active } },
          { onSuccess: () => toast.success("Turno guardado"), onError: (e) => toast.error(errMsg(e)) },
        );
      }
    }
    for (const prev of turns) {
      if (!nextById.has(prev.id)) {
        deleteTurn.mutate(prev.id, {
          onSuccess: () => toast.success("Turno removido"),
          onError: (e) => toast.error(errMsg(e)),
        });
      }
    }
  }

  return (
    <div className="container max-w-2xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mesas e turnos</h1>
        <Link to="/disponibilidade" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      {error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar as definições.</p>
            <button
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={() => {
                tablesQuery.refetch();
                turnsQuery.refetch();
              }}
            >
              Tentar novamente
            </button>
          </CardContent>
        </Card>
      )}

      {!error && loading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!error && !loading && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Esquema de mesas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tables.length === 0 && (
                <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                  Ainda não tens mesas. Adiciona a primeira.
                </p>
              )}
              <TableManager tables={tables} onChange={onTablesChange} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Turnos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {turns.length === 0 && (
                <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                  Ainda não tens turnos. Adiciona o primeiro.
                </p>
              )}
              <TurnManager turns={turns} onChange={onTurnsChange} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Não foi possível guardar. Tenta novamente.";
}
