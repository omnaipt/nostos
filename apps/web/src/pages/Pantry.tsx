import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useIngredients } from "@/hooks/use-ingredients";
import {
  useCreateManualMovement,
  useLastPurchases,
  useStockMovements,
} from "@/hooks/use-stock";
import { useLastAppliedImport } from "@/hooks/use-saft";
import { formatCostCents } from "@/components/menu/PantryManager";
import {
  computePantrySummary,
  formatQty,
  formatSignedQty,
  isBelowMin,
  isInternalNote,
  MOVEMENT_KIND_LABEL,
  sortPantry,
} from "@/lib/stock";
import type { Ingredient } from "@/lib/types";

// Despensa com saldos (0011): o que há, o que falta repor, e o rasto de cada
// ingrediente (entradas de faturas, abates do SAF-T, quebras). O saldo nunca
// se edita à mão — regista-se um movimento e o trigger aplica.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Pantry() {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const ingredientsQuery = useIngredients(restaurantId);
  const lastPurchasesQuery = useLastPurchases(restaurantId);
  const lastAppliedQuery = useLastAppliedImport(restaurantId);

  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Ingredient | null>(null);

  const loading = loadingRest || ingredientsQuery.isLoading;
  const summary = React.useMemo(
    () => (ingredientsQuery.data ? computePantrySummary(ingredientsQuery.data) : null),
    [ingredientsQuery.data],
  );
  const rows = React.useMemo(() => {
    if (!ingredientsQuery.data) return [];
    const term = search.trim().toLocaleLowerCase("pt");
    const filtered = term
      ? ingredientsQuery.data.filter((i) => i.name.toLocaleLowerCase("pt").includes(term))
      : ingredientsQuery.data;
    return sortPantry(filtered);
  }, [ingredientsQuery.data, search]);

  // Mantém o dialog em sincronia com o saldo refrescado após um movimento.
  const selectedLive =
    (selected && ingredientsQuery.data?.find((i) => i.id === selected.id)) ?? selected;

  return (
    <div className="container max-w-5xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Despensa</h1>
          <p className="text-sm text-muted-foreground">
            Saldos, alertas de reposição e rasto de movimentos por ingrediente
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      {ingredientsQuery.isError && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Não foi possível carregar a despensa.
          </CardContent>
        </Card>
      )}

      {!ingredientsQuery.isError && loading && (
        <div className="space-y-2">
          <div className="mb-6 grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!ingredientsQuery.isError && !loading && summary && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatBox
              label="Abaixo do mínimo"
              value={String(summary.belowMinCount)}
              bad={summary.belowMinCount > 0}
            />
            <StatBox label="Valor em stock" value={formatCostCents(summary.stockValueCents)} />
            <div className="rounded-lg border border-input bg-card p-3">
              <p className="text-xs text-muted-foreground">Último fecho aplicado</p>
              {lastAppliedQuery.data ? (
                <>
                  <p className="mt-1 text-2xl font-semibold">
                    {formatDate(lastAppliedQuery.data.applied_at ?? lastAppliedQuery.data.created_at)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lastAppliedQuery.data.filename ?? "sem nome"} ·{" "}
                    {lastAppliedQuery.data.invoices_count} faturas
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Nenhum ainda —{" "}
                  <Link to="/fecho-dia" className="underline">
                    importar SAF-T
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar ingrediente…"
              aria-label="Procurar ingrediente"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              {rows.length} de {ingredientsQuery.data?.length ?? 0} ingredientes
            </p>
          </div>

          {rows.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {search ? "Nenhum ingrediente corresponde à pesquisa." : "A despensa está vazia."}
              </CardContent>
            </Card>
          )}

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-md border border-input">
              <div className="hidden grid-cols-[1fr_110px_110px_110px_110px_90px] gap-2 border-b border-input bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Ingrediente</span>
                <span className="text-right">Saldo</span>
                <span className="text-right">Mínimo</span>
                <span className="text-right">Custo/un</span>
                <span className="text-right">Última entrada</span>
                <span className="text-right">Estado</span>
              </div>
              <ul>
                {rows.map((i) => (
                  <PantryRow
                    key={i.id}
                    ingredient={i}
                    lastPurchase={lastPurchasesQuery.data?.get(i.id) ?? null}
                    onOpen={() => setSelected(i)}
                  />
                ))}
              </ul>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            O saldo é aplicado pelos movimentos (entradas, abates do fecho SAF-T, quebras e
            ajustes). Para corrigir um saldo, regista um ajuste — os movimentos não se editam.
          </p>
        </>
      )}

      {selectedLive && restaurantId && (
        <MovementsDialog
          restaurantId={restaurantId}
          ingredient={selectedLive}
          onClose={() => setSelected(null)}
        />
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

function PantryRow({
  ingredient,
  lastPurchase,
  onOpen,
}: {
  ingredient: Ingredient;
  lastPurchase: string | null;
  onOpen: () => void;
}) {
  const below = isBelowMin(ingredient);
  return (
    <li className="border-b border-input last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className={
          "grid w-full grid-cols-2 items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_110px_110px_110px_110px_90px] " +
          (below ? "bg-destructive/5" : "")
        }
        aria-label={`Ver movimentos de ${ingredient.name}`}
      >
        <span className="truncate font-medium">{ingredient.name}</span>
        <span className={"text-right tabular-nums " + (below ? "font-semibold text-destructive" : "")}>
          {formatQty(ingredient.stock_qty)} {ingredient.unit}
        </span>
        <span className="hidden text-right tabular-nums text-muted-foreground sm:block">
          {ingredient.low_stock_threshold != null
            ? `${formatQty(ingredient.low_stock_threshold)} ${ingredient.unit}`
            : "—"}
        </span>
        <span className="hidden text-right tabular-nums text-muted-foreground sm:block">
          {formatCostCents(ingredient.cost_per_unit_cents)}
        </span>
        <span className="hidden text-right text-xs text-muted-foreground sm:block">
          {lastPurchase ? formatDate(lastPurchase) : "—"}
        </span>
        <span className="text-right">
          {below ? (
            <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              repor
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-[hsl(var(--status-seated-bg))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--status-seated-fg))]">
              ok
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

// ── Dialog de movimentos + registo manual de quebra/ajuste ───────────────────

function MovementsDialog({
  restaurantId,
  ingredient,
  onClose,
}: {
  restaurantId: string;
  ingredient: Ingredient;
  onClose: () => void;
}) {
  const movementsQuery = useStockMovements(restaurantId, ingredient.id);
  const [showForm, setShowForm] = React.useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={ingredient.name}
      description={`Saldo actual: ${formatQty(ingredient.stock_qty)} ${ingredient.unit}${
        isBelowMin(ingredient) ? " · abaixo do mínimo" : ""
      }`}
      className="sm:max-w-xl"
    >
      <div className="mb-4">
        {showForm ? (
          <ManualMovementForm
            restaurantId={restaurantId}
            ingredient={ingredient}
            onDone={() => setShowForm(false)}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            Registar quebra/ajuste
          </Button>
        )}
      </div>

      {movementsQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}
      {movementsQuery.isError && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar os movimentos.
        </p>
      )}
      {movementsQuery.data && movementsQuery.data.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Ainda sem movimentos. As entradas de faturas e os abates do fecho SAF-T aparecem aqui.
        </p>
      )}
      {movementsQuery.data && movementsQuery.data.length > 0 && (
        <ul className="divide-y divide-input rounded-md border border-input">
          {movementsQuery.data.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}
                  {m.source_ref && (
                    <span className="ml-2 font-normal text-muted-foreground">{m.source_ref}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(m.created_at)}
                  {m.note && !isInternalNote(m.note) && <> · {m.note}</>}
                </p>
              </div>
              <span
                className={
                  "shrink-0 tabular-nums font-semibold " +
                  (m.qty >= 0 ? "text-[hsl(var(--status-seated-fg))]" : "text-destructive")
                }
              >
                {formatSignedQty(m.qty)} {m.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function ManualMovementForm({
  restaurantId,
  ingredient,
  onDone,
}: {
  restaurantId: string;
  ingredient: Ingredient;
  onDone: () => void;
}) {
  const create = useCreateManualMovement(restaurantId);
  const [kind, setKind] = React.useState<"waste" | "adjustment">("waste");
  const [direction, setDirection] = React.useState<"out" | "in">("out");
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Indica uma quantidade maior que zero.");
      return;
    }
    // Quebra é sempre saída; ajuste segue a direcção escolhida. O sinal é
    // validado também pelo constraint stock_movements_sign_coherent.
    const signed = kind === "waste" || direction === "out" ? -n : n;
    create.mutate(
      {
        ingredientId: ingredient.id,
        unit: ingredient.unit,
        kind,
        qty: signed,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Movimento registado.");
          onDone();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível registar."),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-input bg-muted/30 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="mov-kind">Tipo</Label>
          <Select
            id="mov-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "waste" | "adjustment")}
          >
            <option value="waste">Quebra (saída)</option>
            <option value="adjustment">Ajuste</option>
          </Select>
        </div>
        {kind === "adjustment" ? (
          <div className="space-y-1">
            <Label htmlFor="mov-dir">Sentido</Label>
            <Select
              id="mov-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "out" | "in")}
            >
              <option value="out">Saída (−)</option>
              <option value="in">Entrada (+)</option>
            </Select>
          </div>
        ) : (
          <div />
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="mov-qty">Quantidade ({ingredient.unit})</Label>
          <Input
            id="mov-qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder={`ex.: 1,5`}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mov-note">Nota (opcional)</Label>
          <Input
            id="mov-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ex.: caiu ao chão"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending}>
          {create.isPending ? "A registar…" : "Registar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
