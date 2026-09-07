import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { HaccpLayout } from "@/components/haccp/HaccpLayout";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpServiceDate } from "@/hooks/use-haccp-status";
import { useHaccpControlPoints } from "@/hooks/use-haccp-points";
import { useHaccpExpectedReadings } from "@/hooks/use-haccp-dossier";
import { computeStats, isFlatline } from "@/lib/haccp-stats";

// Vista mensal por ponto de controlo (item 2, A3). Tabela dias × turnos com o
// valor registado; resumo do mês (min/max/média/desvio-padrão/distintos) e
// aviso âmbar quando o desvio-padrão é 0 com 10+ registos.

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}
function fmt1(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toFixed(1).replace(".", ",");
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthBounds(ym: string): { from: string; to: string; days: number } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, "0")}`,
    days: last,
  };
}

export default function HaccpPonto() {
  const { id } = useParams<{ id: string }>();
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const today = useHaccpServiceDate(restaurantId).data;

  const [month, setMonth] = React.useState<string | null>(null);
  const currentMonth = month ?? (today ? today.slice(0, 7) : null);

  const bounds = currentMonth ? monthBounds(currentMonth) : null;
  const expectedQuery = useHaccpExpectedReadings(restaurantId, bounds?.from, bounds?.to);
  const pointsQuery = useHaccpControlPoints(restaurantId);
  const point = (pointsQuery.data ?? []).find((p) => p.id === id);

  // Só as células deste ponto no mês.
  const cells = React.useMemo(
    () => (expectedQuery.data ?? []).filter((r) => r.control_point_id === id),
    [expectedQuery.data, id],
  );

  // Turnos distintos (colunas), ordenados pela abertura.
  const turns = React.useMemo(() => {
    const m = new Map<string, { label: string; opensAt: string | null }>();
    for (const c of cells) if (!m.has(c.turn_id)) m.set(c.turn_id, { label: c.turn_label, opensAt: c.opens_at });
    return [...m.entries()]
      .map(([turnId, v]) => ({ turnId, ...v }))
      .sort((a, b) => (a.opensAt ?? "").localeCompare(b.opensAt ?? ""));
  }, [cells]);

  // Índice (dia, turno) → célula.
  const cellByKey = React.useMemo(() => {
    const m = new Map<string, (typeof cells)[number]>();
    for (const c of cells) m.set(`${c.service_date}|${c.turn_id}`, c);
    return m;
  }, [cells]);

  const stats = React.useMemo(
    () => computeStats(cells.filter((c) => c.value_c != null).map((c) => c.value_c as number)),
    [cells],
  );
  const flat = isFlatline(stats);

  const loading = expectedQuery.isLoading || pointsQuery.isLoading || !currentMonth;

  return (
    <HaccpLayout>
      <header className="mb-4 flex items-center gap-2">
        <Link to="/haccp/pontos" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Voltar">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">
            {point?.name ?? "Ponto de controlo"}
          </h1>
          <p className="text-sm text-muted-foreground">Vista mensal por ponto de controlo.</p>
        </div>
      </header>

      {/* Selector de mês */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Mês anterior"
          className={buttonVariants({ variant: "outline", size: "icon" })}
          onClick={() => currentMonth && setMonth(shiftMonth(currentMonth, -1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium">{currentMonth ? monthLabel(currentMonth) : ""}</span>
        <button
          type="button"
          aria-label="Mês seguinte"
          className={buttonVariants({ variant: "outline", size: "icon" })}
          onClick={() => currentMonth && setMonth(shiftMonth(currentMonth, 1))}
          disabled={!!today && !!currentMonth && currentMonth >= today.slice(0, 7)}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && bounds && (
        <>
          <Card className="mb-4">
            <CardContent className="overflow-x-auto py-3">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-1 pr-2 font-medium">Dia</th>
                    {turns.map((t) => (
                      <th key={t.turnId} className="py-1 pr-2 font-medium">
                        {t.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: bounds.days }, (_, i) => {
                    const dayIso = `${currentMonth}-${String(i + 1).padStart(2, "0")}`;
                    return (
                      <tr key={dayIso} className="border-b border-border/50">
                        <td className="py-1 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                        {turns.map((t) => {
                          const c = cellByKey.get(`${dayIso}|${t.turnId}`);
                          if (!c) return <td key={t.turnId} className="py-1 pr-2 text-muted-foreground/40">·</td>;
                          if (c.status === "em_falta")
                            return (
                              <td key={t.turnId} className="py-1 pr-2 text-muted-foreground">
                                falta
                              </td>
                            );
                          if (c.status === "futuro" || c.status === "por_verificar")
                            return <td key={t.turnId} className="py-1 pr-2" />;
                          const deviated = c.value_c != null && c.within_limits === false;
                          return (
                            <td
                              key={t.turnId}
                              className={"py-1 pr-2 tabular-nums " + (deviated ? "font-medium text-coral-600" : "")}
                            >
                              {c.value_c != null ? `${fmtNum(c.value_c)}°` : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <h2 className="mb-2 text-sm font-semibold">Resumo do mês</h2>
              {stats.count === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registos neste mês.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <Stat label="Mínimo" value={`${fmt1(stats.min)} °C`} />
                  <Stat label="Máximo" value={`${fmt1(stats.max)} °C`} />
                  <Stat label="Média" value={`${fmt1(stats.mean)} °C`} />
                  <Stat label="Desvio-padrão" value={fmt1(stats.stdDev)} />
                  <Stat label="Valores distintos" value={String(stats.distinct)} />
                  <Stat label="Registos" value={String(stats.count)} />
                </dl>
              )}
              {flat && (
                <p className="mt-3 rounded-md border border-ambar-600/30 bg-ambar-100 px-3 py-2 text-sm text-ambar-600">
                  Valores sempre iguais: um inspector lê isto como registo não real.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </HaccpLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/50 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
