import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CasaLogo } from "@/components/CasaLogo";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useTeam } from "@/hooks/use-team";
import {
  useHaccpExpectedReadings,
  useHaccpNcRange,
  useHaccpPeriodSummary,
  useHaccpReadingsRange,
  useHaccpReceptionsRange,
  useProfileName,
  type DossierReception,
  type RawReading,
} from "@/hooks/use-haccp-dossier";
import { supabase } from "@/integrations/supabase/client";
import { statusMeta } from "@/lib/haccp-status";
import { ROLE_LABEL } from "@/lib/roles";
import { HACCP_REJECTION_CAUSE_LABEL, type HaccpRejectionCause } from "@/lib/types";

// Página de impressão do dossiê (item 1, E1), SEM chrome do AppShell (mesmo
// padrão de /fichas/:id/imprimir). Optimizada para A4 com @media print: quebras
// por secção, sem fundos pesados, tipografia legível a preto. O PDF é produzido
// pelo browser (window.print).

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}
function limitsLabel(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${fmtNum(min)} a ${fmtNum(max)} °C`;
  if (max != null) return `≤ ${fmtNum(max)} °C`;
  if (min != null) return `≥ ${fmtNum(min)} °C`;
  return "sem limite definido";
}

export default function HaccpDossiePrint() {
  const [params] = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const timezone = restaurant?.timezone ?? undefined;

  const summaryQuery = useHaccpPeriodSummary(restaurantId, validRange ? from : undefined, validRange ? to : undefined);
  const expectedQuery = useHaccpExpectedReadings(restaurantId, validRange ? from : undefined, validRange ? to : undefined);
  const readingsQuery = useHaccpReadingsRange(restaurantId, validRange ? from : undefined, validRange ? to : undefined);
  const receptionsQuery = useHaccpReceptionsRange(restaurantId, validRange ? from : undefined, validRange ? to : undefined);
  const ncQuery = useHaccpNcRange(restaurantId, validRange ? from : undefined, validRange ? to : undefined);
  const teamQuery = useTeam(restaurantId);
  const profileName = useProfileName().data;

  // Instante de geração: fixado uma vez (não recalcular a cada render).
  const generatedAt = React.useRef(new Date());

  const readingsById = React.useMemo(() => {
    const m = new Map<string, RawReading>();
    for (const r of readingsQuery.data ?? []) m.set(r.id, r);
    return m;
  }, [readingsQuery.data]);

  const nameByUser = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teamQuery.data ?? []) m.set(t.userId, t.name ?? ROLE_LABEL[t.role]);
    return m;
  }, [teamQuery.data]);
  const who = React.useCallback(
    (userId: string | null | undefined) => (userId && nameByUser.get(userId)) || "membro da equipa",
    [nameByUser],
  );

  const fmtDate = React.useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat("pt-PT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: timezone,
      }).format(new Date(`${iso}T12:00:00`)),
    [timezone],
  );
  const fmtClock = React.useCallback(
    (iso: string | null | undefined) =>
      iso
        ? new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(
            new Date(iso),
          )
        : "",
    [timezone],
  );
  const fmtStamp = React.useCallback(
    (d: Date) =>
      new Intl.DateTimeFormat("pt-PT", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone,
      }).format(d),
    [timezone],
  );

  // URLs assinadas das fotos das recepções (1 h). Uma só chamada em lote.
  const photoPaths = React.useMemo(
    () => (receptionsQuery.data ?? []).map((r) => r.photo_path).filter((p): p is string => !!p),
    [receptionsQuery.data],
  );
  const photosQuery = useQuery({
    queryKey: ["haccp", "dossie-photos", restaurantId, from, to, photoPaths.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      if (photoPaths.length === 0) return out;
      const { data, error } = await supabase.storage
        .from("haccp-evidence")
        .createSignedUrls(photoPaths, 3600);
      if (error) throw error;
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
      }
      return out;
    },
    enabled: !!restaurantId && photoPaths.length > 0,
  });

  const loading =
    loadingRest ||
    summaryQuery.isLoading ||
    expectedQuery.isLoading ||
    readingsQuery.isLoading ||
    receptionsQuery.isLoading ||
    ncQuery.isLoading;

  // Tempo de render (evidência de desempenho): do mount até os dados prontos.
  const [renderMs, setRenderMs] = React.useState<number | null>(null);
  const mountedAt = React.useRef<number | null>(null);
  if (mountedAt.current == null && typeof performance !== "undefined") mountedAt.current = performance.now();
  React.useEffect(() => {
    if (!loading && renderMs == null && mountedAt.current != null && typeof performance !== "undefined") {
      setRenderMs(Math.round(performance.now() - mountedAt.current));
    }
  }, [loading, renderMs]);

  if (!validRange) {
    return (
      <div className="container max-w-2xl py-8 text-center">
        <p className="text-sm text-muted-foreground">Intervalo inválido.</p>
        <Link to="/haccp/dossie" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-4"}>
          Voltar ao dossiê
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container max-w-3xl py-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  const summary = summaryQuery.data;
  const expected = expectedQuery.data ?? [];
  const receptions = receptionsQuery.data ?? [];
  const ncs = ncQuery.data ?? [];

  // Agrupar as células por dia → turno, preservando a ordem da RPC.
  type Cell = (typeof expected)[number];
  const byDay = new Map<string, Map<string, { label: string; cells: Cell[] }>>();
  for (const c of expected) {
    if (c.status === "futuro") continue; // fora do dossiê (ainda não abriu)
    let day = byDay.get(c.service_date);
    if (!day) {
      day = new Map();
      byDay.set(c.service_date, day);
    }
    let turn = day.get(c.turn_id);
    if (!turn) {
      turn = { label: c.turn_label, cells: [] };
      day.set(c.turn_id, turn);
    }
    turn.cells.push(c);
  }
  const days = [...byDay.keys()].sort();

  const estab = restaurant?.name ?? "";
  const footerText = `${estab} · ${from} a ${to} · gerado a ${fmtStamp(generatedAt.current)}`;

  return (
    <div className="dossie container max-w-3xl py-8 text-atlantico-900 print:max-w-none print:py-0 print:text-black">
      <style>{PRINT_CSS}</style>

      {/* Barra de acção (só ecrã) */}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link to="/haccp/dossie" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
        <div className="flex items-center gap-3">
          {renderMs != null && (
            <span className="text-xs text-muted-foreground">renderizado em {renderMs} ms</span>
          )}
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Guardar em PDF
          </Button>
        </div>
      </div>
      <p className="mb-6 rounded-md border border-input bg-muted/30 p-3 text-xs text-muted-foreground print:hidden">
        Em iOS ou Android: Partilhar, depois Imprimir, depois Guardar em PDF.
      </p>

      {/* Rodapé fixo repetido em cada página impressa (fallback: também no fim de cada secção) */}
      <div className="dossie-footer" aria-hidden="true">
        {footerText}
      </div>

      {/* (1) CAPA */}
      <section className="dossie-section">
        <div className="flex items-start gap-4 border-b border-border pb-4 print:border-black">
          {restaurant && <CasaLogo name={restaurant.name} logoUrl={restaurant.logo_url} size={56} />}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground print:text-black">
              Dossiê HACCP para inspecção
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold print:text-black">{estab}</h1>
            <p className="mt-1 text-sm text-muted-foreground print:text-black">{restaurant?.slug}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground print:text-black">Período</dt>
            <dd>
              {fmtDate(from)} a {fmtDate(to)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground print:text-black">Gerado em</dt>
            <dd>{fmtStamp(generatedAt.current)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground print:text-black">Gerado por</dt>
            <dd>{profileName ?? "não identificado"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground print:text-black">
          Documento gerado pelo Nostos a partir de registos com carimbo temporal de servidor. Não
          substitui o plano HACCP.
        </p>
      </section>

      {/* (2) SUMÁRIO DE CONFORMIDADE */}
      <section className="dossie-section">
        <h2 className="dossie-h2">Sumário de conformidade do período</h2>
        {summary && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <SummaryRow label="Verificações esperadas" value={summary.expected} />
            <SummaryRow label="Registadas" value={summary.recorded} />
            <SummaryRow label="Em falta" value={summary.missing} coral={summary.missing > 0} />
            <SummaryRow
              label="Taxa de preenchimento"
              value={`${Math.round(summary.completion_rate * 100)}%`}
            />
            <SummaryRow label="Desvios" value={summary.deviations} />
            <SummaryRow
              label="Desvios sem resposta"
              value={summary.deviations_unanswered}
              coral={summary.deviations_unanswered > 0}
            />
            <SummaryRow label="NC abertas" value={summary.nc_open} coral={summary.nc_open > 0} />
            <SummaryRow label="NC verificadas" value={summary.nc_verified} />
            <SummaryRow label="Recepções" value={summary.receptions} />
            <SummaryRow label="Recusas" value={summary.rejections} coral={summary.rejections > 0} />
          </div>
        )}
        <p className="dossie-section-footer">{footerText}</p>
      </section>

      {/* (3) REGISTOS DE TEMPERATURA */}
      <section className="dossie-section">
        <h2 className="dossie-h2">Registos de temperatura</h2>
        {days.length === 0 && <p className="text-sm">Sem registos esperados no período.</p>}
        {days.map((day) => (
          <div key={day} className="dossie-day">
            <h3 className="mt-4 text-sm font-semibold">{fmtDate(day)}</h3>
            {[...byDay.get(day)!.entries()].map(([turnId, turn]) => (
              <div key={turnId} className="mt-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-black">
                  {turn.label}
                </p>
                <table className="dossie-table">
                  <thead>
                    <tr>
                      <th>Ponto</th>
                      <th>Valor</th>
                      <th>Limites</th>
                      <th>Hora</th>
                      <th>Quem</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turn.cells.map((c) => {
                      if (c.status === "em_falta") {
                        return (
                          <tr key={c.control_point_id} className="dossie-missing">
                            <td>{c.control_point_name}</td>
                            <td colSpan={4} className="font-bold">
                              EM FALTA
                            </td>
                            <td>não recuperável</td>
                          </tr>
                        );
                      }
                      const raw = c.reading_id ? readingsById.get(c.reading_id) : undefined;
                      const original = raw?.rectifies_id ? readingsById.get(raw.rectifies_id) : undefined;
                      const meta = statusMeta(c.status);
                      const deviated = meta.tone === "coral";
                      return (
                        <tr key={c.control_point_id} className={deviated ? "dossie-deviation" : ""}>
                          <td>{c.control_point_name}</td>
                          <td>
                            {original ? (
                              <>
                                <span className="line-through">{fmtNum(original.value_c)}</span>{" "}
                                <strong>{fmtNum(raw?.value_c ?? c.value_c)}</strong> °C
                              </>
                            ) : c.value_c != null ? (
                              <>{fmtNum(c.value_c)} °C</>
                            ) : (
                              "sem valor"
                            )}
                          </td>
                          <td>{limitsLabel(raw?.min_c ?? null, raw?.max_c ?? null)}</td>
                          <td>
                            {fmtClock(raw?.recorded_at ?? c.recorded_at)}
                            {raw?.sync_mode === "deferred" && raw.captured_at && (
                              <span className="block text-[10px]">
                                captado {fmtClock(raw.captured_at)}
                              </span>
                            )}
                          </td>
                          <td>{who(raw?.recorded_by)}</td>
                          <td>
                            {meta.label}
                            {original && raw?.note && (
                              <span className="block text-[10px]">rectificado: {raw.note}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}
        <p className="dossie-section-footer">{footerText}</p>
      </section>

      {/* (4) RECEPÇÕES E RECUSAS */}
      <section className="dossie-section">
        <h2 className="dossie-h2">Recepções e recusas</h2>
        {receptions.length === 0 && <p className="text-sm">Sem recepções no período.</p>}
        <div className="space-y-3">
          {receptions.map((r) => (
            <ReceptionBlock
              key={r.id}
              reception={r}
              photoUrl={r.photo_path ? photosQuery.data?.[r.photo_path] : undefined}
              fmtStamp={fmtStamp}
              who={who}
            />
          ))}
        </div>
        <p className="dossie-section-footer">{footerText}</p>
      </section>

      {/* (5) NÃO CONFORMIDADES */}
      <section className="dossie-section">
        <h2 className="dossie-h2">Não conformidades</h2>
        {ncs.length === 0 && <p className="text-sm">Sem não conformidades no período.</p>}
        <div className="space-y-3">
          {ncs.map((nc) => {
            const verified = nc.nc_status === "verificada";
            return (
              <div key={nc.id} className="dossie-card">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{nc.description}</p>
                  {!verified && nc.open_hours != null && (
                    <span className="whitespace-nowrap text-xs font-medium text-coral-600 print:text-black">
                      aberta há {Math.round(nc.open_hours)} h
                    </span>
                  )}
                </div>
                <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                  <NcRow label="Valor / limite" value={ncValue(nc.measured_value, nc.limit_text)} />
                  <NcRow label="Destino do produto" value={nc.product_disposition} />
                  <NcRow label="Acção imediata" value={nc.immediate_action} />
                  <NcRow label="Acção sobre a causa" value={nc.root_cause_action} />
                  <NcRow label="Quem executou" value={nc.executed_by_name} />
                  <NcRow label="Registada por" value={who(nc.recorded_by)} />
                </dl>
                <p className={"mt-1 text-xs " + (verified ? "" : "font-medium text-coral-600 print:text-black")}>
                  Verificação de eficácia:{" "}
                  {verified ? (nc.effective ? "eficaz" : "não eficaz") : "por verificar"}
                </p>
              </div>
            );
          })}
        </div>
        <p className="dossie-section-footer">{footerText}</p>
      </section>

      {/* (6) RODAPÉ FINAL: nota de retenção na última página */}
      <section className="dossie-section">
        <p className="text-xs text-muted-foreground print:text-black">
          {restaurant?.haccp_retention_note}
        </p>
        <p className="dossie-section-footer">{footerText}</p>
      </section>
    </div>
  );
}

function ncValue(measured: string | null, limit: string | null): string | null {
  if (!measured && !limit) return null;
  return `${measured ?? "sem valor"} (limite ${limit ?? "não definido"})`;
}

function SummaryRow({
  label,
  value,
  coral,
}: {
  label: string;
  value: React.ReactNode;
  coral?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-0.5 print:border-black/20">
      <span className="text-muted-foreground print:text-black">{label}</span>
      <span className={"font-semibold " + (coral ? "text-coral-600 print:text-black" : "")}>{value}</span>
    </div>
  );
}

function NcRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <dt className="uppercase tracking-wide text-muted-foreground print:text-black">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReceptionBlock({
  reception: r,
  photoUrl,
  fmtStamp,
  who,
}: {
  reception: DossierReception;
  photoUrl: string | undefined;
  fmtStamp: (d: Date) => string;
  who: (userId: string | null | undefined) => string;
}) {
  const rejected = !r.conforming;
  return (
    <div className={"dossie-card " + (rejected ? "dossie-rejection" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {r.supplier_name ?? "Fornecedor"}
            {rejected && <span className="ml-2 text-xs font-medium text-coral-600 print:text-black">RECUSA</span>}
          </p>
          <p className="text-xs text-muted-foreground print:text-black">
            Entrega {r.delivered_on} · registada {fmtStamp(new Date(r.recorded_at))} · {who(r.recorded_by)}
          </p>
          <p className="mt-1 text-xs">
            {r.temperature_applicable && r.temperature_c != null && (
              <>Temperatura {fmtNum(r.temperature_c)} °C · </>
            )}
            Validade {r.expiry_ok ? "OK" : "não OK"} · Embalagem {r.packaging_ok ? "OK" : "não OK"}
          </p>
          {rejected && r.rejection_cause && (
            <p className="mt-1 text-xs">
              Causa: {HACCP_REJECTION_CAUSE_LABEL[r.rejection_cause as HaccpRejectionCause] ?? r.rejection_cause}
              {r.rejection_quantity ? ` · ${r.rejection_quantity}` : ""}
              {r.rejection_description ? ` · ${r.rejection_description}` : ""}
            </p>
          )}
        </div>
        {photoUrl && (
          <img src={photoUrl} alt="Fotografia da recepção" className="h-16 w-16 rounded object-cover" />
        )}
      </div>
    </div>
  );
}

// CSS de impressão: A4, quebras por secção, cabeçalho e rodapé legíveis a preto.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 16mm 12mm 20mm 12mm; }
  html, body { background: #fff; }
  .dossie-section { break-inside: auto; }
  .dossie-section + .dossie-section { break-before: page; }
  .dossie-day { break-inside: avoid; }
  .dossie-table { break-inside: auto; }
  .dossie-table tr { break-inside: avoid; }
  .dossie-footer {
    position: fixed; bottom: 6mm; left: 0; right: 0;
    font-size: 9px; color: #000; text-align: center;
  }
  .dossie-section-footer { display: none; }
}
@media screen {
  .dossie-footer { display: none; }
  .dossie-section-footer { margin-top: 12px; font-size: 11px; color: hsl(var(--muted-foreground)); }
}
.dossie-h2 { font-weight: 600; font-size: 1.05rem; margin-bottom: 8px; }
.dossie-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px; }
.dossie-table th { text-align: left; font-weight: 600; border-bottom: 1px solid #999; padding: 2px 6px 2px 0; }
.dossie-table td { padding: 3px 6px 3px 0; border-bottom: 1px solid #ddd; vertical-align: top; }
.dossie-missing td { background: #fdecec; }
.dossie-deviation td { background: #fff5f0; }
.dossie-card { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; break-inside: avoid; }
.dossie-rejection { border-color: #e07a5f; border-width: 2px; }
`;
