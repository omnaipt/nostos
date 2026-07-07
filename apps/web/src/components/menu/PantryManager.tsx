import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateIngredient,
  useDeleteIngredient,
  useIngredients,
  useUpdateIngredient,
} from "@/hooks/use-ingredients";
import { UNIT_OPTIONS, type Ingredient } from "@/lib/types";

// Despensa — os ingredientes com custo por unidade que alimentam o food cost
// das fichas técnicas. v0: preço por unidade de compra (kg/L/un ou g/ml);
// a ficha converte g↔kg e ml↔l automaticamente.

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message.includes("ingredients_restaurant_name_key")) {
    return "Já existe um ingrediente com esse nome.";
  }
  return e instanceof Error ? e.message : "Não foi possível guardar. Tenta novamente.";
}

// "1,80" | "1.8" | "0,0055" -> cêntimos numéricos (float, o schema aceita 4 decimais)
export function parseCostToCents(input: string): number | null {
  const t = input.trim().replace(/[\s€]/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100 * 10000) / 10000;
}

export function formatCostCents(cents: number | null): string {
  if (cents == null) return "—";
  const euros = cents / 100;
  return euros.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: euros < 0.1 ? 4 : 2,
  }) + " €";
}

function IngredientRow({
  restaurantId,
  ingredient,
}: {
  restaurantId: string;
  ingredient: Ingredient;
}) {
  const update = useUpdateIngredient(restaurantId);
  const remove = useDeleteIngredient(restaurantId);
  const [cost, setCost] = React.useState(
    ingredient.cost_per_unit_cents != null
      ? (ingredient.cost_per_unit_cents / 100).toString().replace(".", ",")
      : "",
  );

  return (
    <div className="flex items-center gap-2 py-1.5">
      <p className={"flex-1 truncate text-sm " + (ingredient.active ? "" : "text-muted-foreground line-through")}>
        {ingredient.name}
      </p>
      <div className="flex w-40 items-center gap-1">
        <Input
          aria-label={`Custo de ${ingredient.name}`}
          inputMode="decimal"
          className="h-8 text-right text-sm"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onBlur={() => {
            const cents = parseCostToCents(cost);
            if (cents !== ingredient.cost_per_unit_cents) {
              update.mutate(
                { id: ingredient.id, patch: { cost_per_unit_cents: cents } },
                {
                  onSuccess: () => toast.success("Custo guardado"),
                  onError: (e) => toast.error(errMsg(e)),
                },
              );
            }
          }}
          placeholder="€"
        />
        <span className="w-12 shrink-0 text-xs text-muted-foreground">/ {ingredient.unit}</span>
      </div>
      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={ingredient.active}
          onChange={(e) =>
            update.mutate(
              { id: ingredient.id, patch: { active: e.target.checked } },
              { onError: (err) => toast.error(errMsg(err)) },
            )
          }
        />
        Activo
      </label>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Remover ${ingredient.name}`}
        onClick={() => {
          if (!window.confirm(`Remover "${ingredient.name}" da despensa? As linhas de ficha ligadas ficam sem custo.`)) return;
          remove.mutate(ingredient.id, {
            onSuccess: () => toast.success("Ingrediente removido"),
            onError: (e) => toast.error(errMsg(e)),
          });
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function PantryManager({ restaurantId }: { restaurantId: string }) {
  const query = useIngredients(restaurantId);
  const create = useCreateIngredient(restaurantId);
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("kg");
  const [cost, setCost] = React.useState("");

  function add() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    create.mutate(
      { name: trimmed, unit, costPerUnitCents: parseCostToCents(cost) },
      {
        onSuccess: () => {
          toast.success("Ingrediente adicionado");
          setName("");
          setCost("");
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar a despensa.</p>
        <Button size="sm" variant="outline" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const ingredients = query.data ?? [];

  return (
    <div className="space-y-3">
      {ingredients.length === 0 && (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          A despensa está vazia. Adiciona ingredientes com o preço de compra (ex.: Bacalhau, 12,50 € por kg)
          para as fichas técnicas calcularem o custo e a margem de cada prato.
        </p>
      )}

      <div className="divide-y divide-border">
        {ingredients.map((ing) => (
          <IngredientRow key={ing.id} restaurantId={restaurantId} ingredient={ing} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Novo ingrediente"
          placeholder="Ingrediente (ex.: Bacalhau demolhado)"
          className="min-w-40 flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Input
          aria-label="Custo por unidade"
          inputMode="decimal"
          placeholder="Custo €"
          className="w-24 text-right"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
        <Select
          aria-label="Unidade"
          className="w-20"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u.code} value={u.code}>
              / {u.label}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={create.isPending || name.trim().length < 2} onClick={add}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>
    </div>
  );
}
