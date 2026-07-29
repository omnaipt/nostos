import * as React from "react";
import { Link } from "react-router-dom";
import { Loader2, ClipboardCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useIngredients } from "@/hooks/use-ingredients";
import {
  useApplyInventoryCount,
  type InventoryCount,
  type InventoryResult,
} from "@/hooks/use-inventory";
import { formatCostCents } from "@/components/menu/PantryManager";

// Inventário físico (Gap F): contagem mensal/trimestral. Lista o saldo teórico
// e uma coluna "contado" (vazia por defeito — só as preenchidas contam); ao
// submeter, a RPC apply_inventory_count gera adjustments em bulk com a note
// "Inventário YYYY-MM" e devolve o desvio valorizado ao custo médio. O
// histórico são os movimentos agrupados pela note (rasto na /despensa).

export default function Inventario() {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const ingredientsQuery = useIngredients(restaurantId);
  const apply = useApplyInventoryCount(restaurantId);

  const [counts, setCounts] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<InventoryResult | null>(null);
  const [formError, setFormError] = React.useState<string>();

  const ingredients = (ingredientsQuery.data ?? []).filter((i) => i.active !== false);
  const filled = Object.entries(counts).filter(([, v]) => v.trim() !== "");

  const defaultNote = `Inventário ${new Date().getFullYear()}-${String(
    new Date().getMonth() + 1,
  ).padStart(2, "0")}`;

  function onSubmit() {
    setFormError(undefined);
    const parsed: InventoryCount[] = [];
    for (const [id, raw] of filled) {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        const name = ingredients.find((i) => i.id === id)?.name ?? "?";
        setFormError(`Contagem inválida em "${name}" (número ≥ 0).`);
        return;
      }
      parsed.push({ ingredientId: id, counted: n });
    }
    if (parsed.length === 0) {
      setFormError("Preenche pelo menos uma contagem.");
      return;
    }
    apply.mutate(
      { counts: parsed, note: defaultNote },
      {
        onSuccess: (r) => {
          setResult(r);
          setCounts({});
        },
        onError: (err) =>
          setFormError(err instanceof Error ? err.message : "Não foi possível aplicar."),
      },
    );
  }

  const loading = loadingRest || ingredientsQuery.isLoading;

  // ── Ecrã de resumo pós-submissão (o argumento comercial) ──────────────────
  if (result) {
    const top = [...result.items]
      .sort((a, b) => Math.abs(b.deviation_cents) - Math.abs(a.deviation_cents))
      .slice(0, 5);
    return (
      <div className="container max-w-3xl py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">Inventário aplicado</h1>
          <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voltar
          </Link>
        </header>
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" aria-hidden />
              <p className="text-sm">
                <strong>{result.applied}</strong> acerto{result.applied === 1 ? "" : "s"} aplicado
                {result.applied === 1 ? "" : "s"} · {result.skipped} já certo
                {result.skipped === 1 ? "" : "s"} · note "{defaultNote}"
              </p>
            </div>
            <p className="text-sm">
              Desvio total valorizado ao custo médio:{" "}
              <strong className={result.total_deviation_cents > 0 ? "text-destructive" : ""}>
                {formatCostCents(result.total_deviation_cents)}
              </strong>
            </p>
            {top.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Maiores desvios</p>
                <ul className="space-y-1">
                  {top.map((d) => (
                    <li key={d.ingredient_id} className="text-sm text-muted-foreground">
                      {d.name}: {d.diff > 0 ? "+" : ""}
                      {d.diff} {d.unit} ·{" "}
                      <span className={d.deviation_cents < 0 ? "text-destructive" : ""}>
                        {formatCostCents(Math.abs(d.deviation_cents))}
                      </span>{" "}
                      {d.diff < 0 ? "a menos que o teórico" : "a mais que o teórico"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              O rasto completo fica na despensa, agrupado pela note do inventário.
            </p>
            <Button size="sm" variant="outline" onClick={() => setResult(null)}>
              Nova contagem
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">Inventário</h1>
          <p className="text-sm text-muted-foreground">
            Conta o que está fisicamente em casa; só as linhas preenchidas geram acerto.
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {!loading && ingredients.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            A despensa ainda não tem ingredientes.
          </CardContent>
        </Card>
      )}

      {!loading && ingredients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {defaultNote} · {filled.length} contagem{filled.length === 1 ? "" : "s"} preenchida
              {filled.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border">
              {ingredients.map((ing) => (
                <div key={ing.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ing.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Teórico: {ing.stock_qty} {ing.unit}
                    </p>
                  </div>
                  <Input
                    aria-label={`Contado ${ing.name}`}
                    inputMode="decimal"
                    placeholder={`Contado (${ing.unit})`}
                    className="w-40"
                    value={counts[ing.id] ?? ""}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [ing.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
            )}

            <Button onClick={onSubmit} disabled={apply.isPending || filled.length === 0}>
              {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {apply.isPending ? "A aplicar..." : "Aplicar inventário"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
