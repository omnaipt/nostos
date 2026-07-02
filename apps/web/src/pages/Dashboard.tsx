import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useOwnerSummary, type WeekSummary } from "@/hooks/use-owner-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { data: restaurant } = useActiveRestaurant();
  const publicUrl = restaurant?.slug ? `${window.location.origin}/r/${restaurant.slug}` : null;
  const summaryQuery = useOwnerSummary(restaurant?.id);
  return (
    <div className="container py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">STOA</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
        </div>
      </header>
      {publicUrl && (
        <p className="mb-6 rounded-md border border-input bg-card p-3 text-sm">
          <span className="text-muted-foreground">Link público de reservas: </span>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            {publicUrl}
          </a>
        </p>
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
          <CardHeader><CardTitle>Clientes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Consultar fichas de cliente, notas e histórico de reservas.</p>
            <Link to="/clientes" className={buttonVariants({ variant: "outline" })}>Abrir clientes</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mesas e turnos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Configurar o esquema de mesas e os turnos.</p>
            <Link to="/definicoes" className={buttonVariants({ variant: "outline" })}>Abrir definições</Link>
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
      <p className="mt-1 text-2xl font-semibold">{value}</p>
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
