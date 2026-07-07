import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCategory,
  useCreateItem,
  useDeleteCategory,
  useDeleteItem,
  useMenuCategories,
  useMenuItems,
  useUpdateCategory,
  useUpdateItem,
} from "@/hooks/use-menu";
import { useIngredients } from "@/hooks/use-ingredients";
import { useTechSheetLines, useTechSheets } from "@/hooks/use-tech-sheets";
import { TechSheetDialog } from "@/components/menu/TechSheetDialog";
import { formatCostCents } from "@/components/menu/PantryManager";
import {
  ALLERGENS,
  computeFoodCost,
  computeMarginPct,
  formatPriceCents,
  parsePriceToCents,
  type MenuItem,
} from "@/lib/types";

// Resumo da ficha técnica de um prato para a lista do menu.
export interface SheetSummary {
  costCents: number;
  marginPct: number | null;
  complete: boolean;
}

// Gestão de menu (self-contained): categorias e pratos, tenant-scoped via RLS.
// Cada mutação invalida a cache do menu. v0 sem reordenação drag (sort_order
// segue a ordem de criação); multilingue/foto/IA são iteração futura.

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Não foi possível guardar. Tenta novamente.";
}

interface ItemDraft {
  name: string;
  price: string;
  description: string;
  allergens: string[];
}

const EMPTY_DRAFT: ItemDraft = { name: "", price: "", description: "", allergens: [] };

function ItemForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: ItemDraft;
  submitting: boolean;
  onSubmit: (draft: ItemDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState<ItemDraft>(initial);

  function toggleAllergen(code: string) {
    setDraft((d) => ({
      ...d,
      allergens: d.allergens.includes(code)
        ? d.allergens.filter((a) => a !== code)
        : [...d.allergens, code],
    }));
  }

  return (
    <div className="space-y-3 rounded-md border border-input bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <Input
          aria-label="Nome do prato"
          placeholder="Nome do prato"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Input
          aria-label="Preço"
          inputMode="decimal"
          placeholder="Preço (12,50)"
          value={draft.price}
          onChange={(e) => setDraft({ ...draft, price: e.target.value })}
        />
      </div>
      <Textarea
        aria-label="Descrição"
        placeholder="Descrição (opcional)"
        maxLength={280}
        value={draft.description}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
      />
      <div className="flex flex-wrap gap-1.5">
        {ALLERGENS.map((a) => {
          const on = draft.allergens.includes(a.code);
          return (
            <button
              key={a.code}
              type="button"
              onClick={() => toggleAllergen(a.code)}
              className={
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                (on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:bg-muted")
              }
              aria-pressed={on}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={submitting || draft.name.trim().length < 2}
          onClick={() => onSubmit(draft)}
        >
          Guardar prato
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function draftFromItem(item: MenuItem): ItemDraft {
  return {
    name: item.name,
    price:
      item.price_cents != null ? (item.price_cents / 100).toString().replace(".", ",") : "",
    description: item.description ?? "",
    allergens: item.allergens ?? [],
  };
}

function ItemRow({
  restaurantId,
  item,
  sheetSummary,
  onOpenSheet,
}: {
  restaurantId: string;
  item: MenuItem;
  sheetSummary: SheetSummary | null;
  onOpenSheet: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const update = useUpdateItem(restaurantId);
  const remove = useDeleteItem(restaurantId);

  if (editing) {
    return (
      <ItemForm
        initial={draftFromItem(item)}
        submitting={update.isPending}
        onCancel={() => setEditing(false)}
        onSubmit={(d) =>
          update.mutate(
            {
              id: item.id,
              patch: {
                name: d.name.trim(),
                description: d.description.trim() || null,
                price_cents: parsePriceToCents(d.price),
                allergens: d.allergens,
              },
            },
            {
              onSuccess: () => {
                toast.success("Prato guardado");
                setEditing(false);
              },
              onError: (e) => toast.error(errMsg(e)),
            },
          )
        }
      />
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className={item.available ? "" : "opacity-60"}>
        <p className="text-sm font-medium">
          {item.name}
          {!item.available && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(esgotado)</span>
          )}
        </p>
        {item.description && (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        )}
        {item.allergens.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {item.allergens
              .map((a) => ALLERGENS.find((x) => x.code === a)?.label ?? a)
              .join(", ")}
          </p>
        )}
        {sheetSummary && (
          <p className="text-[11px] text-muted-foreground">
            Food cost {formatCostCents(sheetSummary.costCents)}
            {sheetSummary.marginPct != null && <> · margem {sheetSummary.marginPct.toFixed(0)}%</>}
            {!sheetSummary.complete && " (parcial)"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="mr-1 tabular-nums text-sm text-muted-foreground">
          {formatPriceCents(item.price_cents)}
        </span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={item.available}
            onChange={(e) =>
              update.mutate(
                { id: item.id, patch: { available: e.target.checked } },
                { onError: (err) => toast.error(errMsg(err)) },
              )
            }
          />
          Disponível
        </label>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Ficha técnica"
          title={sheetSummary ? "Ficha técnica (existe)" : "Criar ficha técnica"}
          onClick={onOpenSheet}
        >
          <NotebookPen className={sheetSummary ? "h-4 w-4 text-primary" : "h-4 w-4"} />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Editar prato" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Remover prato"
          onClick={() =>
            remove.mutate(item.id, {
              onSuccess: () => toast.success("Prato removido"),
              onError: (e) => toast.error(errMsg(e)),
            })
          }
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CategoryBlock({
  restaurantId,
  category,
  items,
  nextItemSort,
  sheetInfoByItem,
  onOpenSheet,
}: {
  restaurantId: string;
  category: { id: string; label: string; active: boolean };
  items: MenuItem[];
  nextItemSort: number;
  sheetInfoByItem: Map<string, SheetSummary>;
  onOpenSheet: (item: MenuItem) => void;
}) {
  const [label, setLabel] = React.useState(category.label);
  const [adding, setAdding] = React.useState(false);
  const update = useUpdateCategory(restaurantId);
  const remove = useDeleteCategory(restaurantId);
  const createItem = useCreateItem(restaurantId);

  React.useEffect(() => setLabel(category.label), [category.label]);

  return (
    <div className="space-y-2 rounded-md border border-input p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Nome da categoria"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const trimmed = label.trim();
            if (trimmed && trimmed !== category.label) {
              update.mutate(
                { id: category.id, patch: { label: trimmed } },
                {
                  onSuccess: () => toast.success("Categoria guardada"),
                  onError: (e) => toast.error(errMsg(e)),
                },
              );
            }
          }}
          className="font-semibold"
        />
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={category.active}
            onChange={(e) =>
              update.mutate(
                { id: category.id, patch: { active: e.target.checked } },
                { onError: (err) => toast.error(errMsg(err)) },
              )
            }
          />
          Visível
        </label>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Remover categoria"
          onClick={() => {
            if (!window.confirm(`Remover a categoria "${category.label}" e os seus pratos?`)) return;
            remove.mutate(category.id, {
              onSuccess: () => toast.success("Categoria removida"),
              onError: (e) => toast.error(errMsg(e)),
            });
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="divide-y divide-border">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            restaurantId={restaurantId}
            item={item}
            sheetSummary={sheetInfoByItem.get(item.id) ?? null}
            onOpenSheet={() => onOpenSheet(item)}
          />
        ))}
      </div>

      {adding ? (
        <ItemForm
          initial={EMPTY_DRAFT}
          submitting={createItem.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(d) =>
            createItem.mutate(
              {
                categoryId: category.id,
                name: d.name.trim(),
                description: d.description.trim() || null,
                priceCents: parsePriceToCents(d.price),
                allergens: d.allergens,
                sortOrder: nextItemSort,
              },
              {
                onSuccess: () => {
                  toast.success("Prato adicionado");
                  setAdding(false);
                },
                onError: (e) => toast.error(errMsg(e)),
              },
            )
          }
        />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Adicionar prato
        </Button>
      )}
    </div>
  );
}

export function MenuManager({ restaurantId }: { restaurantId: string }) {
  const categoriesQuery = useMenuCategories(restaurantId);
  const itemsQuery = useMenuItems(restaurantId);
  const createCategory = useCreateCategory(restaurantId);
  const [newCat, setNewCat] = React.useState("");
  const [sheetItem, setSheetItem] = React.useState<MenuItem | null>(null);

  // Fichas técnicas: custo/margem por prato para a lista (0006).
  const sheetsQuery = useTechSheets(restaurantId);
  const sheetLinesQuery = useTechSheetLines(restaurantId);
  const ingredientsQuery = useIngredients(restaurantId);

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  const sheetInfoByItem = React.useMemo(() => {
    const map = new Map<string, SheetSummary>();
    const sheets = sheetsQuery.data ?? [];
    const lines = sheetLinesQuery.data ?? [];
    const ings = new Map(
      (ingredientsQuery.data ?? []).map((i) => [
        i.id,
        { unit: i.unit, cost_per_unit_cents: i.cost_per_unit_cents },
      ]),
    );
    const linesBySheet = new Map<string, typeof lines>();
    for (const l of lines) {
      const arr = linesBySheet.get(l.tech_sheet_id) ?? [];
      arr.push(l);
      linesBySheet.set(l.tech_sheet_id, arr);
    }
    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const s of sheets) {
      const summary = computeFoodCost(linesBySheet.get(s.id) ?? [], ings);
      const item = itemById.get(s.menu_item_id);
      map.set(s.menu_item_id, {
        costCents: summary.costCents,
        marginPct: computeMarginPct(item?.price_cents ?? null, summary.costCents),
        complete: summary.total > 0 && summary.costed === summary.total,
      });
    }
    return map;
  }, [sheetsQuery.data, sheetLinesQuery.data, ingredientsQuery.data, items]);

  const itemsByCat = React.useMemo(() => {
    const m = new Map<string, MenuItem[]>();
    for (const it of items) {
      const arr = m.get(it.category_id) ?? [];
      arr.push(it);
      m.set(it.category_id, arr);
    }
    return m;
  }, [items]);

  function addCategory() {
    const label = newCat.trim();
    if (label.length < 2) return;
    createCategory.mutate(
      { label, sortOrder: categories.length },
      {
        onSuccess: () => {
          toast.success("Categoria criada");
          setNewCat("");
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  if (categoriesQuery.isError || itemsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar o menu.</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            categoriesQuery.refetch();
            itemsQuery.refetch();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categories.length === 0 && (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          Ainda não tens menu. Cria a primeira categoria (ex.: Entradas, Pratos, Sobremesas).
        </p>
      )}

      {categories.map((cat) => (
        <CategoryBlock
          key={cat.id}
          restaurantId={restaurantId}
          category={{ id: cat.id, label: cat.label, active: cat.active }}
          items={itemsByCat.get(cat.id) ?? []}
          nextItemSort={(itemsByCat.get(cat.id) ?? []).length}
          sheetInfoByItem={sheetInfoByItem}
          onOpenSheet={setSheetItem}
        />
      ))}

      {sheetItem && (
        <TechSheetDialog
          restaurantId={restaurantId}
          item={sheetItem}
          open={!!sheetItem}
          onOpenChange={(o) => {
            if (!o) setSheetItem(null);
          }}
        />
      )}

      <div className="flex gap-2">
        <Input
          aria-label="Nova categoria"
          placeholder="Nova categoria (ex.: Entradas)"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCategory();
            }
          }}
        />
        <Button
          size="sm"
          disabled={createCategory.isPending || newCat.trim().length < 2}
          onClick={addCategory}
        >
          <Plus className="h-4 w-4" /> Categoria
        </Button>
      </div>
    </div>
  );
}
