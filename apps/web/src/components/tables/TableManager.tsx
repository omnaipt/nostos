import * as React from "react";
import { Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { tableSchema, type TableValues } from "@/lib/schemas";

// C1 — Gestão de mesas. Editor de lista reutilizável (onboarding + definições).
// Trabalha com valores locais (controlado pelo pai). Validação zod por linha.
// TODO(marco): wire Supabase — persistir create/update/toggle-active de tables.

export interface TableRow extends TableValues {
  id: string; // id local (ou table.id real no wiring)
}

interface TableManagerProps {
  tables: TableRow[];
  onChange: (next: TableRow[]) => void;
  /** Bloqueia interacção durante save (loading state do pai). */
  busy?: boolean;
}

const emptyDraft = (sortOrder: number): TableValues => ({
  label: "",
  seats: 2,
  sortOrder,
  active: true,
});

export function TableManager({ tables, onChange, busy }: TableManagerProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<TableValues | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function startAdd() {
    setEditingId("__new__");
    setDraft(emptyDraft(tables.length + 1));
    setErrors({});
  }

  function startEdit(row: TableRow) {
    setEditingId(row.id);
    setDraft({ label: row.label, seats: row.seats, sortOrder: row.sortOrder, active: row.active });
    setErrors({});
  }

  function cancel() {
    setEditingId(null);
    setDraft(null);
    setErrors({});
  }

  function commit() {
    if (!draft) return;
    const parsed = tableSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    // Etiqueta única (case-insensitive) por restaurante (espelha índice do schema).
    const clash = tables.some(
      (t) => t.id !== editingId && t.label.trim().toLowerCase() === parsed.data.label.trim().toLowerCase(),
    );
    if (clash) {
      setErrors({ label: "Já existe uma mesa com esta etiqueta" });
      return;
    }
    if (editingId === "__new__") {
      onChange([...tables, { id: `local-${Date.now()}`, ...parsed.data }]);
    } else {
      onChange(tables.map((t) => (t.id === editingId ? { ...t, ...parsed.data } : t)));
    }
    cancel();
  }

  function remove(id: string) {
    onChange(tables.filter((t) => t.id !== id));
  }

  function toggleActive(id: string) {
    onChange(tables.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  }

  const editor = draft && (
    <div className="space-y-3 rounded-md border border-input bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field id="t-label" label="Etiqueta" error={errors.label} required>
          {(p) => (
            <Input
              {...p}
              autoFocus
              placeholder="Mesa 1, Esplanada 3..."
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          )}
        </Field>
        <Field id="t-seats" label="Lugares" error={errors.seats} required>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={draft.seats}
              onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
            />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={busy}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
        <Button type="button" size="sm" onClick={commit} disabled={busy}>
          <Check className="h-4 w-4" /> Guardar
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {tables.map((t) =>
          editingId === t.id ? (
            <li key={t.id}>{editor}</li>
          ) : (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-md border border-input bg-card p-3"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {t.label}{" "}
                  {!t.active && <Badge variant="neutral">Inativa</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.seats} {t.seats === 1 ? "lugar" : "lugares"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(t.id)}
                disabled={busy}
                className="h-11 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                {t.active ? "Desativar" : "Ativar"}
              </button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${t.label}`} onClick={() => startEdit(t)} disabled={busy}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${t.label}`} onClick={() => remove(t.id)} disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ),
        )}
      </ul>

      {editingId === "__new__" ? (
        editor
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={startAdd} disabled={busy || editingId !== null}>
          <Plus className="h-4 w-4" /> Adicionar mesa
        </Button>
      )}
    </div>
  );
}
