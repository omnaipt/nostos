import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Camera, Loader2, Plus, Trash2 } from "lucide-react";
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
import { useParseInvoice, type ParseInvoiceResult } from "@/hooks/use-parse-invoice";
import {
  usePurchaseItems,
  useSupplierAliases,
  useCreatePurchaseItem,
} from "@/hooks/use-purchase-items";
import { formatCostCents } from "@/components/menu/PantryManager";
import { formatQty } from "@/lib/stock";
import { todayServiceDate } from "@/lib/service-date";
import { estimateExpiryDate, resolveShelfLifeDays } from "@/lib/expiry";
import { parsePriceToCents, UNIT_OPTIONS, type Ingredient, type PurchaseItem } from "@/lib/types";
import {
  packEntryBaseCostCents,
  packEntryQty,
  proposeArticleFromRawName,
} from "@/lib/purchase-items";
// Módulo puro partilhado com a edge parse-invoice (norma da aprendizagem).
import { norm } from "../../../../supabase/functions/parse-invoice/match";

// Entradas de compra (Gap A): fornecedor + nº fatura + data + linhas
// (ingrediente do catálogo, qtd, custo unitário s/IVA) → stock_movements
// purchase por linha. O trigger 0011/0016 aplica saldo e custo MÉDIO; o rasto
// aparece na /despensa de borla (note "Fatura {fornecedor} {nº}").
//
// Parse de fatura (PDF/foto): pré-preenche ESTE formulário — o form manual É o
// ecrã de revisão, e "Registar entrada" continua a ser o único botão que
// escreve. Progressive enhancement: sem rede/edge, o manual funciona como
// sempre. Ao registar, as escolhas do dono em linhas vindas do parse ensinam
// os aliases do fornecedor (0018) para a próxima fatura casar sozinha.

interface LineDraft {
  ingredientId: string;
  qty: string;
  cost: string; // €/unidade s/IVA (entrada directa) ou €/embalagem (por artigo)
  expires: string; // validade estimada (YYYY-MM-DD), editável; "" = sem estimativa
  // Stock S1: entrada por artigo de compra + embalagens. "" = entrada directa.
  purchaseItemId: string;
  packs: string; // nº de embalagens (texto), só quando há artigo
  // Metadados do parse (ausentes em linhas manuais):
  fromParse?: boolean;
  rawName?: string; // descrição exacta na fatura (visível; chave da aprendizagem)
  grade?: "verde" | "ambar" | null;
  parseNote?: string | null; // note da IA + aviso de unidade, quando existirem
}

const EMPTY_LINE: LineDraft = {
  ingredientId: "",
  qty: "",
  cost: "",
  expires: "",
  purchaseItemId: "",
  packs: "",
};

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
  // supplier_norm do PARSE (chave da aprendizagem de aliases; estável entre
  // faturas do mesmo fornecedor mesmo que o dono corrija o campo visível).
  const [parsedSupplierNorm, setParsedSupplierNorm] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const articlesQuery = usePurchaseItems(restaurantId);
  const aliasesQuery = useSupplierAliases(restaurantId);
  const createArticle = useCreatePurchaseItem(restaurantId);

  const ingredients = (ingredientsQuery.data ?? []).filter((i) => i.active !== false);
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const parse = useParseInvoice(restaurantId, ingredients);

  // Artigos activos por ingrediente (para o selector de formato de cada linha).
  const articlesByIngredient = React.useMemo(() => {
    const m = new Map<string, PurchaseItem[]>();
    for (const a of articlesQuery.data ?? []) {
      if (!a.active) continue;
      const arr = m.get(a.ingredient_id) ?? [];
      arr.push(a);
      m.set(a.ingredient_id, arr);
    }
    return m;
  }, [articlesQuery.data]);
  const articleById = React.useMemo(
    () => new Map((articlesQuery.data ?? []).map((a) => [a.id, a])),
    [articlesQuery.data],
  );
  // Aliases com artigo, por supplier_norm|raw_name_norm (segunda fatura propõe
  // o mesmo artigo sem intervenção).
  const aliasArticleByKey = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const al of aliasesQuery.data ?? []) {
      if (al.purchase_item_id) m.set(`${al.supplier_norm}|${al.raw_name_norm}`, al.purchase_item_id);
    }
    return m;
  }, [aliasesQuery.data]);

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // Validade estimada (Gap G): data da fatura + shelf life resolvido (override
  // do ingrediente > categoria > fallback do storage_mode). Campos category/
  // storage_mode podem não existir em runtime antes da 0017 — defensivo.
  function estimateFor(ing: Ingredient): string {
    return estimateForDate(ing, invoiceDate);
  }

  // ── Parse da fatura: pré-preenche o formulário; nada é registado ──────────
  function applyParseResult(result: ParseInvoiceResult) {
    if (!result.parsed) {
      toast.error(result.reason ?? "Não foi possível ler a fatura. Registe a entrada manualmente.");
      return;
    }
    const parsedLines = result.lines ?? [];
    const date =
      result.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(result.invoice_date)
        ? result.invoice_date
        : invoiceDate;
    const supplierNorm = result.supplier_norm ?? null;
    const drafts: LineDraft[] = parsedLines.map((l) => {
      const ing = l.ingredient_id ? ingredientById.get(l.ingredient_id) : undefined;
      const noteParts = [l.note, l.unit_warning].filter(Boolean) as string[];
      // Segunda fatura do mesmo fornecedor com o mesmo nome de linha: se o alias
      // já aprendeu um artigo, propõe o mesmo artigo e as embalagens (= qty).
      const aliasKey = supplierNorm && l.raw_name ? `${supplierNorm}|${norm(l.raw_name)}` : null;
      const proposedArticleId = aliasKey ? aliasArticleByKey.get(aliasKey) : undefined;
      const hasArticle = !!(proposedArticleId && articleById.has(proposedArticleId));
      return {
        ingredientId: ing?.id ?? "",
        qty: l.fill_qty != null ? String(l.fill_qty) : l.qty != null ? String(l.qty) : "",
        cost:
          l.fill_cost_cents != null
            ? (l.fill_cost_cents / 100).toFixed(2).replace(".", ",")
            : "",
        expires: ing ? estimateForDate(ing, date) : "",
        purchaseItemId: hasArticle ? (proposedArticleId as string) : "",
        packs: hasArticle && l.qty != null ? String(l.qty) : "",
        fromParse: true,
        rawName: l.raw_name,
        grade: l.confidence === "baixa" && l.match_grade === "verde" ? "ambar" : l.match_grade,
        parseNote: noteParts.length > 0 ? noteParts.join(" · ") : null,
      };
    });
    if (drafts.length === 0) {
      toast.error("A fatura não trouxe linhas aproveitáveis. Registe a entrada manualmente.");
      return;
    }
    if (result.supplier) setSupplier(result.supplier);
    if (result.invoice_number) setInvoiceNo(result.invoice_number);
    setInvoiceDate(date);
    setParsedSupplierNorm(result.supplier_norm ?? null);
    setLines(drafts);
    const matched = drafts.filter((d) => d.ingredientId).length;
    toast.success(
      `Fatura lida: ${drafts.length} linha${drafts.length > 1 ? "s" : ""}, ${matched} com match. Rever e registar.`,
    );
  }

  function estimateForDate(ing: Ingredient, date: string): string {
    const days = resolveShelfLifeDays(
      {
        category: (ing as { category?: string | null }).category ?? null,
        storage_mode: (ing as { storage_mode?: string }).storage_mode ?? "ambiente",
        shelf_life_override_days:
          (ing as { shelf_life_override_days?: number | null }).shelf_life_override_days ?? null,
      },
      shelfDefaultsQuery.data ?? [],
    );
    return days != null ? estimateExpiryDate(date, days) : "";
  }

  function onFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    parse.mutate(files, {
      onSuccess: applyParseResult,
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Não foi possível ler a fatura."),
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (supplier.trim().length < 2) {
      setFormError("Indique o fornecedor.");
      return;
    }
    if (!invoiceNo.trim()) {
      setFormError("Indique o nº da fatura.");
      return;
    }
    const parsed: PurchaseEntryLine[] = [];
    for (const l of lines) {
      if (!l.ingredientId && !l.qty.trim() && !l.cost.trim() && !l.purchaseItemId) continue; // linha vazia
      const ing = ingredientById.get(l.ingredientId);
      if (!ing) {
        setFormError("Cada linha precisa de ingrediente.");
        return;
      }
      if (l.purchaseItemId) {
        // Entrada por embalagens: qty e custo vêm já na unidade do ingrediente.
        const art = articleById.get(l.purchaseItemId);
        const packsNum = Number(l.packs.replace(",", "."));
        if (!art || !Number.isFinite(packsNum) || packsNum <= 0) {
          setFormError("Indique o nº de embalagens (> 0).");
          return;
        }
        const qty = packEntryQty(packsNum, art.pack_qty, art.pack_unit, ing.unit, ing.unit_weight_g);
        if (qty == null) {
          setFormError("Formato do artigo incompatível com a unidade do ingrediente.");
          return;
        }
        const baseCost = packEntryBaseCostCents(
          parsePriceToCents(l.cost),
          art.pack_qty,
          art.pack_unit,
          ing.unit,
          ing.unit_weight_g,
        );
        parsed.push({
          ingredientId: ing.id,
          unit: ing.unit,
          qty,
          costPerUnitCents: baseCost,
          expiresAt: l.expires.trim() || null,
          purchaseItemId: art.id,
          packs: packsNum,
        });
      } else {
        const qty = Number(l.qty.replace(",", "."));
        if (!Number.isFinite(qty) || qty <= 0) {
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
    }
    if (parsed.length === 0) {
      setFormError("A fatura precisa de pelo menos uma linha.");
      return;
    }
    // Aprendizagem (0018): a escolha final do dono em linhas do parse vira
    // alias do fornecedor — a próxima fatura igual casa a verde sozinha.
    const aliasItems = lines
      .filter((l) => l.fromParse && l.rawName && l.ingredientId)
      .map((l) => ({
        rawNameNorm: norm(l.rawName as string),
        ingredientId: l.ingredientId,
        purchaseItemId: l.purchaseItemId || null,
      }))
      .filter((a) => a.rawNameNorm.length > 0);
    const aliasLearning =
      parsedSupplierNorm && aliasItems.length > 0
        ? { supplierNorm: parsedSupplierNorm, items: aliasItems }
        : null;

    create.mutate(
      {
        supplier: supplier.trim(),
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        lines: parsed,
        aliasLearning,
      },
      {
        onSuccess: (n) => {
          toast.success(`Entrada registada (${n} linha${n > 1 ? "s" : ""})`);
          setSupplier("");
          setInvoiceNo("");
          setInvoiceDate(todayServiceDate());
          setLines([{ ...EMPTY_LINE }]);
          setParsedSupplierNorm(null);
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
          <h1 className="font-display text-2xl font-semibold text-atlantico-900">Entradas de compra</h1>
          <p className="text-sm text-muted-foreground">
            Registo das faturas de fornecedor. O saldo e o custo médio da despensa
            actualizam-se automaticamente.
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
            A despensa ainda não tem ingredientes. Crie o catálogo nas Definições
            antes de registar entradas.
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
                {/* Upload da fatura: pré-preenche o form (a revisão é aqui);
                    no telemóvel o capture abre a câmara na recepção da
                    mercadoria. Progressive enhancement — sem edge, o manual
                    continua intacto. */}
                <div
                  className={
                    "rounded-md border border-dashed p-4 text-center transition-colors " +
                    (dragOver ? "border-primary bg-primary/5" : "border-input")
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    onFiles(e.dataTransfer.files);
                  }}
                >
                  {parse.isPending ? (
                    <div className="space-y-2 py-1">
                      <p className="text-sm font-medium">A ler a fatura…</p>
                      <Skeleton className="mx-auto h-4 w-2/3" />
                      <Skeleton className="mx-auto h-4 w-1/2" />
                    </div>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={(e) => onFiles(e.target.files)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Camera className="h-4 w-4" /> Carregar fatura (PDF ou foto)
                      </Button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ou arraste para aqui · a leitura pré-preenche o
                        formulário, para rever e registar
                      </p>
                    </>
                  )}
                </div>

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
                    // Âmbar: pede olhos do dono (confiança baixa, note, contenção,
                    // sugestão do modelo, unidade divergente ou sem match).
                    const amber =
                      line.fromParse && (line.grade === "ambar" || !line.ingredientId || !!line.parseNote);
                    return (
                      <div
                        key={idx}
                        className={
                          "rounded-md border p-3 " +
                          (amber
                            ? "border-[hsl(var(--status-pending-fg))]/50 bg-[hsl(var(--status-pending-bg))]"
                            : "border-input")
                        }
                      >
                        {line.fromParse && line.rawName && (
                          <p className="mb-1 text-xs text-muted-foreground">
                            Na fatura: <span className="font-medium text-foreground">{line.rawName}</span>
                            {line.grade === "verde" && !amber && (
                              <span className="ml-2 text-[hsl(var(--status-seated-fg))]">match automático</span>
                            )}
                            {line.fromParse && !line.ingredientId && (
                              <span className="ml-2">· escolher o ingrediente</span>
                            )}
                          </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-[1fr_36px]">
                          <Select
                            aria-label="Ingrediente"
                            value={line.ingredientId}
                            onChange={(e) => {
                              const next = ingredientById.get(e.target.value);
                              setLine(idx, {
                                ingredientId: e.target.value,
                                expires: next ? estimateFor(next) : "",
                                // Mudar de ingrediente limpa o artigo (é de outro).
                                purchaseItemId: "",
                                packs: "",
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
                          <LineArticleControls
                            line={line}
                            ing={ing}
                            articles={articlesByIngredient.get(ing.id) ?? []}
                            onChange={(patch) => setLine(idx, patch)}
                            createArticle={createArticle}
                          />
                        )}
                        {line.fromParse && line.parseNote && (
                          <p className="mt-1 text-xs font-medium text-[hsl(var(--status-pending-fg))]">
                            {line.parseNote}
                          </p>
                        )}
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
                  Validade estimada por categoria: o rótulo prevalece. Ajuste a
                  data se o produto indicar outra.
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

// Controlo por linha: escolher artigo de compra + nº de embalagens (com a
// quantidade na unidade do ingrediente e o custo por unidade base calculados
// antes de gravar), ou entrada directa em quantidade. Também propõe criar um
// artigo a partir do nome lido na fatura.
function LineArticleControls({
  line,
  ing,
  articles,
  onChange,
  createArticle,
}: {
  line: LineDraft;
  ing: Ingredient;
  articles: PurchaseItem[];
  onChange: (patch: Partial<LineDraft>) => void;
  createArticle: ReturnType<typeof useCreatePurchaseItem>;
}) {
  const [showCreate, setShowCreate] = React.useState(false);
  const proposal = proposeArticleFromRawName(line.rawName ?? "");
  const [brand, setBrand] = React.useState(proposal.brand);
  const [label, setLabel] = React.useState(proposal.label);
  const [packQty, setPackQty] = React.useState(
    proposal.packQty != null ? String(proposal.packQty).replace(".", ",") : "",
  );
  const [packUnit, setPackUnit] = React.useState<string>(proposal.packUnit ?? ing.unit);

  const art = articles.find((a) => a.id === line.purchaseItemId);
  const packsNum = Number(line.packs.replace(",", "."));
  const previewQty =
    art && Number.isFinite(packsNum) && packsNum > 0
      ? packEntryQty(packsNum, art.pack_qty, art.pack_unit, ing.unit, ing.unit_weight_g)
      : null;
  const previewCost = art
    ? packEntryBaseCostCents(parsePriceToCents(line.cost), art.pack_qty, art.pack_unit, ing.unit, ing.unit_weight_g)
    : null;

  function submitCreate() {
    const qtyNum = Number(packQty.replace(",", "."));
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Indique o conteúdo da embalagem (> 0).");
      return;
    }
    if (packEntryQty(1, qtyNum, packUnit, ing.unit, ing.unit_weight_g) == null) {
      toast.error("O formato não é convertível para a unidade do ingrediente.");
      return;
    }
    createArticle.mutate(
      {
        ingredient_id: ing.id,
        brand: brand.trim() || null,
        label: label.trim() || null,
        pack_qty: qtyNum,
        pack_unit: packUnit,
      },
      {
        onSuccess: (a) => {
          onChange({ purchaseItemId: a.id, packs: line.packs || "1" });
          setShowCreate(false);
          toast.success("Artigo criado.");
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Não foi possível criar o artigo."),
      },
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
        <Select
          aria-label="Artigo de compra"
          value={line.purchaseItemId}
          onChange={(e) =>
            onChange({ purchaseItemId: e.target.value, packs: e.target.value ? line.packs || "1" : "" })
          }
        >
          <option value="">Entrada directa (quantidade)</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {[a.brand, a.label].filter(Boolean).join(" · ") || "Artigo"} ({a.pack_qty} {a.pack_unit})
            </option>
          ))}
        </Select>
        {!showCreate && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Novo artigo
          </Button>
        )}
      </div>

      {showCreate && (
        <div className="space-y-2 rounded-md border border-input bg-muted/30 p-2">
          <p className="text-xs text-muted-foreground">
            Criar artigo a partir da linha da fatura. Rever marca, formato e conteúdo antes de confirmar.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input aria-label="Marca" placeholder="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <Input
              aria-label="Formato"
              placeholder="Formato (ex.: Garrafão 5 L)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Conteúdo"
              inputMode="decimal"
              className="w-24"
              placeholder="Conteúdo"
              value={packQty}
              onChange={(e) => setPackQty(e.target.value)}
            />
            <Select
              aria-label="Unidade do conteúdo"
              className="w-20"
              value={packUnit}
              onChange={(e) => setPackUnit(e.target.value)}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.label}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" disabled={createArticle.isPending} onClick={submitCreate}>
              Guardar artigo
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {line.purchaseItemId ? (
        <div className="grid gap-2 sm:grid-cols-[110px_160px_1fr] sm:items-center">
          <Input
            aria-label="Nº de embalagens"
            inputMode="decimal"
            placeholder="Embalagens"
            value={line.packs}
            onChange={(e) => onChange({ packs: e.target.value })}
          />
          <Input
            aria-label="Custo por embalagem sem IVA"
            inputMode="decimal"
            placeholder="€/embalagem s/IVA"
            value={line.cost}
            onChange={(e) => onChange({ cost: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            {previewQty != null ? (
              <>
                = {formatQty(previewQty)} {ing.unit}
              </>
            ) : (
              "indique as embalagens"
            )}
            {previewCost != null && (
              <>
                {" "}
                · {formatCostCents(previewCost)}/{ing.unit}
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[110px_160px]">
          <Input
            aria-label="Quantidade"
            inputMode="decimal"
            placeholder={`Qtd (${ing.unit})`}
            value={line.qty}
            onChange={(e) => onChange({ qty: e.target.value })}
          />
          <Input
            aria-label="Custo unitário sem IVA"
            inputMode="decimal"
            placeholder={`€/${ing.unit} s/IVA`}
            value={line.cost}
            onChange={(e) => onChange({ cost: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
