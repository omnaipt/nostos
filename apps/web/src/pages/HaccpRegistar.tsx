import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { HaccpChip } from "@/components/haccp/HaccpLayout";
import { TempKeypad } from "@/components/haccp/TempKeypad";
import {
  NonconformityForm,
  type NonconformityFormValues,
} from "@/components/haccp/NonconformityForm";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpServiceDate, useHaccpTurnStatus } from "@/hooks/use-haccp-status";
import { useHaccpControlPoints } from "@/hooks/use-haccp-points";
import { useHaccpTurnReadings, useRecordTemperature } from "@/hooks/use-haccp-record";
import { useCreateNonconformity } from "@/hooks/use-haccp-nc";
import { useHaccpSync } from "@/hooks/use-haccp-sync";
import { supabase } from "@/integrations/supabase/client";
import { formatTemp } from "@/lib/haccp-keypad";
import type { HaccpControlPoint, HaccpTurnStatusRow } from "@/lib/types";

// Registar temperatura em dois toques (item 3, A2). Ponto → valor+confirmar.
// Desvio abre logo o formulário de NC (não bloqueia: pode adiar). Sem rede, o
// registo entra na fila offline com o chip "por sincronizar".

// Mensagens honestas para os erros de negócio do servidor.
const ERROR_COPY: Record<string, string> = {
  haccp_fora_da_janela:
    "Esta janela de turno já fechou. O registo fica em falta e não pode ser recuperado.",
  haccp_turno_nao_corre_hoje: "Este turno não corre hoje.",
};

function limitText(cp: HaccpControlPoint | undefined): string | null {
  if (!cp) return null;
  if (cp.min_c != null && cp.max_c != null) return `${fmt(cp.min_c)} a ${fmt(cp.max_c)} °C`;
  if (cp.max_c != null) return `≤ ${fmt(cp.max_c)} °C`;
  if (cp.min_c != null) return `≥ ${fmt(cp.min_c)} °C`;
  return null;
}
function fmt(n: number): string {
  return String(n).replace(".", ",");
}
// Sempre com 1 casa decimal ("4,0"), para as etiquetas de rectificação (spec).
function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function isNetwork(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return m.includes("failed to fetch") || m.includes("load failed") || m.includes("networkerror");
}

interface KeypadTarget {
  point: HaccpTurnStatusRow;
  mode: "record" | "rectify";
}

export default function HaccpRegistar() {
  const { turnId } = useParams<{ turnId: string }>();
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const timezone = restaurant?.timezone ?? undefined;

  const serviceDateQuery = useHaccpServiceDate(restaurantId);
  const serviceDate = serviceDateQuery.data;
  const statusQuery = useHaccpTurnStatus(restaurantId, serviceDate);
  const pointsQuery = useHaccpControlPoints(restaurantId);
  const readingsQuery = useHaccpTurnReadings(restaurantId, turnId, serviceDate);
  const record = useRecordTemperature(restaurantId);
  const createNc = useCreateNonconformity(restaurantId);

  const cpById = React.useMemo(
    () => new Map((pointsQuery.data ?? []).map((p) => [p.id, p as HaccpControlPoint])),
    [pointsQuery.data],
  );
  // Registos brutos indexados por id, para as etiquetas de diferido (dois
  // instantes) e de rectificação (valor original), que a RPC de estado não dá.
  const readingsById = React.useMemo(
    () => new Map((readingsQuery.data ?? []).map((r) => [r.id, r])),
    [readingsQuery.data],
  );
  const fmtClock = React.useCallback(
    (iso: string | null | undefined) =>
      iso
        ? new Intl.DateTimeFormat("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: timezone,
          }).format(new Date(iso))
        : "",
    [timezone],
  );
  const nameByPoint = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of statusQuery.data ?? [])
      for (const p of g.points) m.set(p.control_point_id, p.control_point_name);
    return m;
  }, [statusQuery.data]);
  const sync = useHaccpSync(restaurantId, (id) => nameByPoint.get(id));

  const group = (statusQuery.data ?? []).find((g) => g.turnId === turnId);
  const points = group?.points ?? [];
  const firstPending = points.find((p) => p.status === "por_verificar")?.control_point_id;

  const [keypad, setKeypad] = React.useState<KeypadTarget | null>(null);
  const [rectifyNote, setRectifyNote] = React.useState("");
  const [nc, setNc] = React.useState<{ readingId: string; point: HaccpTurnStatusRow; value: number } | null>(
    null,
  );
  const [serverTimeMsg, setServerTimeMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  function openRecord(point: HaccpTurnStatusRow) {
    setRectifyNote("");
    setKeypad({ point, mode: "record" });
  }
  function openRectify(point: HaccpTurnStatusRow) {
    setRectifyNote("");
    setKeypad({ point, mode: "rectify" });
  }

  async function confirmValue(value: number) {
    if (!keypad || !turnId) return;
    const { point, mode } = keypad;
    const note = mode === "rectify" ? rectifyNote.trim() : undefined;
    const rectifiesId = mode === "rectify" ? point.reading_id ?? undefined : undefined;

    // Sem rede: entra na fila offline, sem fingir conforme.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      sync.enqueueLocal({
        controlPointId: point.control_point_id,
        turnId,
        valueC: value,
        capturedAt: new Date().toISOString(),
        note,
        rectifiesId,
      });
      toast.message("Sem rede: registo em fila para sincronizar.");
      setKeypad(null);
      return;
    }

    setBusy(true);
    try {
      const res = await record.mutateAsync({
        controlPointId: point.control_point_id,
        turnId,
        valueC: value,
        note,
        rectifiesId,
      });
      // Hora do servidor (carimbo recorded_at): o colaborador percebe que não
      // é o relógio do telemóvel.
      const { data } = await supabase
        .from("haccp_temperature_readings")
        .select("recorded_at")
        .eq("id", res.id)
        .maybeSingle();
      const time = data?.recorded_at
        ? new Intl.DateTimeFormat("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: timezone,
          }).format(new Date(data.recorded_at))
        : "";
      setServerTimeMsg(time ? `Hora registada pelo servidor: ${time}` : null);
      setKeypad(null);
      if (!res.within_limits) {
        setNc({ readingId: res.id, point, value });
      } else {
        toast.success(time ? `Registado às ${time}` : "Registado");
      }
    } catch (err) {
      if (isNetwork(err)) {
        sync.enqueueLocal({
          controlPointId: point.control_point_id,
          turnId,
          valueC: value,
          capturedAt: new Date().toISOString(),
          note,
          rectifiesId,
        });
        toast.message("Sem rede: registo em fila para sincronizar.");
        setKeypad(null);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        const known = Object.keys(ERROR_COPY).find((k) => msg.includes(k));
        toast.error(known ? ERROR_COPY[known] : msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function submitNc(values: NonconformityFormValues) {
    if (!nc || !serviceDate) return;
    createNc.mutate(
      {
        restaurantId: restaurantId as string,
        source: "temperature",
        readingId: nc.readingId,
        serviceDate,
        turnId,
        ...values,
      },
      {
        onSuccess: () => {
          toast.success("Não conformidade registada.");
          setNc(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registar."),
      },
    );
  }

  const loading = serviceDateQuery.isLoading || statusQuery.isLoading || pointsQuery.isLoading;

  return (
    <div className="container max-w-2xl py-6">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/haccp" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Voltar">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">
            {group?.turnLabel ?? "Registar"}
          </h1>
          <p className="text-sm text-muted-foreground">Toque num ponto para registar a temperatura.</p>
        </div>
      </header>

      {serverTimeMsg && (
        <p className="mb-3 rounded-md border border-alga-600/30 bg-alga-100 px-3 py-2 text-sm text-alga-600">
          {serverTimeMsg}
        </p>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && points.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Este turno não tem pontos a verificar.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {points.map((p) => {
          const done = p.status !== "por_verificar";
          const highlight = p.control_point_id === firstPending;
          const pendingSync = !!turnId && sync.isPendingSync(p.control_point_id, turnId);
          const reading = p.reading_id ? readingsById.get(p.reading_id) : undefined;
          const original =
            reading?.rectifies_id != null ? readingsById.get(reading.rectifies_id) : undefined;
          return (
            <div
              key={p.control_point_id}
              className={
                "rounded-lg border bg-card p-4 " +
                (highlight ? "border-terracota-600 ring-1 ring-terracota-600" : "border-input")
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.control_point_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {limitText(cpById.get(p.control_point_id)) ?? ""}
                    {p.value_c != null && <> · leitura: {formatTemp(p.value_c)} °C</>}
                    {p.sync_mode === "deferred" &&
                      (reading?.captured_at ? (
                        <>
                          {" "}
                          · sincronizado em diferido: captado às {fmtClock(reading.captured_at)},
                          recebido às {fmtClock(reading.recorded_at)}
                        </>
                      ) : (
                        <> · sincronizado em diferido</>
                      ))}
                  </p>
                  {original && reading && (
                    <p className="text-xs text-muted-foreground">
                      corrigido: {fmt1(original.value_c)} → {fmt1(reading.value_c)}
                      {reading.note ? ` (${reading.note})` : ""}
                    </p>
                  )}
                </div>
                <HaccpChip status={p.status} pendingSync={pendingSync} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!done ? (
                  <Button size="lg" className="h-12 flex-1" onClick={() => openRecord(p)}>
                    Registar
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12"
                    onClick={() => openRectify(p)}
                  >
                    Corrigir leitura
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Teclado numérico */}
      <Dialog
        open={!!keypad}
        onOpenChange={(o) => !o && setKeypad(null)}
        title={
          keypad
            ? `${keypad.mode === "rectify" ? "Corrigir" : "Registar"}: ${keypad.point.control_point_name}`
            : ""
        }
      >
        {keypad?.mode === "rectify" && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Nota (obrigatória)</label>
            <Textarea
              value={rectifyNote}
              onChange={(e) => setRectifyNote(e.target.value)}
              placeholder="Porque corrige (mínimo 5 caracteres)."
            />
          </div>
        )}
        {keypad && (
          <TempKeypad
            confirmLabel={keypad.mode === "rectify" ? "Corrigir" : "Confirmar"}
            onConfirm={confirmValue}
            disabled={busy || (keypad.mode === "rectify" && rectifyNote.trim().length < 5)}
          />
        )}
      </Dialog>

      {/* Formulário de NC em ecrã inteiro (não fecha sem gravar ou adiar) */}
      {nc && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-card">
          <div className="container max-w-2xl py-6">
            <h2 className="font-display text-xl font-semibold text-atlantico-900">
              Desvio em {nc.point.control_point_name}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              A leitura ({formatTemp(nc.value)} °C) está fora dos limites. Registe a
              acção correctiva ou adie; o desvio fica visível como “desvio sem resposta”.
            </p>
            <NonconformityForm
              defaults={{
                measuredValue: `${formatTemp(nc.value)} °C`,
                limitText: limitText(cpById.get(nc.point.control_point_id)),
              }}
              submitting={createNc.isPending}
              onSubmit={submitNc}
              secondary={{ label: "Registar acção mais tarde", onClick: () => setNc(null) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
