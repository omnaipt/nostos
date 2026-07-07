import * as React from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useIngredients } from "@/hooks/use-ingredients";
import { useMenuItems } from "@/hooks/use-menu";
import { useTechSheetLines, useTechSheets } from "@/hooks/use-tech-sheets";
import { formatCostCents } from "@/components/menu/PantryManager";
import { computeMenuMargins, formatPriceCents, type DishMargin } from "@/lib/types";

// Margens do menu (S3): ranking de pratos por margem, piores primeiro,
// com alerta abaixo da margem alvo do restaurante. Deriva tudo das fichas
// técnicas + despensa; sem ficha = sem números (chamada à acção).

export default function Margins() {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const itemsQuery = useMenuItems(restaurantId);
  const sheetsQuery = useTechSheets(restaurantId);
  const linesQuery = useTechSheetLines(restaurantId);
  const ingredientsQuery = useIngredients(restaurantId);

  const loading =
    loadingRest ||
    itemsQuery.isLoading ||
    sheetsQuery.isLoading ||
    linesQuery.isLoading ||
    ingredientsQuery.isLoading;
  const error =
    itemsQuery.isError || sheetsQuery.isError || linesQuery.isError || ingredientsQuery.isError;

  const targetPct = restaurant?.target_margin_pct ?? 65;

  const summary = React.useMemo(() => {
    if (!itemsQuery.data) return null;
    return computeMenuMargins(
      itemsQuery.data,
      sheetsQuery.data ?? [],
      linesQuery.data ?? [],
      new Map(
        (ingredientsQuery.data ?? []).map((i) => [
          i.id,
          { unit: i.unit, cost_per_unit_cents: i.cost_per_unit_cents },
        ]),
      ),
      targetPct,
    );
  }, [itemsQuery.data, sheetsQuery.data, linesQuery.data, ingredientsQuery.data, targetPct]);

  return (
    <div className="container max-w-3xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Margens do menu</h1>
          <p className="text-sm text-muted-foreground">
            Margem alvo: {targetPct}% (muda nas Definições)
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      {error && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Não foi possível carregar as margens.
          </CardContent>
        </Card>
      )}

      {!error && loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!error && !loading && summary && (
        <>
          <div className="mb-6 grid grid-cols-3 gap-3">
            <StatBox
              label="Food cost médio"
              value={summary.avgFoodCostPct != null ? `${summary.avgFoodCostPct.toFixed(0)}%` : "—"}
            />
            <StatBox
              label="Abaixo do alvo"
              value={String(summary.belowTargetCount)}
              bad={summary.belowTargetCount > 0}
            />
            <StatBox label="Fichas completas" value={String(summary.completeCount)} />
          </div>

          {summary.rows.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Sem pratos activos no menu.
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {summary.rows.map((row) => (
              <MarginRow key={row.itemId} row={row} targetPct={targetPct} />
            ))}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            A margem é calculada sobre o PVP com o food cost das fichas técnicas. Pratos com ficha
            parcial (linhas por ligar à despensa) mostram custo por defeito e não contam para os
            alertas.
          </p>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (bad ? "border-destructive/40 bg-destructive/10" : "border-input bg-card")
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={"mt-1 text-2xl font-semibold " + (bad ? "text-destructive" : "")}>{value}</p>
    </div>
  );
}

function MarginRow({ row, targetPct }: { row: DishMargin; targetPct: number }) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-md border p-3 " +
        (row.belowTarget ? "border-destructive/50 bg-destructive/5" : "border-input bg-card")
      }
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.name}</p>
        <p className="text-xs text-muted-foreground">
          {!row.hasSheet
            ? "Sem ficha técnica — cria uma nas Definições para veres a margem"
            : row.complete
              ? `Food cost ${formatCostCents(row.costCents)}`
              : `Food cost ${formatCostCents(row.costCents)} (parcial)`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums text-muted-foreground">{formatPriceCents(row.priceCents)}</p>
        {row.hasSheet && row.marginPct != null && (
          <p
            className={
              "text-sm font-semibold tabular-nums " +
              (row.belowTarget
                ? "text-destructive"
                : row.complete
                  ? "text-[hsl(var(--status-seated-fg))]"
                  : "text-muted-foreground")
            }
          >
            {row.marginPct.toFixed(0)}%
            {row.belowTarget && <span className="ml-1 font-normal">(alvo {targetPct}%)</span>}
          </p>
        )}
      </div>
      {row.hasSheet && (
        <Link
          to={`/fichas/${row.itemId}/imprimir`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label={`Imprimir ficha de ${row.name}`}
          title="Ficha de cozinha (imprimir)"
        >
          <Printer className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
