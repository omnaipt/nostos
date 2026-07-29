import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useIngredients } from "@/hooks/use-ingredients";
import {
  useCreatePurchaseEntry,
  useLastPurchaseCosts,
  useRecentPurchaseEntries,
  type PurchaseEntryLine,
} from "@/hooks/use-entries";
import { useShelfLifeDefaults } from "@/hooks/use-inventory";
import { formatCostCents } from "@/components/menu/PantryManager";
import { todayServiceDate } from "@/lib/service-date";
import { estimateExpiryDate, resolveShelfLifeDays } from "@/lib/expiry";
import { parsePriceToCents, type Ingredient } from "@/lib/types";

// Entradas de compra (Gap A): fornecedor + nº fatura + data + linhas
// (ingrediente do catálogo, qtd, custo unitário s/IVA) → stock_movements
// purchase por linha. O trigger 0011/0016 aplica saldo e custo MÉDIO; o rasto
// aparece na /despensa de borla (note "Fatura {fornecedor} {nº}").
// Leitura automática da fatura por foto fica no roadmap; o manual é o essencial.

interface LineDraft {
  ingredientId: string;
  qty: string;
  cost: string; // €/unidade s/IVA, texto livre ("9,80")
  expires: string; // validade estimada (YYYY-MM-DD), editável; "" = sem estimativa
}

const EMPTY_LINE: LineDraft = { ingredientId: "", qty: "", cost: "", expires: "" };

export default function Entradas() {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const ingredientsQuery = useIngredients(restaurantId);
  const lastCostsQuery = useLastPurchaseCosts(restaurantId);
  const entriesQuery = useRecentPurchaseEntries(restaurantId);
  const shelfDefaultsQuery = useShelfLifeDefaults();
  const create = useCreatePurchaseEntry(restaurantId);

  const [supplier, setSupplier] = React.useState("");
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(todayServiceDate());
  const [lines, setLines] = React.useState<LineDraft[]>([{ ...EMPTY_LINE }]);
  const [formError, setFormError] = React.useState<string>();

  const ingredients = (ingredientsQuery.data ?? []).filter((i) => i.active !== false);
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // Validade estimada (Gap G): data da fatura + shelf life resolvido (override
  // do ingrediente > categoria > fallback do storage_mode). Campos category/
  // storage_mode podem não existir em runtime antes da 0017 — defensivo.
  function estimateFor(ing: Ingredient): string {
    const days = resolveShelfLifeDays(
      {
        category: (ing as { category?: string | null }).category ?? null,
        storage_mode: (ing as { storage_mode?: string }).storage_mode ?? "ambiente",
        shelf_life_override_days:
          (ing as { shelf_life_override_days?: number | null }).shelf_life_override_days ?? null,
      },
      shelfDefaultsQuery.data ?? [],
    );
    return days != null ? estimateExpiryDate(invoiceDate, days) : "";
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (supplier.trim().length < 2) {
      setFormError("Indica o fornecedor.");
      return;
    }
    if (!invoiceNo.trim()) {
      setFormError("Indica o nº da fatura.");
      return;
    }
    const parsed: PurchaseEntryLine[] = [];
    for (const l of lines) {
      if (!l.ingredientId && !l.qty.trim() && !l.cost.trim()) continue; // linha vazia
      const ing = ingredientById.get(l.ingredientId);
      const qty = Number(l.qty.replace(",", "."));
      if (!ing || !Number.isFinite(qty) || qty <= 0) {
        setFormError("Cada linha precisa de ingrediente e quantidade > 0.");
        return;
      }
      parsed.push({
        ingredientId: ing.id,
        unit: ing.unit,
        qty,
        costPerUnitCents: parsePriceToCents(l.cost),
        expiresAt: l.expires.trim() || null,
      });
    }
    if (parsed.length === 0) {
      setFormError("A fatura precisa de pelo menos uma linha.");
      return;
    }
    create.mutate(
      { supplier: supplier.trim(), invoiceNo: invoiceNo.trim(), invoiceDate, lines: parsed },
      {
        onSuccess: (n) => {
          toast.success(`Entrada registada (${n} linha${n > 1 ? "s" : ""})`);
          setSupplier("");
          setInvoiceNo("");
          setInvoiceDate(todayServiceDate());
          setLines([{ ...EMPTY_LINE }]);
        },
        onError: (err) =>
          setFormError(err instanceof Error ? err.message : "Não foi possível registar."),
      },
    );
  }

  const loading = loadingRest || ingredientsQuery.isLoading;

  return (
    <div className="container max-w-3xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Entradas de compra</h1>
          <p className="text-sm text-muted-foreground">
            Regista as faturas de fornecedor; o saldo e o custo médio da despensa
            actualizam-se sozinhos.
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {!loading && ingredients.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            A despensa ainda não tem ingredientes. Cria o catálogo nas Definições
            antes de registares entradas.
          </CardContent>
        </Card>
      )}

      {!loading && ingredients.length > 0 && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Nova entrada</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field id="e-supplier" label="Fornecedor" required>
                    {(p) => (
                      <Input {...p} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
                    )}
                  </Field>
                  <Field id="e-invoice" label="Nº fatura" required>
                    {(p) => (
                      <Input {...p} value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
                    )}
                  </Field>
                  <Field id="e-date" label="Data da fatura" required>
                    {(p) => (
                      <Input
                        {...p}
                        type="date"
                        max={todayServiceDate()}
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                      />
                    )}
                  </Field>
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const ing = ingredientById.get(line.ingredientId);
                    const lastCost = ing ? lastCostsQuery.data?.get(ing.id) : undefined;
                    return (
                      <div key={idx} className="rounded-md border border-input p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_110px_150px_36px]">
                          <Select
                            aria-label="Ingrediente"
                            value={line.ingredientId}
                            onChange={(e) => {
                              const next = ingredientById.get(e.target.value);
                              setLine(idx, {
                                ingredientId: e.target.value,
                                expires: next ? estimateFor(next) : "",
                              });
                            }}
                          >
                            <option value="">Ingrediente...</option>
                            {ingredients.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.unit})
                              </option>
                            ))}
                          </Select>
                          <Input
                            aria-label="Quantidade"
                            inputMode="decimal"
                            placeholder={ing ? `Qtd (${ing.unit})` : "Qtd"}
                            value={line.qty}
                            onChange={(e) => setLine(idx, { qty: e.target.value })}
                          />
                          <Input
                            aria-label="Custo unitário sem IVA"
                            inputMode="decimal"
                            placeholder={ing ? `€/${ing.unit} s/IVA` : "€/un s/IVA"}
                            value={line.cost}
                            onChange={(e) => setLine(idx, { cost: e.target.value })}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label="Remover linha"
                            disabled={lines.length === 1}
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {ing && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="text-xs text-muted-foreground">
                              Custo médio actual: {formatCostCents(ing.cost_per_unit_cents)}/{ing.unit}
                              {lastCost != null && <> · última compra: {formatCostCents(lastCost)}/{ing.unit}</>}
                              {" "}· saldo: {ing.stock_qty} {ing.unit}
                            </p>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              Validade estimada:
                              <Input
                                aria-label="Validade estimada"
                                type="date"
                                className="h-7 w-36 text-xs"
                                value={line.expires}
                                onChange={(e) => setLine(idx, { expires: e.target.value })}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
                >
                  <Plus className="h-4 w-4" /> Linha
                </Button>

                {formError && (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive"
                  >
                    {formError}
                  </div>
                )}

                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {create.isPending ? "A registar..." : "Registar entrada"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Validade estimada por categoria — o rótulo prevalece. Ajusta a
                  data se o produto disser outra coisa.
                </p>
              </form>
            </CardContent>
          </Card>

          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Entradas recentes</h2>
          {entriesQuery.isLoading && <Skeleton className="h-16 w-full" />}
          {entriesQuery.data && entriesQuery.data.length === 0 && (
            <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              Ainda sem entradas registadas.
            </p>
          )}
          <div className="space-y-2">
            {(entriesQuery.data ?? []).map((g) => (
              <div key={g.key} className="rounded-md border border-input bg-card p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{g.note ?? "Entrada"}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {g.date} · {g.lines.length} linha{g.lines.length > 1 ? "s" : ""}
                    {g.totalCents > 0 && <> · {formatCostCents(g.totalCents)}</>}
                  </p>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {g.lines.map((m) => (
                    <li key={m.id} className="text-xs text-muted-foreground">
                      {ingredientById.get(m.ingredient_id)?.name ?? "—"} · {m.qty} {m.unit}
                      {m.cost_per_unit_cents != null && (
                        <> · {formatCostCents(m.cost_per_unit_cents)}/{m.unit}</>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
