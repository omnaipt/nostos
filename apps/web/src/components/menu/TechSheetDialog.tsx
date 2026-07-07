import * as React from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateIngredient, useIngredients } from "@/hooks/use-ingredients";
import {
  useDeleteTechSheet,
  useGenerateTechSheet,
  useSaveTechSheet,
  useTechSheetLines,
  useTechSheets,
} from "@/hooks/use-tech-sheets";
import { useUpdateItem } from "@/hooks/use-menu";
import { formatCostCents } from "@/components/menu/PantryManager";
import {
  ALLERGEN_LABEL,
  computeFoodCost,
  computeLineCostCents,
  computeMarginPct,
  formatPriceCents,
  UNIT_OPTIONS,
  type MenuItem,
} from "@/lib/types";

// Editor da Ficha Técnica de um prato: ingredientes com quantidades (ligados à
// despensa para custo), passos, notas, estado. O botão IA pede o primeiro
// rascunho à edge function generate-tech-sheet; o chef corrige e grava.

interface LocalLine {
  key: string;
  ingredientId: string | null;
  name: string;
  qty: string; // input controlado; parse no save/custo
  unit: string;
  // Custo de compra estimado pela IA (para criar o ingrediente na despensa
  // com um clique). Só existe em linhas vindas de um rascunho gerado.
  estCost?: { unit: string; cents: number } | null;
}

function parseQty(input: string): number | null {
  const n = Number(input.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
}

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `line-${keySeq}`;
}

export function TechSheetDialog({
  restaurantId,
  item,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  item: MenuItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sheetsQuery = useTechSheets(restaurantId);
  const linesQuery = useTechSheetLines(restaurantId);
  const ingredientsQuery = useIngredients(restaurantId);
  const save = useSaveTechSheet(restaurantId);
  const removeSheet = useDeleteTechSheet(restaurantId);
  const generate = useGenerateTechSheet();
  const updateItem = useUpdateItem(restaurantId);
  const createIngredient = useCreateIngredient(restaurantId);

  const sheet = React.useMemo(
    () => (sheetsQuery.data ?? []).find((s) => s.menu_item_id === item.id) ?? null,
    [sheetsQuery.data, item.id],
  );
  const ingredients = React.useMemo(() => ingredientsQuery.data ?? [], [ingredientsQuery.data]);
  const ingredientsById = React.useMemo(
    () => new Map(ingredients.map((i) => [i.id, i])),
    [ingredients],
  );
  const ingredientsByName = React.useMemo(
    () => new Map(ingredients.map((i) => [i.name.trim().toLowerCase(), i])),
    [ingredients],
  );

  const [servings, setServings] = React.useState(1);
  const [lines, setLines] = React.useState<LocalLine[]>([]);
  const [stepsText, setStepsText] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [status, setStatus] = React.useState<"rascunho" | "validada">("rascunho");
  const [aiGenerated, setAiGenerated] = React.useState(false);
  const [suggestedAllergens, setSuggestedAllergens] = React.useState<string[]>([]);

  // Carrega o estado servido quando o diálogo abre (ou a ficha muda).
  React.useEffect(() => {
    if (!open) return;
    if (sheet) {
      const sheetLines = (linesQuery.data ?? []).filter((l) => l.tech_sheet_id === sheet.id);
      setServings(sheet.servings);
      setLines(
        sheetLines.map((l) => ({
          key: nextKey(),
          ingredientId: l.ingredient_id,
          name: l.name,
          qty: String(l.qty).replace(".", ","),
          unit: l.unit,
        })),
      );
      setStepsText(sheet.steps.join("\n"));
      setNotes(sheet.notes ?? "");
      setStatus(sheet.status === "validada" ? "validada" : "rascunho");
      setAiGenerated(sheet.ai_generated);
    } else {
      setServings(1);
      setLines([]);
      setStepsText("");
      setNotes("");
      setStatus("rascunho");
      setAiGenerated(false);
    }
    setSuggestedAllergens([]);
    // linesQuery.data entra de propósito: quando as linhas chegam depois de abrir.
  }, [open, sheet, linesQuery.data]);

  function onGenerate() {
    generate.mutate(
      {
        restaurantId,
        dishName: item.name,
        description: item.description,
        servings,
        pantry: ingredients.filter((i) => i.active).map((i) => i.name),
      },
      {
        onSuccess: (result) => {
          if (!result.generated || !result.sheet) {
            const reason = result.reason ?? "erro desconhecido";
            toast.error(
              reason === "ANTHROPIC_API_KEY não configurada"
                ? "A geração por IA ainda não está activa neste ambiente."
                : reason.startsWith("limite diário")
                  ? "Limite diário de gerações atingido. Volta amanhã ou edita a ficha à mão."
                  : `Não foi possível gerar o rascunho (${reason}).`,
            );
            return;
          }
          const draft = result.sheet;
          setLines(
            draft.ingredients.map((ing) => {
              const match = ingredientsByName.get(ing.name.trim().toLowerCase());
              return {
                key: nextKey(),
                ingredientId: match ? match.id : null,
                name: ing.name,
                qty: String(ing.qty).replace(".", ","),
                unit: ing.unit,
                estCost: ing.est_cost,
              };
            }),
          );
          setStepsText(draft.steps.join("\n"));
          if (draft.notes) setNotes(draft.notes);
          setSuggestedAllergens(draft.allergens);
          setAiGenerated(true);
          setStatus("rascunho");
          toast.success(
            result.remaining != null
              ? `Rascunho gerado (${result.remaining} gerações restantes hoje). Revê antes de validar.`
              : "Rascunho gerado. Revê as quantidades antes de validar.",
          );
        },
        onError: () => toast.error("Falha ao contactar a geração por IA."),
      },
    );
  }

  // Cria o ingrediente na despensa com o custo estimado pela IA e liga a linha.
  function addLineToPantry(line: LocalLine) {
    if (!line.estCost) return;
    createIngredient.mutate(
      {
        name: line.name.trim(),
        unit: line.estCost.unit,
        costPerUnitCents: line.estCost.cents,
      },
      {
        onSuccess: (created) => {
          setLines((ls) =>
            ls.map((l) => (l.key === line.key ? { ...l, ingredientId: created.id } : l)),
          );
          toast.success(`"${created.name}" criado na despensa com custo estimado. Confirma o preço real.`);
        },
        onError: (e) => {
          // Nome duplicado: tenta ligar ao existente em vez de falhar.
          const existing = ingredientsByName.get(line.name.trim().toLowerCase());
          if (existing) {
            setLines((ls) =>
              ls.map((l) => (l.key === line.key ? { ...l, ingredientId: existing.id } : l)),
            );
            toast.success(`Ligado ao ingrediente existente "${existing.name}".`);
          } else {
            toast.error(e instanceof Error ? e.message : "Não foi possível criar o ingrediente.");
          }
        },
      },
    );
  }

  function applySuggestedAllergens() {
    const merged = [...new Set([...(item.allergens ?? []), ...suggestedAllergens])];
    updateItem.mutate(
      { id: item.id, patch: { allergens: merged } },
      {
        onSuccess: () => {
          toast.success("Alergénios aplicados ao prato");
          setSuggestedAllergens([]);
        },
        onError: () => toast.error("Não foi possível actualizar os alergénios."),
      },
    );
  }

  function onSave() {
    const parsed = lines
      .map((l) => ({ ...l, qtyNum: parseQty(l.qty) }))
      .filter((l) => l.name.trim().length >= 2 && l.qtyNum !== null);
    if (parsed.length === 0) {
      toast.error("A ficha precisa de pelo menos um ingrediente com quantidade.");
      return;
    }
    save.mutate(
      {
        menuItemId: item.id,
        servings,
        steps: stepsText
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        notes: notes.trim() || null,
        status,
        aiGenerated,
        lines: parsed.map((l) => ({
          ingredientId: l.ingredientId,
          name: l.name.trim(),
          qty: l.qtyNum as number,
          unit: l.unit,
        })),
      },
      {
        onSuccess: () => {
          toast.success("Ficha técnica guardada");
          onOpenChange(false);
        },
        onError: () => toast.error("Não foi possível guardar a ficha."),
      },
    );
  }

  // Custo em tempo real sobre o estado local.
  const costSummary = React.useMemo(() => {
    const asLines = lines.map((l) => ({
      qty: parseQty(l.qty) ?? 0,
      unit: l.unit,
      ingredient_id: l.ingredientId,
    }));
    return computeFoodCost(
      asLines,
      new Map(
        ingredients.map((i) => [i.id, { unit: i.unit, cost_per_unit_cents: i.cost_per_unit_cents }]),
      ),
    );
  }, [lines, ingredients]);
  const margin = computeMarginPct(item.price_cents, costSummary.costCents);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Ficha técnica · ${item.name}`}
      description="Ingredientes, passos e custo por dose. A IA escreve o rascunho; tu validas."
      className="sm:max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={generate.isPending}
            onClick={onGenerate}
          >
            <Sparkles className="h-4 w-4" />
            {generate.isPending
              ? "A gerar..."
              : lines.length > 0
                ? "Regenerar rascunho com IA"
                : "Gerar rascunho com IA"}
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            Doses
            <Input
              aria-label="Doses"
              inputMode="numeric"
              className="h-8 w-16 text-center"
              value={servings}
              onChange={(e) => {
                const n = Math.trunc(Number(e.target.value));
                setServings(Number.isFinite(n) && n >= 1 && n <= 100 ? n : 1);
              }}
            />
          </label>
        </div>

        {suggestedAllergens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-muted/30 p-2 text-xs">
            <span className="text-muted-foreground">Alergénios sugeridos pela IA:</span>
            {suggestedAllergens.map((a) => (
              <span key={a} className="rounded-full border border-input px-2 py-0.5">
                {ALLERGEN_LABEL[a] ?? a}
              </span>
            ))}
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={applySuggestedAllergens}>
              Aplicar ao prato
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Ingredientes</p>
          {lines.length === 0 && (
            <p className="rounded-md border border-dashed border-input p-3 text-sm text-muted-foreground">
              Sem ingredientes. Gera o rascunho com IA ou adiciona linhas à mão.
            </p>
          )}
          {lines.map((line) => {
            const linked = line.ingredientId ? ingredientsById.get(line.ingredientId) : undefined;
            const qtyNum = parseQty(line.qty);
            const lineCost =
              linked && qtyNum
                ? computeLineCostCents(qtyNum, line.unit, linked.unit, linked.cost_per_unit_cents)
                : null;
            return (
              <div key={line.key} className="flex flex-wrap items-center gap-1.5">
                <Input
                  aria-label="Nome do ingrediente"
                  className="h-8 min-w-32 flex-1 text-sm"
                  value={line.name}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l) => (l.key === line.key ? { ...l, name: e.target.value } : l)),
                    )
                  }
                />
                <Input
                  aria-label="Quantidade"
                  inputMode="decimal"
                  className="h-8 w-20 text-right text-sm"
                  value={line.qty}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l) => (l.key === line.key ? { ...l, qty: e.target.value } : l)),
                    )
                  }
                />
                <Select
                  aria-label="Unidade"
                  className="h-8 w-16 py-0 text-sm"
                  value={line.unit}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l) => (l.key === line.key ? { ...l, unit: e.target.value } : l)),
                    )
                  }
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.label}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Ligar à despensa"
                  className="h-8 w-36 py-0 text-sm"
                  value={line.ingredientId ?? ""}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l) =>
                        l.key === line.key ? { ...l, ingredientId: e.target.value || null } : l,
                      ),
                    )
                  }
                >
                  <option value="">sem custo</option>
                  {ingredients
                    .filter((i) => i.active)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </Select>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {lineCost != null ? formatCostCents(lineCost) : "—"}
                </span>
                {!line.ingredientId && line.estCost && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={createIngredient.isPending}
                    title={`Criar na despensa a ${formatCostCents(line.estCost.cents)} / ${line.estCost.unit} (custo estimado pela IA — confirmar depois)`}
                    onClick={() => addLineToPantry(line)}
                  >
                    + Despensa
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label="Remover linha"
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLines((ls) => [
                ...ls,
                { key: nextKey(), ingredientId: null, name: "", qty: "", unit: "g" },
              ])
            }
          >
            <Plus className="h-4 w-4" /> Linha
          </Button>
        </div>

        <div className="rounded-md border border-input bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Food cost ({costSummary.costed}/{costSummary.total} linhas com custo):{" "}
              <strong className="tabular-nums">{formatCostCents(costSummary.costCents)}</strong>
            </span>
            <span>
              PVP: <strong className="tabular-nums">{formatPriceCents(item.price_cents)}</strong>
            </span>
            <span>
              Margem:{" "}
              <strong className="tabular-nums">
                {margin != null ? `${margin.toFixed(0)}%` : "—"}
              </strong>
            </span>
          </div>
          {costSummary.costed < costSummary.total && (
            <p className="mt-1 text-xs text-muted-foreground">
              Liga as linhas “sem custo” a ingredientes da despensa para o food cost ficar completo.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Preparação (um passo por linha)</p>
          <Textarea
            aria-label="Passos de preparação"
            rows={5}
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={"Demolhar o bacalhau 24h\nAssar a 200ºC durante 20 min"}
          />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Notas</p>
          <Textarea
            aria-label="Notas"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Empratamento, consistência, substituições..."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={status === "validada"}
              onChange={(e) => setStatus(e.target.checked ? "validada" : "rascunho")}
            />
            Validada pelo chef
          </label>
          <div className="flex items-center gap-2">
            {sheet && (
              <a
                href={`/fichas/${item.id}/imprimir`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Ficha de cozinha
              </a>
            )}
            {sheet && (
              <Button
                size="sm"
                variant="ghost"
                disabled={removeSheet.isPending}
                onClick={() => {
                  if (!window.confirm("Apagar a ficha técnica deste prato?")) return;
                  removeSheet.mutate(sheet.id, {
                    onSuccess: () => {
                      toast.success("Ficha apagada");
                      onOpenChange(false);
                    },
                    onError: () => toast.error("Não foi possível apagar."),
                  });
                }}
              >
                Apagar ficha
              </Button>
            )}
            <Button size="sm" disabled={save.isPending} onClick={onSave}>
              Guardar ficha
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
