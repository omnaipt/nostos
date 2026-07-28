import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useIngredients } from "@/hooks/use-ingredients";
import { useMenuItems } from "@/hooks/use-menu";
import {
  useApplySaft,
  useConcileCode,
  useIngestSaft,
  useSaftImports,
  useUnmatchedLines,
  type SaftEdgeResponse,
} from "@/hooks/use-saft";
import { computePantrySummary, formatQty, groupUnmatched, type UnmatchedGroup } from "@/lib/stock";
import { formatPriceCents, type SaftImport } from "@/lib/types";

// Fecho do dia (0012 + edge import-saft): o XML do software de facturação
// entra, as linhas casam com pratos via mapa POS, e as fichas técnicas abatem
// a despensa. A UI só orquestra — parse, match e abates são todos da edge,
// que é idempotente (re-submeter o mesmo ficheiro não duplica movimentos).

const MAX_XML_BYTES = 4 * 1024 * 1024; // espelho do limite da edge

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  parsing: "a processar",
  review: "por conciliar",
  applied: "aplicado",
  failed: "falhou",
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "applied"
      ? "bg-[hsl(var(--status-confirmed-bg))] text-[hsl(var(--status-confirmed-fg))]"
      : status === "review"
        ? "bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-fg))]"
        : status === "failed"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function SaftClose() {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const importsQuery = useSaftImports(restaurantId);
  const ingest = useIngestSaft(restaurantId);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // Relatório vivo do apply (movimentos, ingredientes, alertas) por lote — a
  // edge devolve-o na resposta mas não persiste os detalhes.
  const [reports, setReports] = React.useState<Record<string, SaftEdgeResponse>>({});
  const fileRef = React.useRef<HTMLInputElement>(null);

  const imports = importsQuery.data ?? [];
  const selected =
    imports.find((i) => i.id === selectedId) ?? (imports.length > 0 ? imports[0] : null);

  async function onPickFile(file: File) {
    if (file.size > MAX_XML_BYTES) {
      toast.error("Ficheiro demasiado grande (limite 4 MB).");
      return;
    }
    const xml = await file.text();
    ingest.mutate(
      { filename: file.name, xml },
      {
        onSuccess: (res) => {
          if (res.importId) {
            setReports((r) => ({ ...r, [res.importId as string]: res }));
            setSelectedId(res.importId);
          }
          if (res.status === "applied") {
            toast.success(`Fecho aplicado: ${res.invoices} faturas, ${res.movements ?? 0} movimentos.`);
          } else {
            toast.info(`${res.unmatched} linhas por conciliar (${res.unmatchedCodes?.length ?? 0} códigos).`);
          }
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível importar."),
      },
    );
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="container max-w-5xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fecho do dia (SAF-T)</h1>
          <p className="text-sm text-muted-foreground">
            Importa o ficheiro do software de facturação; as vendas abatem a despensa pelas fichas
            técnicas
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      {/* Upload */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={ingest.isPending || loadingRest}>
            <Upload className="mr-2 h-4 w-4" />
            {ingest.isPending ? "A processar o ficheiro…" : "Importar SAF-T (.xml)"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Só documentos de venda (FT/FS/FR). Re-submeter o mesmo ficheiro não duplica abates.
          </p>
        </CardContent>
      </Card>

      {importsQuery.isError && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Não foi possível carregar os fechos.
          </CardContent>
        </Card>
      )}

      {importsQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!importsQuery.isLoading && !importsQuery.isError && imports.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Ainda sem fechos importados. O primeiro SAF-T que importares aparece aqui.
          </CardContent>
        </Card>
      )}

      {imports.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Lista de lotes */}
          <ul className="space-y-2 self-start">
            {imports.map((imp) => (
              <li key={imp.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(imp.id)}
                  className={
                    "w-full rounded-md border p-3 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (selected?.id === imp.id ? "border-ring bg-muted/40" : "border-input bg-card")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{imp.filename ?? "sem nome"}</span>
                    <StatusBadge status={imp.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(imp.created_at)} · {imp.invoices_count} faturas ·{" "}
                    {formatPriceCents(imp.gross_total_cents)}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          {/* Detalhe do lote seleccionado */}
          {selected && restaurantId && (
            <ImportDetail
              key={selected.id}
              restaurantId={restaurantId}
              imp={selected}
              liveReport={reports[selected.id]}
              onReport={(res) => setReports((r) => ({ ...r, [selected.id]: res }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ImportDetail({
  restaurantId,
  imp,
  liveReport,
  onReport,
}: {
  restaurantId: string;
  imp: SaftImport;
  liveReport: SaftEdgeResponse | undefined;
  onReport: (res: SaftEdgeResponse) => void;
}) {
  const unmatchedQuery = useUnmatchedLines(imp.status === "review" ? imp.id : undefined);
  const apply = useApplySaft(restaurantId);

  const groups = React.useMemo(
    () => (unmatchedQuery.data ? groupUnmatched(unmatchedQuery.data) : []),
    [unmatchedQuery.data],
  );
  const unmatchedLeft = unmatchedQuery.data?.length ?? imp.unmatched_count;

  function onApply() {
    apply.mutate(imp.id, {
      onSuccess: (res) => {
        onReport(res);
        toast.success(`Fecho aplicado: ${res.movements ?? 0} movimentos de stock.`);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Não foi possível aplicar."),
    });
  }

  return (
    <div className="space-y-4">
      {/* Números do lote */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Faturas" value={String(imp.invoices_count)} />
        <MiniStat label="Linhas" value={String(imp.lines_count)} />
        <MiniStat
          label="Casadas"
          value={String(imp.status === "review" ? imp.lines_count - unmatchedLeft : imp.matched_count)}
        />
        <MiniStat
          label="Por casar"
          value={String(imp.status === "review" ? unmatchedLeft : imp.unmatched_count)}
          bad={imp.status === "review" && unmatchedLeft > 0}
        />
      </div>

      {imp.status === "failed" && (
        <Card className="border-destructive/50">
          <CardContent className="py-5 text-sm">
            <p className="font-semibold text-destructive">O import falhou.</p>
            <p className="mt-1 text-muted-foreground">{imp.error ?? "Sem detalhe do erro."}</p>
          </CardContent>
        </Card>
      )}

      {imp.status === "review" && (
        <ReviewQueue
          restaurantId={restaurantId}
          importId={imp.id}
          groups={groups}
          loading={unmatchedQuery.isLoading}
          error={unmatchedQuery.isError}
          unmatchedLeft={unmatchedLeft}
          applying={apply.isPending}
          onApply={onApply}
        />
      )}

      {imp.status === "applied" && (
        <AppliedSummary imp={imp} report={liveReport} restaurantId={restaurantId} />
      )}
    </div>
  );
}

function MiniStat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (bad ? "border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))]" : "border-input bg-card")
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ── Fila de conciliação: um código POS de cada vez, um clique de cada vez ────

function ReviewQueue({
  restaurantId,
  importId,
  groups,
  loading,
  error,
  unmatchedLeft,
  applying,
  onApply,
}: {
  restaurantId: string;
  importId: string;
  groups: UnmatchedGroup[];
  loading: boolean;
  error: boolean;
  unmatchedLeft: number;
  applying: boolean;
  onApply: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <h2 className="text-sm font-semibold">Conciliação</h2>
          <p className="text-xs text-muted-foreground">
            Estes códigos do POS ainda não têm prato associado. Concilia uma vez; os próximos
            fechos casam sozinhos.
          </p>
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {error && (
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar as linhas por conciliar.
          </p>
        )}

        {!loading && !error && groups.length === 0 && (
          <p className="rounded-md bg-[hsl(var(--status-confirmed-bg))] p-3 text-sm text-[hsl(var(--status-confirmed-fg))]">
            Tudo conciliado. Podes aplicar o fecho.
          </p>
        )}

        {groups.map((g) => (
          <ConcileRow key={g.posCode} restaurantId={restaurantId} importId={importId} group={g} />
        ))}

        <div className="flex items-center gap-3 border-t border-input pt-4">
          <Button onClick={onApply} disabled={applying}>
            {applying ? "A aplicar…" : "Aplicar fecho"}
          </Button>
          {unmatchedLeft > 0 && (
            <p className="text-xs text-muted-foreground">
              {unmatchedLeft} linha{unmatchedLeft === 1 ? "" : "s"} por casar não ser
              {unmatchedLeft === 1 ? "á" : "ão"} abatida{unmatchedLeft === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConcileRow({
  restaurantId,
  importId,
  group,
}: {
  restaurantId: string;
  importId: string;
  group: UnmatchedGroup;
}) {
  const itemsQuery = useMenuItems(restaurantId);
  const concile = useConcileCode(restaurantId);
  const [itemId, setItemId] = React.useState("");

  const items = React.useMemo(
    () =>
      (itemsQuery.data ?? [])
        .filter((i) => i.active)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    [itemsQuery.data],
  );

  function confirm() {
    if (!itemId) {
      toast.error("Escolhe o prato correspondente.");
      return;
    }
    concile.mutate(
      {
        importId,
        posCode: group.posCode,
        posDescription: group.posDescription,
        menuItemId: itemId,
      },
      {
        onSuccess: () => toast.success(`«${group.posDescription ?? group.posCode}» conciliado.`),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível conciliar."),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-input p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {group.posDescription ?? "(sem descrição)"}{" "}
          <span className="font-normal text-muted-foreground">· código {group.posCode}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {group.lineCount} linha{group.lineCount === 1 ? "" : "s"} · {formatQty(group.totalQty)} un
          vendidas
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:w-[340px]">
        <Select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          aria-label={`Prato para o código ${group.posCode}`}
          disabled={itemsQuery.isLoading || concile.isPending}
        >
          <option value="">Escolher prato…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={confirm} disabled={concile.isPending || !itemId}>
          {concile.isPending ? "…" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

// ── Resumo do fecho aplicado ─────────────────────────────────────────────────

function AppliedSummary({
  imp,
  report,
  restaurantId,
}: {
  imp: SaftImport;
  report: SaftEdgeResponse | undefined;
  restaurantId: string;
}) {
  // Alertas de stock pós-abate: ingredientes abaixo do mínimo AGORA.
  const ingredientsQuery = useIngredients(restaurantId);
  const belowMin = React.useMemo(
    () => (ingredientsQuery.data ? computePantrySummary(ingredientsQuery.data).belowMinCount : null),
    [ingredientsQuery.data],
  );

  return (
    <div className="space-y-3">
      <Card className="border-[hsl(var(--status-confirmed-fg))]/30 bg-[hsl(var(--status-confirmed-bg))]/40">
        <CardContent className="py-5 text-sm">
          <p className="font-semibold text-[hsl(var(--status-confirmed-fg))]">Fecho aplicado.</p>
          <p className="mt-1">
            {imp.invoices_count} faturas · {imp.matched_count} linhas abatidas
            {report?.movements != null && <> · {report.movements} movimentos de stock</>}
            {report?.ingredientsTouched != null && (
              <> · {report.ingredientsTouched} ingredientes abatidos</>
            )}
            {belowMin != null && (
              <>
                {" "}
                ·{" "}
                <Link to="/despensa" className={belowMin > 0 ? "font-semibold text-destructive underline" : "underline"}>
                  {belowMin} alerta{belowMin === 1 ? "" : "s"} de stock
                </Link>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {imp.applied_at ? `Aplicado a ${formatDateTime(imp.applied_at)}` : ""}
            {imp.unmatched_count > 0 && <> · {imp.unmatched_count} linhas ficaram por casar</>}
          </p>
        </CardContent>
      </Card>

      {report?.dishesWithoutSheet && report.dishesWithoutSheet.length > 0 && (
        <Card className="border-[hsl(var(--status-pending-fg))]/40">
          <CardContent className="py-4 text-sm">
            <p className="font-medium text-[hsl(var(--status-pending-fg))]">
              Vendidos sem ficha técnica — não abatidos:
            </p>
            <p className="mt-1 text-muted-foreground">{report.dishesWithoutSheet.join(", ")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cria a ficha técnica destes pratos para o próximo fecho os abater.
            </p>
          </CardContent>
        </Card>
      )}

      {report?.unitMismatch && report.unitMismatch.length > 0 && (
        <Card className="border-[hsl(var(--status-pending-fg))]/40">
          <CardContent className="py-4 text-sm">
            <p className="font-medium text-[hsl(var(--status-pending-fg))]">
              Unidades incompatíveis — não abatidos:
            </p>
            <p className="mt-1 text-muted-foreground">{report.unitMismatch.join(", ")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
