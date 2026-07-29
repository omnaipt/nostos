import * as React from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, NotebookPen, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCategory,
  useCreateDailyItems,
  useCreateItem,
  useDeleteCategory,
  useDeleteItem,
  useItemVariants,
  useMenuCategories,
  useMenuItems,
  useUpdateCategory,
  useUpdateItem,
  useUpdateVariant,
} from "@/hooks/use-menu";
import { dailyDuplicates, isDailyOf } from "@/lib/menu-daily";
import { todayServiceDate } from "@/lib/service-date";
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
  type MenuItemUpdate,
  type MenuItemVariant,
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
  priceType = "fixed",
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: ItemDraft;
  // ARMADILHA da 0010: fixed/per_kg exigem preço; market/variants exigem
  // price_cents NULL. O form só mostra (e o caller só grava) preço nos tipos
  // que o têm no item — escrever preço num market/variants rebenta a check.
  priceType?: MenuItem["price_type"];
  submitting: boolean;
  onSubmit: (draft: ItemDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState<ItemDraft>(initial);
  const hasOwnPrice = priceType === "fixed" || priceType === "per_kg";
  const priceMissing = hasOwnPrice && parsePriceToCents(draft.price) == null;

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
      <div className={hasOwnPrice ? "grid gap-2 sm:grid-cols-[1fr_120px]" : "grid gap-2"}>
        <Input
          aria-label="Nome do prato"
          placeholder="Nome do prato"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        {hasOwnPrice && (
          <Input
            aria-label="Preço"
            inputMode="decimal"
            placeholder={priceType === "per_kg" ? "€/kg (39,50)" : "Preço (12,50)"}
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
          />
        )}
      </div>
      {priceType === "market" && (
        <p className="text-xs text-muted-foreground">
          Preço do dia (lota): este prato não tem preço fixo.
        </p>
      )}
      {priceType === "variants" && (
        <p className="text-xs text-muted-foreground">
          Os preços vivem nas doses — editam-se na linha do prato.
        </p>
      )}
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
          disabled={submitting || draft.name.trim().length < 2 || priceMissing}
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

// Preço na linha, fiel ao tipo (a lista nunca mente sobre o modelo de preço).
function priceLabel(item: MenuItem): string | null {
  switch (item.price_type) {
    case "market":
      return "preço do dia";
    case "per_kg":
      return item.price_cents != null ? `${formatPriceCents(item.price_cents)}/kg` : "—";
    case "variants":
      return null; // as doses mostram-se por baixo, com preço próprio
    default:
      return formatPriceCents(item.price_cents);
  }
}

// Edição inline do preço de uma dose (variants, 0010). Blur grava se mudou.
function VariantPriceRow({
  restaurantId,
  variant,
}: {
  restaurantId: string;
  variant: MenuItemVariant;
}) {
  const update = useUpdateVariant(restaurantId);
  const fromCents = (c: number | null) =>
    c != null ? (c / 100).toString().replace(".", ",") : "";
  const [price, setPrice] = React.useState(fromCents(variant.price_cents));
  React.useEffect(() => setPrice(fromCents(variant.price_cents)), [variant.price_cents]);

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs text-muted-foreground">
        {variant.label}
        {variant.serves ? ` · ${variant.serves} pax` : ""}
      </span>
      <Input
        aria-label={`Preço da dose ${variant.label}`}
        inputMode="decimal"
        className="h-7 w-24 text-right text-xs tabular-nums"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={() => {
          const cents = parsePriceToCents(price);
          if (cents == null) {
            toast.error("Preço inválido");
            setPrice(fromCents(variant.price_cents));
            return;
          }
          if (cents === variant.price_cents) return;
          update.mutate(
            { id: variant.id, patch: { price_cents: cents } },
            {
              onSuccess: () => toast.success(`Preço de "${variant.label}" guardado`),
              onError: (e) => toast.error(errMsg(e)),
            },
          );
        }}
      />
      {variant.unit === "kg" && <span className="text-xs text-muted-foreground">/kg</span>}
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
  variants,
  sheetSummary,
  onOpenSheet,
}: {
  restaurantId: string;
  item: MenuItem;
  variants: MenuItemVariant[];
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
        priceType={item.price_type}
        submitting={update.isPending}
        onCancel={() => setEditing(false)}
        onSubmit={(d) => {
          // price_cents só entra no patch nos tipos com preço no item; nos
          // market/variants a coluna fica intocada (check da 0010).
          const patch: MenuItemUpdate = {
            name: d.name.trim(),
            description: d.description.trim() || null,
            allergens: d.allergens,
          };
          if (item.price_type === "fixed" || item.price_type === "per_kg") {
            patch.price_cents = parsePriceToCents(d.price);
          }
          update.mutate(
            { id: item.id, patch },
            {
              onSuccess: () => {
                toast.success("Prato guardado");
                setEditing(false);
              },
              onError: (e) => toast.error(errMsg(e)),
            },
          );
        }}
      />
    );
  }

  const price = priceLabel(item);

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
        {item.price_type === "variants" && variants.length > 0 && (
          <div className="mt-1.5 space-y-1 border-l border-border pl-3">
            {variants.map((v) => (
              <VariantPriceRow key={v.id} restaurantId={restaurantId} variant={v} />
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {price != null && (
          <span className="mr-1 tabular-nums text-sm text-muted-foreground">{price}</span>
        )}
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
        <label
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title="Prato por encomenda: sinalizado no menu e pré-pedido na página de reserva"
        >
          <input
            type="checkbox"
            checked={item.by_order}
            onChange={(e) =>
              update.mutate(
                { id: item.id, patch: { by_order: e.target.checked } },
                { onError: (err) => toast.error(errMsg(err)) },
              )
            }
          />
          Encomenda
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
  variantsByItem,
  nextItemSort,
  sheetInfoByItem,
  onOpenSheet,
}: {
  restaurantId: string;
  category: { id: string; label: string; active: boolean };
  items: MenuItem[];
  variantsByItem: Map<string, MenuItemVariant[]>;
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
            variants={variantsByItem.get(item.id) ?? []}
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

// Painel "Pratos de hoje" (decisões David 28-07): os daily criam-se aqui com
// a data de hoje, duplicam-se de ontem com um clique, e desaparecem sozinhos
// do público quando o dia passa. Não aparecem nos blocos de categoria.
function DailyPanel({
  restaurantId,
  items,
  categories,
}: {
  restaurantId: string;
  items: MenuItem[];
  categories: { id: string; label: string }[];
}) {
  const today = todayServiceDate();
  const todays = items.filter((i) => isDailyOf(i, today));
  const dups = dailyDuplicates(items, today);
  const createDailies = useCreateDailyItems(restaurantId);
  const update = useUpdateItem(restaurantId);
  const remove = useDeleteItem(restaurantId);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [catId, setCatId] = React.useState("");

  React.useEffect(() => {
    if (!catId && categories.length > 0) setCatId(categories[0].id);
  }, [categories, catId]);

  function addDaily() {
    const cents = parsePriceToCents(price);
    if (name.trim().length < 2 || cents == null || !catId) return;
    createDailies.mutate(
      [
        {
          restaurant_id: restaurantId,
          category_id: catId,
          name: name.trim(),
          price_cents: cents,
          kind: "daily",
          service_date: today,
        },
      ],
      {
        onSuccess: () => {
          toast.success("Prato de hoje adicionado");
          setName("");
          setPrice("");
          setAdding(false);
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-input bg-muted/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Pratos de hoje</p>
        <Button
          size="sm"
          variant="outline"
          disabled={dups.length === 0 || createDailies.isPending}
          title={
            dups.length === 0
              ? "Ontem não houve pratos do dia por copiar"
              : `Copiar ${dups.length} prato(s) de ontem para hoje`
          }
          onClick={() =>
            createDailies.mutate(dups, {
              onSuccess: (n) => toast.success(`${n} prato(s) de ontem duplicados para hoje`),
              onError: (e) => toast.error(errMsg(e)),
            })
          }
        >
          <CopyPlus className="h-4 w-4" /> Duplicar os de ontem
          {dups.length > 0 ? ` (${dups.length})` : ""}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Saem no menu e na página de reserva só durante o dia de hoje; amanhã
        escondem-se sozinhos.
      </p>

      {todays.length === 0 && !adding && (
        <p className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
          Ainda sem pratos do dia para hoje.
        </p>
      )}

      <div className="divide-y divide-border">
        {todays.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-2">
            <p className={"text-sm font-medium " + (item.available ? "" : "opacity-60")}>
              {item.name}
              <span className="ml-2 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                prato do dia · hoje
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-1 tabular-nums text-sm text-muted-foreground">
                {priceLabel(item)}
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
                aria-label="Remover prato de hoje"
                onClick={() =>
                  remove.mutate(item.id, {
                    onSuccess: () => toast.success("Prato de hoje removido"),
                    onError: (e) => toast.error(errMsg(e)),
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_160px]">
            <Input
              aria-label="Nome do prato de hoje"
              placeholder="Ex.: Robalo da lota no forno"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              aria-label="Preço do prato de hoje"
              inputMode="decimal"
              placeholder="Preço (14,50)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <Select
              aria-label="Categoria do prato de hoje"
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={
                createDailies.isPending ||
                name.trim().length < 2 ||
                parsePriceToCents(price) == null ||
                !catId
              }
              onClick={addDaily}
            >
              Guardar prato de hoje
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={categories.length === 0}
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" /> Prato de hoje
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
  // Variantes (0010): preços por dose, editáveis na linha.
  const variantsQuery = useItemVariants(restaurantId);

  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  const variantsByItem = React.useMemo(() => {
    const m = new Map<string, MenuItemVariant[]>();
    for (const v of variantsQuery.data ?? []) {
      const arr = m.get(v.item_id) ?? [];
      arr.push(v);
      m.set(v.item_id, arr);
    }
    return m;
  }, [variantsQuery.data]);

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

  // Os pratos do dia (kind='daily') vivem no painel "Pratos de hoje", não nos
  // blocos de categoria — são efémeros por natureza.
  const itemsByCat = React.useMemo(() => {
    const m = new Map<string, MenuItem[]>();
    for (const it of items) {
      if (it.kind === "daily") continue;
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

      {categories.length > 0 && (
        <DailyPanel
          restaurantId={restaurantId}
          items={items}
          categories={categories.map((c) => ({ id: c.id, label: c.label }))}
        />
      )}

      {categories.map((cat) => (
        <CategoryBlock
          key={cat.id}
          restaurantId={restaurantId}
          category={{ id: cat.id, label: cat.label, active: cat.active }}
          items={itemsByCat.get(cat.id) ?? []}
          variantsByItem={variantsByItem}
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
