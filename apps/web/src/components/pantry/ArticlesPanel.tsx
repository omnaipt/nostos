import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUpdateIngredient } from "@/hooks/use-ingredients";
import {
  useCreateFamily,
  useCreatePurchaseItem,
  useIngredientFamilies,
  usePurchaseItems,
  useUpdatePurchaseItem,
} from "@/hooks/use-purchase-items";
import { packEntryQty } from "@/lib/purchase-items";
import { UNIT_OPTIONS, type Ingredient, type PurchaseItem } from "@/lib/types";

// Stock S1 (item 4): no detalhe de um ingrediente da despensa, mostra e gere os
// artigos de compra (formatos), a família e o peso médio por unidade. Tudo via
// RLS; as guardas da 0031 validam convertibilidade e tenant.

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message.includes("formato_incompativel_com_ingrediente")) {
    return "O formato não é convertível para a unidade do ingrediente.";
  }
  return e instanceof Error ? e.message : "Não foi possível guardar.";
}

function contentLabel(pi: PurchaseItem): string {
  const u = UNIT_OPTIONS.find((o) => o.code === pi.pack_unit)?.label ?? pi.pack_unit;
  return `${pi.pack_qty} ${u}`;
}

export function ArticlesPanel({
  restaurantId,
  ingredient,
}: {
  restaurantId: string;
  ingredient: Ingredient;
}) {
  const articlesQuery = usePurchaseItems(restaurantId);
  const familiesQuery = useIngredientFamilies(restaurantId);
  const createArticle = useCreatePurchaseItem(restaurantId);
  const createFamily = useCreateFamily(restaurantId);
  const updateIngredient = useUpdateIngredient(restaurantId);

  const articles = (articlesQuery.data ?? []).filter((a) => a.ingredient_id === ingredient.id);
  const families = familiesQuery.data ?? [];

  const [showNew, setShowNew] = React.useState(false);
  const [brand, setBrand] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [packQty, setPackQty] = React.useState("");
  const [packUnit, setPackUnit] = React.useState(ingredient.unit);
  const [newFamily, setNewFamily] = React.useState("");

  const weightServed =
    ingredient.unit_weight_g != null ? String(ingredient.unit_weight_g).replace(".", ",") : "";
  const [weight, setWeight] = React.useState(weightServed);
  React.useEffect(() => setWeight(weightServed), [weightServed]);

  function addArticle() {
    const qtyNum = Number(packQty.replace(",", "."));
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Indique o conteúdo da embalagem (> 0).");
      return;
    }
    const preview = packEntryQty(1, qtyNum, packUnit, ingredient.unit, ingredient.unit_weight_g);
    if (preview == null) {
      toast.error("O formato não é convertível para a unidade do ingrediente.");
      return;
    }
    createArticle.mutate(
      {
        ingredient_id: ingredient.id,
        brand: brand.trim() || null,
        label: label.trim() || null,
        pack_qty: qtyNum,
        pack_unit: packUnit,
      },
      {
        onSuccess: () => {
          toast.success("Artigo criado.");
          setBrand("");
          setLabel("");
          setPackQty("");
          setShowNew(false);
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function saveWeight() {
    const trimmed = weight.trim();
    const next = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (next !== null && (!Number.isFinite(next) || next <= 0)) {
      toast.error("Peso médio inválido.");
      setWeight(weightServed);
      return;
    }
    if (next === ingredient.unit_weight_g) return;
    updateIngredient.mutate(
      { id: ingredient.id, patch: { unit_weight_g: next } },
      {
        onSuccess: () => toast.success("Peso médio guardado."),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function assignFamily(familyId: string | null) {
    updateIngredient.mutate(
      { id: ingredient.id, patch: { family_id: familyId } },
      { onError: (e) => toast.error(errMsg(e)) },
    );
  }

  function addFamily() {
    const name = newFamily.trim();
    if (name.length < 1) return;
    createFamily.mutate(name, {
      onSuccess: (fam) => {
        setNewFamily("");
        assignFamily(fam.id);
        toast.success("Família criada.");
      },
      onError: (e) => toast.error(errMsg(e)),
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-input bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Família */}
        <div className="space-y-1">
          <Label htmlFor="art-family">Família</Label>
          <Select
            id="art-family"
            value={ingredient.family_id ?? ""}
            onChange={(e) => assignFamily(e.target.value || null)}
          >
            <option value="">Sem família</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1">
            <Input
              aria-label="Nova família"
              className="h-7 text-xs"
              placeholder="Nova família…"
              value={newFamily}
              onChange={(e) => setNewFamily(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFamily();
                }
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={addFamily}>
              Criar
            </Button>
          </div>
        </div>

        {/* Peso médio por unidade (só útil quando a ficha usa 'un' contra peso) */}
        <div className="space-y-1">
          <Label htmlFor="art-weight">Peso médio por unidade (g)</Label>
          <Input
            id="art-weight"
            inputMode="decimal"
            placeholder="ex.: 150 (cebola)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={saveWeight}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Permite que linhas de ficha em un abatam um ingrediente ao peso.
          </p>
        </div>
      </div>

      {/* Artigos de compra */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Artigos de compra</p>
        {articles.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Ainda sem artigos. Crie um formato (marca e conteúdo) para registar entradas por embalagens.
          </p>
        )}
        {articles.map((a) => (
          <ArticleRow key={a.id} restaurantId={restaurantId} article={a} />
        ))}

        {showNew ? (
          <div className="space-y-2 rounded-md border border-input bg-card p-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Marca"
                placeholder="Marca (ex.: Gallo)"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
              <Input
                aria-label="Formato"
                placeholder="Formato (ex.: Garrafão 5 L)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Conteúdo"
                inputMode="decimal"
                className="w-28"
                placeholder="Conteúdo"
                value={packQty}
                onChange={(e) => setPackQty(e.target.value)}
              />
              <Select
                aria-label="Unidade do conteúdo"
                className="w-24"
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value)}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.label}
                  </option>
                ))}
              </Select>
              <Button type="button" size="sm" disabled={createArticle.isPending} onClick={addArticle}>
                Guardar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowNew(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Novo artigo
          </Button>
        )}
      </div>
    </div>
  );
}

function ArticleRow({
  restaurantId,
  article,
}: {
  restaurantId: string;
  article: PurchaseItem;
}) {
  const update = useUpdatePurchaseItem(restaurantId);
  const [brand, setBrand] = React.useState(article.brand ?? "");
  const [label, setLabel] = React.useState(article.label ?? "");

  function saveField(patch: { brand?: string | null; label?: string | null }) {
    update.mutate({ id: article.id, patch }, { onError: (e) => toast.error(errMsg(e)) });
  }

  return (
    <div
      className={
        "flex flex-wrap items-center gap-2 rounded-md border border-input p-2 text-sm " +
        (article.active ? "" : "opacity-60")
      }
    >
      <Input
        aria-label={`Marca do artigo ${article.id}`}
        className="h-8 w-32"
        placeholder="Marca"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        onBlur={() => {
          if ((article.brand ?? "") !== brand) saveField({ brand: brand.trim() || null });
        }}
      />
      <Input
        aria-label={`Formato do artigo ${article.id}`}
        className="h-8 flex-1"
        placeholder="Formato"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if ((article.label ?? "") !== label) saveField({ label: label.trim() || null });
        }}
      />
      <span className="shrink-0 text-xs text-muted-foreground">{contentLabel(article)}</span>
      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={article.active}
          onChange={(e) =>
            update.mutate(
              { id: article.id, patch: { active: e.target.checked } },
              { onError: (err) => toast.error(errMsg(err)) },
            )
          }
        />
        Activo
      </label>
    </div>
  );
}
