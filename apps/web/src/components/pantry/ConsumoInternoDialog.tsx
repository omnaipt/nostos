import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useIngredients } from "@/hooks/use-ingredients";
import { useMenuItems } from "@/hooks/use-menu";
import { useTechSheetLines, useTechSheets } from "@/hooks/use-tech-sheets";
import {
  useCreateInternalUse,
  useRegisterDishConsumption,
} from "@/hooks/use-consumo";
import {
  CONSUMPTION_REASONS,
  NAO_ABATIDA_MOTIVO_LABEL,
  previewDishConsumption,
  type PreviewIngredient,
} from "@/lib/consumo";
import { formatQty } from "@/lib/stock";

// Registo de consumo interno (refeição do pessoal, oferta, prova) e quebra de
// prato inteiro. Dois modos: por prato (expande a ficha pela RPC) e por
// ingrediente solto. Por prato, mostra antes de gravar o que vai sair e o que
// não vai ser abatido. Acesso gated a owner/gestor/cozinha (RoleGate + guarda
// de perfil no servidor).

type Mode = "prato" | "ingrediente";

export function ConsumoInternoDialog({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>("prato");

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Registar consumo interno"
      description="Refeição do pessoal, oferta da casa, prova ou prato estragado — sai do stock pelo que a ficha gasta."
      className="sm:max-w-xl"
    >
      <div className="mb-4 inline-flex rounded-md border border-input p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("prato")}
          className={
            "rounded px-3 py-1 " +
            (mode === "prato" ? "bg-atlantico-900 text-white" : "text-muted-foreground")
          }
        >
          Por prato
        </button>
        <button
          type="button"
          onClick={() => setMode("ingrediente")}
          className={
            "rounded px-3 py-1 " +
            (mode === "ingrediente" ? "bg-atlantico-900 text-white" : "text-muted-foreground")
          }
        >
          Por ingrediente
        </button>
      </div>

      {mode === "prato" ? (
        <DishForm restaurantId={restaurantId} onDone={onClose} />
      ) : (
        <IngredientForm restaurantId={restaurantId} onDone={onClose} />
      )}
    </Dialog>
  );
}

function DishForm({ restaurantId, onDone }: { restaurantId: string; onDone: () => void }) {
  const itemsQuery = useMenuItems(restaurantId);
  const sheetsQuery = useTechSheets(restaurantId);
  const linesQuery = useTechSheetLines(restaurantId);
  const ingredientsQuery = useIngredients(restaurantId);
  const register = useRegisterDishConsumption(restaurantId);

  const [menuItemId, setMenuItemId] = React.useState("");
  const [portions, setPortions] = React.useState("1");
  const [kind, setKind] = React.useState<"internal_use" | "waste">("internal_use");
  const [reason, setReason] = React.useState<string>("pessoal");
  const [note, setNote] = React.useState("");

  // Só pratos COM ficha técnica podem ser abatidos por prato.
  const itemsWithSheet = React.useMemo(() => {
    const withSheet = new Set((sheetsQuery.data ?? []).map((s) => s.menu_item_id));
    return (itemsQuery.data ?? []).filter((i) => withSheet.has(i.id));
  }, [itemsQuery.data, sheetsQuery.data]);

  const sheet = React.useMemo(
    () => (sheetsQuery.data ?? []).find((s) => s.menu_item_id === menuItemId) ?? null,
    [sheetsQuery.data, menuItemId],
  );
  const lines = React.useMemo(
    () => (linesQuery.data ?? []).filter((l) => l.tech_sheet_id === sheet?.id),
    [linesQuery.data, sheet],
  );
  const ingredientsById = React.useMemo(
    () =>
      new Map<string, PreviewIngredient>(
        (ingredientsQuery.data ?? []).map((i) => [
          i.id,
          {
            id: i.id,
            name: i.name,
            unit: i.unit,
            unit_weight_g: i.unit_weight_g,
            depletion_mode: i.depletion_mode,
          },
        ]),
      ),
    [ingredientsQuery.data],
  );

  const portionsNum = Number(portions.replace(",", "."));
  const preview =
    sheet && Number.isFinite(portionsNum) && portionsNum > 0
      ? previewDishConsumption(
          { servings: sheet.servings, status: sheet.status },
          lines.map((l) => ({
            ingredient_id: l.ingredient_id,
            name: l.name,
            qty: l.qty,
            unit: l.unit,
          })),
          ingredientsById,
          portionsNum,
        )
      : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!menuItemId) {
      toast.error("Escolha um prato.");
      return;
    }
    if (!Number.isFinite(portionsNum) || portionsNum <= 0) {
      toast.error("Indique quantas doses, maior que zero.");
      return;
    }
    register.mutate(
      {
        menuItemId,
        portions: portionsNum,
        kind,
        reason: kind === "internal_use" ? reason : null,
        note: note.trim() || null,
      },
      {
        onSuccess: (res) => {
          toast.success(
            res.movimentos > 0
              ? `Registado: ${res.movimentos} ingrediente(s) abatido(s)${res.estimated ? " (estimado)" : ""}.`
              : "Nada foi abatido (ver linhas não abatidas).",
          );
          onDone();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível registar."),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="ci-prato">Prato (com ficha técnica)</Label>
        <Select id="ci-prato" value={menuItemId} onChange={(e) => setMenuItemId(e.target.value)}>
          <option value="">Escolher prato…</option>
          {itemsWithSheet.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        {itemsWithSheet.length === 0 && !itemsQuery.isLoading && (
          <p className="text-xs text-muted-foreground">
            Nenhum prato tem ficha técnica ainda. Crie a ficha na Ementa.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ci-doses">Doses</Label>
          <Input
            id="ci-doses"
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            inputMode="decimal"
            placeholder="ex.: 4"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ci-tipo">Motivo do movimento</Label>
          <Select
            id="ci-tipo"
            value={kind}
            onChange={(e) => setKind(e.target.value as "internal_use" | "waste")}
          >
            <option value="internal_use">Consumo interno</option>
            <option value="waste">Quebra (prato estragado)</option>
          </Select>
        </div>
      </div>

      {kind === "internal_use" && (
        <div className="space-y-1">
          <Label htmlFor="ci-reason">Motivo do consumo</Label>
          <Select id="ci-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {CONSUMPTION_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="ci-note">Nota (opcional)</Label>
        <Input
          id="ci-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex.: almoço da equipa"
        />
      </div>

      {preview && (
        <div className="space-y-2 rounded-md border border-input bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            O que vai sair
            {preview.estimated && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                estimado (ficha por validar)
              </span>
            )}
          </p>
          {preview.abatidas.length === 0 ? (
            <p className="text-muted-foreground">Nenhum ingrediente será abatido.</p>
          ) : (
            <ul className="space-y-0.5">
              {preview.abatidas.map((a) => (
                <li key={a.ingredientId} className="flex justify-between tabular-nums">
                  <span>{a.name}</span>
                  <span className="text-destructive">
                    −{formatQty(a.qty)} {a.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {preview.naoAbatidas.length > 0 && (
            <div className="border-t border-input pt-2">
              <p className="text-xs font-medium text-muted-foreground">Não abatido</p>
              <ul className="text-xs text-muted-foreground">
                {preview.naoAbatidas.map((n, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{n.name}</span>
                    <span>{NAO_ABATIDA_MOTIVO_LABEL[n.motivo] ?? n.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={register.isPending}>
          {register.isPending ? "A registar…" : "Registar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function IngredientForm({ restaurantId, onDone }: { restaurantId: string; onDone: () => void }) {
  const ingredientsQuery = useIngredients(restaurantId);
  const create = useCreateInternalUse(restaurantId);

  const [ingredientId, setIngredientId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("pessoal");
  const [note, setNote] = React.useState("");

  // Ingredientes em modo contagem não abatem por consumo interno (guarda do
  // servidor); ficam fora do selector para não oferecer uma acção que falha.
  const selectable = React.useMemo(
    () => (ingredientsQuery.data ?? []).filter((i) => i.depletion_mode !== "contagem"),
    [ingredientsQuery.data],
  );
  const ingredient = selectable.find((i) => i.id === ingredientId) ?? null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ingredient) {
      toast.error("Escolha um ingrediente.");
      return;
    }
    const n = Number(qty.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Indique uma quantidade maior que zero.");
      return;
    }
    create.mutate(
      {
        ingredientId: ingredient.id,
        unit: ingredient.unit,
        qty: n,
        reason,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Consumo interno registado.");
          onDone();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Não foi possível registar."),
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="ci-ing">Ingrediente</Label>
        <Select id="ci-ing" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
          <option value="">Escolher ingrediente…</option>
          {selectable.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ci-ing-qty">Quantidade {ingredient ? `(${ingredient.unit})` : ""}</Label>
          <Input
            id="ci-ing-qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            placeholder="ex.: 200"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ci-ing-reason">Motivo</Label>
          <Select id="ci-ing-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {CONSUMPTION_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ci-ing-note">Nota (opcional)</Label>
        <Input
          id="ci-ing-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex.: prova de tempero"
        />
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
