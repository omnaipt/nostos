import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { HaccpLayout } from "@/components/haccp/HaccpLayout";
import { useRole } from "@/contexts/RoleContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useTurns } from "@/hooks/use-turns";
import {
  useHaccpControlPoints,
  useHaccpKindDefaults,
  useUpsertControlPoint,
  useDeactivateControlPoint,
  useCreateDefaultControlPoints,
  type ControlPointWithTurns,
} from "@/hooks/use-haccp-points";
import type { HaccpKindDefault, Turn } from "@/lib/types";

// Pontos de controlo (item 7, A1). Escrita owner/gestor; leitura para os
// outros. Sem apagar (desactivar mantém o histórico).

function fmt(n: number | null): string {
  return n == null ? "" : String(n).replace(".", ",");
}

function limitsLabel(cp: { min_c: number | null; max_c: number | null }): string {
  if (cp.min_c != null && cp.max_c != null) return `${fmt(cp.min_c)} a ${fmt(cp.max_c)} °C`;
  if (cp.max_c != null) return `≤ ${fmt(cp.max_c)} °C`;
  if (cp.min_c != null) return `≥ ${fmt(cp.min_c)} °C`;
  return "sem limite";
}

export default function HaccpPontos() {
  const { role } = useRole();
  const canWrite = role === "owner" || role === "gestor";
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;

  const pointsQuery = useHaccpControlPoints(restaurantId);
  const kindsQuery = useHaccpKindDefaults();
  const turnsQuery = useTurns(restaurantId);
  const upsert = useUpsertControlPoint(restaurantId);
  const deactivate = useDeactivateControlPoint(restaurantId);
  const createDefaults = useCreateDefaultControlPoints(restaurantId);

  const [editing, setEditing] = React.useState<ControlPointWithTurns | "new" | null>(null);

  const points = pointsQuery.data ?? [];
  const activeTurns = (turnsQuery.data ?? []).filter((t) => t.active);
  const kinds = kindsQuery.data ?? [];

  return (
    <HaccpLayout>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">
          Pontos de controlo
        </h1>
        {canWrite && points.length > 0 && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Novo ponto
          </Button>
        )}
      </header>

      {pointsQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!pointsQuery.isLoading && points.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Ainda não há pontos de controlo.
            </p>
            {canWrite && (
              <div className="flex flex-col items-center gap-2">
                <Button
                  onClick={() =>
                    createDefaults.mutate(undefined, {
                      onSuccess: () => toast.success("3 pontos criados."),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : "Não foi possível criar."),
                    })
                  }
                  disabled={createDefaults.isPending}
                >
                  Criar os 3 pontos habituais
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setEditing("new")}
                >
                  ou criar um à medida
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {points.map((cp) => (
          <div
            key={cp.id}
            className={
              "flex items-center justify-between gap-3 rounded-md border border-input bg-card p-3 " +
              (cp.active ? "" : "opacity-60")
            }
          >
            <Link to={`/haccp/pontos/${cp.id}`} className="min-w-0 flex-1 hover:opacity-80">
              <p className="truncate text-sm font-medium">
                {cp.name}
                {!cp.active && <span className="ml-2 text-xs text-muted-foreground">(inactivo)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {kinds.find((k) => k.kind === cp.kind)?.label ?? cp.kind} · {limitsLabel(cp)} ·{" "}
                {cp.all_turns ? "todos os turnos" : `${cp.turnIds.length} turno(s)`}
              </p>
            </Link>
            <div className="flex items-center gap-1">
              {canWrite && cp.active && (
                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(cp)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Link
                to={`/haccp/pontos/${cp.id}`}
                className={buttonVariants({ variant: "ghost", size: "icon" })}
                aria-label="Ver vista mensal"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {editing && canWrite && restaurantId && (
        <ControlPointDialog
          restaurantId={restaurantId}
          existing={editing === "new" ? null : editing}
          kinds={kinds}
          turns={activeTurns}
          sortOrder={editing === "new" ? points.length : (editing as ControlPointWithTurns).sort_order}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            upsert.mutate(input, {
              onSuccess: () => {
                toast.success("Ponto guardado.");
                setEditing(null);
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível guardar."),
            })
          }
          saving={upsert.isPending}
          onDeactivate={
            editing !== "new"
              ? () => {
                  if (
                    !window.confirm(
                      "Desactivar este ponto? Deixa de gerar verificações; o histórico mantém-se.",
                    )
                  )
                    return;
                  deactivate.mutate((editing as ControlPointWithTurns).id, {
                    onSuccess: () => {
                      toast.success("Ponto desactivado.");
                      setEditing(null);
                    },
                    onError: (e) =>
                      toast.error(e instanceof Error ? e.message : "Não foi possível desactivar."),
                  });
                }
              : undefined
          }
        />
      )}
    </HaccpLayout>
  );
}

function ControlPointDialog({
  restaurantId,
  existing,
  kinds,
  turns,
  sortOrder,
  onClose,
  onSave,
  saving,
  onDeactivate,
}: {
  restaurantId: string;
  existing: ControlPointWithTurns | null;
  kinds: HaccpKindDefault[];
  turns: Turn[];
  sortOrder: number;
  onClose: () => void;
  onSave: (input: Parameters<ReturnType<typeof useUpsertControlPoint>["mutate"]>[0]) => void;
  saving: boolean;
  onDeactivate?: () => void;
}) {
  const [name, setName] = React.useState(existing?.name ?? "");
  const [kind, setKind] = React.useState(existing?.kind ?? "");
  const [minC, setMinC] = React.useState(existing ? fmt(existing.min_c) : "");
  const [maxC, setMaxC] = React.useState(existing ? fmt(existing.max_c) : "");
  const [allTurns, setAllTurns] = React.useState(existing?.all_turns ?? true);
  const [turnIds, setTurnIds] = React.useState<string[]>(existing?.turnIds ?? []);
  const [error, setError] = React.useState<string>();

  const kindDef = kinds.find((k) => k.kind === kind);

  function onKindChange(k: string) {
    setKind(k);
    const def = kinds.find((x) => x.kind === k);
    // Prefill dos limites por defeito do tipo (só ao escolher; edição livre a seguir).
    setMinC(def?.min_c != null ? fmt(def.min_c) : "");
    setMaxC(def?.max_c != null ? fmt(def.max_c) : "");
  }

  function parse(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (name.trim().length < 1) {
      setError("Indique o nome do ponto.");
      return;
    }
    if (!kind) {
      setError("Escolha o tipo.");
      return;
    }
    const min = parse(minC);
    const max = parse(maxC);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setError("Limites inválidos.");
      return;
    }
    if (min == null && max == null) {
      setError("Defina pelo menos um limite.");
      return;
    }
    if (min != null && max != null && min >= max) {
      setError("O mínimo tem de ser menor que o máximo.");
      return;
    }
    if (!allTurns && turnIds.length === 0) {
      setError("Escolha pelo menos um turno ou marque “todos os turnos”.");
      return;
    }
    onSave({
      id: existing?.id,
      restaurantId,
      name: name.trim(),
      kind,
      minC: min,
      maxC: max,
      allTurns,
      turnIds,
      sortOrder,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={existing ? "Editar ponto" : "Novo ponto"}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="cp-name" label="Nome" required>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>

        <Field id="cp-kind" label="Tipo" required>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => onKindChange(e.target.value)}>
              <option value="">Escolher…</option>
              {kinds.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {kindDef && (
          <p className="text-xs text-muted-foreground">
            Fonte:{" "}
            <a href={kindDef.source_url} target="_blank" rel="noreferrer" className="underline">
              {kindDef.source_label}
            </a>
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field id="cp-min" label="Mínimo (°C)">
            {(p) => (
              <Input {...p} inputMode="decimal" value={minC} onChange={(e) => setMinC(e.target.value)} />
            )}
          </Field>
          <Field id="cp-max" label="Máximo (°C)">
            {(p) => (
              <Input {...p} inputMode="decimal" value={maxC} onChange={(e) => setMaxC(e.target.value)} />
            )}
          </Field>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={allTurns}
              onChange={(e) => setAllTurns(e.target.checked)}
            />
            Todos os turnos
          </label>
          {!allTurns && (
            <div className="space-y-1 rounded-md border border-input p-3">
              {turns.length === 0 && (
                <p className="text-xs text-muted-foreground">Não há turnos activos.</p>
              )}
              {turns.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={turnIds.includes(t.id)}
                    onChange={(e) =>
                      setTurnIds((prev) =>
                        e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                      )
                    }
                  />
                  {t.label} · {t.start_time.slice(0, 5)}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "A guardar…" : "Guardar"}
          </Button>
          {onDeactivate && (
            <Button type="button" variant="ghost" className="text-muted-foreground" onClick={onDeactivate}>
              Desactivar
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
