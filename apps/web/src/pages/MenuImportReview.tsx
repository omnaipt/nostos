import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Wine } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useMenuItems } from "@/hooks/use-menu";
import {
  useDiscardMenuImport,
  useMenuImport,
  usePublishMenuImport,
} from "@/hooks/use-menu-import";
import {
  draftToEditable,
  editableToPayload,
  type EditCategory,
  type EditItem,
} from "@/lib/menu-import";
import { ALLERGEN_LABEL } from "@/lib/types";
import type { MenuDraft, PriceType } from "../../../../supabase/functions/parse-menu/draft";

// Ecrã de revisão do menu importado (PR 2/2 do parse-menu; mockup 28-07
// validou o desenho). O rascunho vive em menu_imports.payload (staging); tudo
// aqui é edição local. "Publicar ementa" é o ÚNICO botão que escreve no menu
// real — RPC transaccional publish_menu_import (falha a meio = nada publicado,
// draft intacto). Reimportar acrescenta; duplicados por nome levam aviso.

const PRICE_TYPE_LABEL: Record<PriceType, string> = {
  fixed: "preço fixo",
  per_kg: "€/kg",
  market: "preço do dia",
  variants: "por doses",
};

function isMenuDraft(v: unknown): v is MenuDraft {
  return (
    typeof v === "object" && v !== null && Array.isArray((v as MenuDraft).categories)
  );
}

export default function MenuImportReview() {
  const { importId } = useParams<{ importId: string }>();
  const navigate = useNavigate();
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const importQuery = useMenuImport(importId);
  const itemsQuery = useMenuItems(restaurantId);
  const publish = usePublishMenuImport(restaurantId);
  const discard = useDiscardMenuImport(restaurantId);

  const [cats, setCats] = React.useState<EditCategory[] | null>(null);
  const [problems, setProblems] = React.useState<string[]>([]);

  const imp = importQuery.data;
  const draft = imp && isMenuDraft(imp.payload) ? imp.payload : null;

  // Carrega o estado editável UMA vez, com os duplicados contra a ementa real.
  React.useEffect(() => {
    if (cats !== null || !draft || !itemsQuery.data) return;
    const existing = new Set(itemsQuery.data.map((i) => i.name.trim().toLowerCase()));
    setCats(draftToEditable(draft, existing));
  }, [cats, draft, itemsQuery.data]);

  function patchItem(catKey: string, itemKey: string, patch: Partial<EditItem>) {
    setCats((cs) =>
      (cs ?? []).map((c) =>
        c.key !== catKey
          ? c
          : { ...c, items: c.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) },
      ),
    );
  }

  function removeItem(catKey: string, itemKey: string) {
    setCats((cs) =>
      (cs ?? []).map((c) =>
        c.key !== catKey ? c : { ...c, items: c.items.filter((i) => i.key !== itemKey) },
      ),
    );
  }

  function moveItem(fromKey: string, itemKey: string, toKey: string) {
    setCats((cs) => {
      if (!cs || fromKey === toKey) return cs;
      const item = cs.find((c) => c.key === fromKey)?.items.find((i) => i.key === itemKey);
      if (!item) return cs;
      return cs.map((c) => {
        if (c.key === fromKey) return { ...c, items: c.items.filter((i) => i.key !== itemKey) };
        if (c.key === toKey) return { ...c, items: [...c.items, item] };
        return c;
      });
    });
  }

  function onPublish() {
    if (!cats || !importId) return;
    const { menu, problems: found } = editableToPayload(cats);
    setProblems(found);
    if (!menu) {
      toast.error("Há itens por resolver — vê a lista por cima do botão.");
      return;
    }
    publish.mutate(
      { importId, menu },
      {
        onSuccess: (stats) => {
          toast.success(
            `Ementa publicada: ${stats.items_created} itens` +
              (stats.categories_created > 0 ? `, ${stats.categories_created} categorias novas` : "") +
              (stats.variants_created > 0 ? `, ${stats.variants_created} doses` : "") +
              ".",
          );
          navigate("/ementa");
        },
        // Erros da RPC vêm legíveis (preco_em_falta: X) — mostram-se tal e qual.
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível publicar."),
      },
    );
  }

  function onDiscard() {
    if (!importId) return;
    if (!window.confirm("Descartar este rascunho? A ementa actual não é tocada.")) return;
    discard.mutate(importId, {
      onSuccess: () => {
        toast.success("Rascunho descartado.");
        navigate("/ementa");
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível descartar."),
    });
  }

  // ── Estados de página ──────────────────────────────────────────────────────
  if (importQuery.isLoading || (imp && draft && cats === null)) {
    return (
      <div className="container max-w-2xl space-y-3 py-8">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!imp || !draft) {
    return (
      <HonestState title="Importação não encontrada">
        O rascunho pode ter sido removido. Volta à ementa e importa de novo — ou
        adiciona os pratos à mão.
      </HonestState>
    );
  }

  if (imp.status !== "review") {
    return (
      <HonestState
        title={imp.status === "published" ? "Já publicada" : "Rascunho fechado"}
      >
        {imp.status === "published"
          ? "Esta importação já foi publicada na ementa."
          : "Este rascunho foi descartado."}
      </HonestState>
    );
  }

  const totalItems = (cats ?? []).reduce((n, c) => n + c.items.length, 0);
  const flagged = (cats ?? []).reduce(
    (n, c) => n + c.items.filter((i) => i.needsReview || i.confidence === "baixa").length,
    0,
  );

  return (
    <div className="container max-w-2xl pb-28 pt-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">
          Rever {imp.source_kind === "wine_list" ? "carta de vinhos" : "menu"} importado
        </h1>
        <p className="text-sm text-muted-foreground">
          {totalItems} it{totalItems === 1 ? "em" : "ens"}
          {flagged > 0 && (
            <>
              {" "}
              · <span className="font-medium text-[hsl(var(--status-pending-fg))]">{flagged} para rever</span>
            </>
          )}
          {imp.source_ref && ` · ${imp.source_ref}`}. Nada é publicado até carregares em
          &quot;Publicar ementa&quot;.
        </p>
      </header>

      {draft.wines_detected && imp.source_kind !== "wine_list" && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))] p-3 text-sm">
          <Wine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Detectámos páginas de carta de vinhos e NÃO as misturámos com os pratos.
            Importa a carta em passo próprio na Ementa (botão &quot;Carta de vinhos&quot;).
          </span>
        </div>
      )}

      <div className="space-y-5">
        {(cats ?? []).map((cat) => (
          <section key={cat.key} className="space-y-2">
            <Input
              aria-label="Nome da categoria"
              className="max-w-xs font-semibold"
              value={cat.name}
              onChange={(e) =>
                setCats((cs) =>
                  (cs ?? []).map((c) => (c.key === cat.key ? { ...c, name: e.target.value } : c)),
                )
              }
            />
            {cat.items.length === 0 && (
              <p className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
                Sem itens — esta categoria não será publicada.
              </p>
            )}
            {cat.items.map((item) => (
              <ItemEditor
                key={item.key}
                item={item}
                categories={cats ?? []}
                catKey={cat.key}
                onPatch={(p) => patchItem(cat.key, item.key, p)}
                onRemove={() => removeItem(cat.key, item.key)}
                onMove={(toKey) => moveItem(cat.key, item.key, toKey)}
              />
            ))}
          </section>
        ))}
      </div>

      {/* Rodapé fixo: problemas + acções. Publicar é o único que escreve. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="container max-w-2xl space-y-2 py-3">
          {problems.length > 0 && (
            <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-destructive">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" disabled={discard.isPending} onClick={onDiscard}>
              Descartar rascunho
            </Button>
            <Button disabled={publish.isPending || totalItems === 0} onClick={onPublish}>
              {publish.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {publish.isPending ? "A publicar…" : "Publicar ementa"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  categories,
  catKey,
  onPatch,
  onRemove,
  onMove,
}: {
  item: EditItem;
  categories: EditCategory[];
  catKey: string;
  onPatch: (p: Partial<EditItem>) => void;
  onRemove: () => void;
  onMove: (toKey: string) => void;
}) {
  const flagged = item.needsReview || item.confidence === "baixa";
  return (
    <div
      className={
        "space-y-2 rounded-md border bg-card p-3 " +
        (flagged ? "border-[hsl(var(--status-pending-fg))]/50" : "border-input")
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          aria-label="Nome do prato"
          className="h-9 min-w-40 flex-1"
          value={item.name}
          onChange={(e) => onPatch({ name: e.target.value })}
        />
        <Select
          aria-label="Tipo de preço"
          className="h-9 w-36 py-0 text-sm"
          value={item.priceType}
          onChange={(e) => {
            const priceType = e.target.value as PriceType;
            onPatch({
              priceType,
              variants:
                priceType === "variants" && item.variants.length === 0
                  ? [{ key: `var-novo-${item.key}`, label: "dose", price: "", serves: "" }]
                  : item.variants,
            });
          }}
        >
          {(Object.keys(PRICE_TYPE_LABEL) as PriceType[]).map((t) => (
            <option key={t} value={t}>
              {PRICE_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        {(item.priceType === "fixed" || item.priceType === "per_kg") && (
          <Input
            aria-label={`Preço de ${item.name}`}
            inputMode="decimal"
            placeholder={item.priceType === "per_kg" ? "€/kg" : "12,50"}
            className="h-9 w-24 text-right tabular-nums"
            value={item.price}
            onChange={(e) => onPatch({ price: e.target.value })}
          />
        )}
      </div>

      <Input
        aria-label="Descrição"
        placeholder="Descrição (opcional)"
        className="h-8 text-sm"
        value={item.description}
        onChange={(e) => onPatch({ description: e.target.value })}
      />

      {item.priceType === "variants" && (
        <div className="space-y-1.5 border-l border-border pl-3">
          {item.variants.map((v) => (
            <div key={v.key} className="flex flex-wrap items-center gap-1.5">
              <Input
                aria-label="Nome da dose"
                placeholder="ex.: 2 pax"
                className="h-8 w-28 text-sm"
                value={v.label}
                onChange={(e) =>
                  onPatch({
                    variants: item.variants.map((x) =>
                      x.key === v.key ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label="Preço da dose"
                inputMode="decimal"
                placeholder="preço do dia"
                className="h-8 w-24 text-right text-sm tabular-nums"
                value={v.price}
                onChange={(e) =>
                  onPatch({
                    variants: item.variants.map((x) =>
                      x.key === v.key ? { ...x, price: e.target.value } : x,
                    ),
                  })
                }
              />
              <Input
                aria-label="Pessoas"
                inputMode="numeric"
                placeholder="pax"
                className="h-8 w-16 text-right text-sm"
                value={v.serves}
                onChange={(e) =>
                  onPatch({
                    variants: item.variants.map((x) =>
                      x.key === v.key ? { ...x, serves: e.target.value } : x,
                    ),
                  })
                }
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Remover dose"
                onClick={() => onPatch({ variants: item.variants.filter((x) => x.key !== v.key) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() =>
              onPatch({
                variants: [
                  ...item.variants,
                  { key: `var-${item.key}-${item.variants.length}`, label: "", price: "", serves: "" },
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Dose
          </Button>
          <p className="text-[11px] text-muted-foreground">A 1ª dose é a principal (margens).</p>
        </div>
      )}

      {(flagged || item.duplicate || item.note || item.allergens.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {item.needsReview && (
            <span className="rounded-full border border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))] px-2 py-0.5 text-[hsl(var(--status-pending-fg))]">
              rever
            </span>
          )}
          {item.confidence === "baixa" && (
            <span className="rounded-full border border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))] px-2 py-0.5 text-[hsl(var(--status-pending-fg))]">
              confiança baixa
            </span>
          )}
          {item.duplicate && (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive">
              já existe na ementa
            </span>
          )}
          {item.allergens.map((a) => (
            <span key={a} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-muted-foreground">
              {ALLERGEN_LABEL[a] ?? a}
            </span>
          ))}
          {item.allergens.length > 0 && (
            <span className="text-muted-foreground">alergénios por confirmar</span>
          )}
          {item.note && <span className="text-muted-foreground">· {item.note}</span>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Categoria
          <Select
            aria-label={`Categoria de ${item.name}`}
            className="h-7 w-36 py-0 text-xs"
            value={catKey}
            onChange={(e) => onMove(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name || "(sem nome)"}
              </option>
            ))}
          </Select>
        </label>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </Button>
      </div>
    </div>
  );
}

function HonestState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <p className="font-display text-lg font-semibold text-atlantico-900">{title}</p>
          <p className="text-sm text-muted-foreground">{children}</p>
          <Link to="/ementa" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voltar à Ementa
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
