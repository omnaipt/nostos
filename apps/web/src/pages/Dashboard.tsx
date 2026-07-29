import * as React from "react";
import { Link } from "react-router-dom";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useOwnerSummary, type WeekSummary } from "@/hooks/use-owner-summary";
import { useIngredients } from "@/hooks/use-ingredients";
import { useItemVariants, useMenuItems } from "@/hooks/use-menu";
import { useTechSheetLines, useTechSheets } from "@/hooks/use-tech-sheets";
import { useLastAppliedImport } from "@/hooks/use-saft";
import { computeMenuMargins } from "@/lib/types";
import { computePantrySummary } from "@/lib/stock";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MareDivider } from "@/components/MareDivider";

// Saudação na voz da casa, por hora do dia (direcção Costeiro 29-07).
function saudacao(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 13) return "Bom dia. A casa está pronta.";
  if (h >= 13 && h < 20) return "Boa tarde. A casa está pronta.";
  return "Boa noite. A casa está pronta.";
}

export default function Dashboard() {
  const { data: restaurant } = useActiveRestaurant();
  const publicUrl = restaurant?.slug ? `${window.location.origin}/r/${restaurant.slug}` : null;
  const menuUrl = restaurant?.slug ? `${window.location.origin}/m/${restaurant.slug}` : null;
  const summaryQuery = useOwnerSummary(restaurant?.id);

  // Margens (S3): food cost médio + pratos abaixo do alvo, derivados das fichas.
  const itemsQuery = useMenuItems(restaurant?.id);
  const variantsQuery = useItemVariants(restaurant?.id);
  const sheetsQuery = useTechSheets(restaurant?.id);
  const sheetLinesQuery = useTechSheetLines(restaurant?.id);
  const ingredientsQuery = useIngredients(restaurant?.id);
  const margins = React.useMemo(() => {
    if (!itemsQuery.data || !restaurant) return null;
    // Gap E: pratos `variants` contam nos alertas e no "Fichas completas"
    // pela variante principal.
    const variantsByItem = new Map<string, { price_cents: number | null; is_default: boolean }[]>();
    for (const v of variantsQuery.data ?? []) {
      const arr = variantsByItem.get(v.item_id) ?? [];
      arr.push({ price_cents: v.price_cents, is_default: v.is_default });
      variantsByItem.set(v.item_id, arr);
    }
    return computeMenuMargins(
      itemsQuery.data,
      sheetsQuery.data ?? [],
      sheetLinesQuery.data ?? [],
      new Map(
        (ingredientsQuery.data ?? []).map((i) => [
          i.id,
          { unit: i.unit, cost_per_unit_cents: i.cost_per_unit_cents },
        ]),
      ),
      restaurant.target_margin_pct ?? 65,
      variantsByItem,
    );
  }, [itemsQuery.data, variantsQuery.data, sheetsQuery.data, sheetLinesQuery.data, ingredientsQuery.data, restaurant]);

  // Despensa + fecho SAF-T (0011/0012): alerta de reposição e último fecho.
  const pantry = React.useMemo(
    () => (ingredientsQuery.data ? computePantrySummary(ingredientsQuery.data) : null),
    [ingredientsQuery.data],
  );
  const lastAppliedQuery = useLastAppliedImport(restaurant?.id);
  return (
    <div className="container py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-atlantico-900">{saudacao()}</h1>
        <MareDivider className="mt-3" />
      </header>
      {(publicUrl || menuUrl) && (
        <div className="mb-6 space-y-1 rounded-md border border-input bg-card p-3 text-sm">
          {publicUrl && (
            <p>
              <span className="text-muted-foreground">Reservas (link público): </span>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                {publicUrl}
              </a>
            </p>
          )}
          {menuUrl && (
            <p>
              <span className="text-muted-foreground">Menu (link público): </span>
              <a href={menuUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                {menuUrl}
              </a>
              <Link to="/ementa" className="ml-2 text-muted-foreground underline">
                QR para imprimir
              </Link>
            </p>
          )}
        </div>
      )}
      {/* Resumo semanal do dono (v0 do relatório da S2) */}
      <section aria-label="Resumo da semana" className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Esta semana
          {summaryQuery.data && (
            <span className="font-normal"> · {formatRange(summaryQuery.data.current)}</span>
          )}
        </h2>
        {summaryQuery.isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}
        {summaryQuery.isError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Não foi possível carregar o resumo.
          </p>
        )}
        {summaryQuery.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Reservas"
              value={summaryQuery.data.current.total}
              delta={summaryQuery.data.current.total - summaryQuery.data.previous.total}
            />
            <Stat
              label="Pelo link público"
              value={summaryQuery.data.current.publicCount}
              delta={summaryQuery.data.current.publicCount - summaryQuery.data.previous.publicCount}
            />
            <Stat
              label="Pax"
              value={summaryQuery.data.current.pax}
              delta={summaryQuery.data.current.pax - summaryQuery.data.previous.pax}
            />
            <Stat
              label="Clientes novos"
              value={summaryQuery.data.current.newCustomers}
              delta={summaryQuery.data.current.newCustomers - summaryQuery.data.previous.newCustomers}
            />
            <Stat
              label="No-shows"
              value={summaryQuery.data.current.noShows}
              delta={summaryQuery.data.current.noShows - summaryQuery.data.previous.noShows}
              invert
            />
            <Stat
              label="Por confirmar"
              value={summaryQuery.data.pendingNow}
              highlight={summaryQuery.data.pendingNow > 0}
            />
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Disponibilidade</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Ver mesas e turnos do dia e gerir reservas.</p>
            <Link to="/disponibilidade" className={buttonVariants()}>Abrir disponibilidade</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ementa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Pratos, pratos do dia, doses, fichas técnicas e o QR do menu.
            </p>
            <Link to="/ementa" className={buttonVariants({ variant: "outline" })}>Abrir ementa</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Clientes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Consultar fichas de cliente, notas e histórico de reservas.</p>
            <Link to="/clientes" className={buttonVariants({ variant: "outline" })}>Abrir clientes</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Definições</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Mesas, turnos, margem alvo, catálogo da despensa e tom da casa.
            </p>
            <Link to="/definicoes" className={buttonVariants({ variant: "outline" })}>Abrir definições</Link>
          </CardContent>
        </Card>
        <Card
          className={
            margins && margins.belowTargetCount > 0 ? "border-destructive/50" : undefined
          }
        >
          <CardHeader><CardTitle>Margens</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {margins && margins.completeCount > 0 ? (
                <>
                  Food cost médio{" "}
                  <strong className="text-foreground">
                    {margins.avgFoodCostPct != null ? `${margins.avgFoodCostPct.toFixed(0)}%` : "—"}
                  </strong>
                  {margins.belowTargetCount > 0 ? (
                    <>
                      {" "}·{" "}
                      <strong className="text-destructive">
                        {margins.belowTargetCount} prato{margins.belowTargetCount > 1 ? "s" : ""} abaixo do alvo
                      </strong>
                    </>
                  ) : (
                    <> · todos os pratos no alvo</>
                  )}
                </>
              ) : (
                "Cria fichas técnicas para veres o food cost e a margem de cada prato."
              )}
            </p>
            <Link
              to="/margens"
              className={buttonVariants(
                margins && margins.belowTargetCount > 0 ? {} : { variant: "outline" },
              )}
            >
              Abrir margens
            </Link>
          </CardContent>
        </Card>
        <Card className={pantry && pantry.belowMinCount > 0 ? "border-destructive/50" : undefined}>
          <CardHeader><CardTitle>Despensa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pantry && pantry.belowMinCount > 0 ? (
                <strong className="text-destructive">
                  {pantry.belowMinCount} ingrediente{pantry.belowMinCount > 1 ? "s" : ""} abaixo do
                  mínimo
                </strong>
              ) : (
                "Saldos, alertas de reposição e rasto de movimentos."
              )}
            </p>
            <Link
              to="/despensa"
              className={buttonVariants(
                pantry && pantry.belowMinCount > 0 ? {} : { variant: "outline" },
              )}
            >
              Abrir despensa
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fecho do dia (SAF-T)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {lastAppliedQuery.data
                ? `Último fecho: ${new Date(
                    lastAppliedQuery.data.applied_at ?? lastAppliedQuery.data.created_at,
                  ).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })} · ${
                    lastAppliedQuery.data.invoices_count
                  } faturas`
                : "Importa o SAF-T do dia; as vendas abatem a despensa pelas fichas."}
            </p>
            <Link to="/fecho-dia" className={buttonVariants({ variant: "outline" })}>
              Abrir fecho do dia
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatRange(week: WeekSummary): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  };
  return `${fmt(week.weekStart)} a ${fmt(week.weekEnd)}`;
}

function Stat({
  label,
  value,
  delta,
  invert,
  highlight,
}: {
  label: string;
  value: number;
  delta?: number;
  invert?: boolean;
  highlight?: boolean;
}) {
  // invert: para métricas más (no-shows), subir é mau.
  const good = delta !== undefined && delta !== 0 && (invert ? delta < 0 : delta > 0);
  const bad = delta !== undefined && delta !== 0 && (invert ? delta > 0 : delta < 0);
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (highlight
          ? "border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))]"
          : "border-input bg-card")
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-atlantico-900">{value}</p>
      {delta !== undefined && (
        <p
          className={
            "text-xs " +
            (good
              ? "text-[hsl(var(--status-seated-fg))]"
              : bad
                ? "text-destructive"
                : "text-muted-foreground")
          }
        >
          {delta > 0 ? "+" : ""}
          {delta} vs semana anterior
        </p>
      )}
    </div>
  );
}
