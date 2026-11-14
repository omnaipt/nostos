import * as React from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { turnSchema, type TurnValues } from "@/lib/schemas";
import { WEEKDAYS, type IsoWeekday } from "@/lib/types";

// C2 — Gestão de turnos. label + hora início + ≥1 dia obrigatórios.
// Serviço é texto livre OPCIONAL (não dropdown fechado) — vazio não bloqueia.
// TODO(marco): wire Supabase — persistir create/update/toggle-active de turns.

export interface TurnRow extends TurnValues {
  id: string;
}

interface TurnManagerProps {
  turns: TurnRow[];
  onChange: (next: TurnRow[]) => void;
  busy?: boolean;
}

const emptyDraft = (): TurnValues => ({
  label: "",
  startTime: "",
  service: "",
  weekdays: [],
  active: true,
});

function weekdaysSummary(days: number[]): string {
  return WEEKDAYS.filter((w) => days.includes(w.key)).map((w) => w.short).join(", ");
}

export function TurnManager({ turns, onChange, busy }: TurnManagerProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<TurnValues | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function startAdd() {
    setEditingId("__new__");
    setDraft(emptyDraft());
    setErrors({});
  }

  function startEdit(row: TurnRow) {
    setEditingId(row.id);
    setDraft({ label: row.label, startTime: row.startTime, service: row.service ?? "", weekdays: row.weekdays, active: row.active });
    setErrors({});
  }

  function cancel() {
    setEditingId(null);
    setDraft(null);
    setErrors({});
  }

  function toggleDay(day: IsoWeekday) {
    if (!draft) return;
    const has = draft.weekdays.includes(day);
    setDraft({
      ...draft,
      weekdays: has ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day].sort((a, b) => a - b),
    });
  }

  function commit() {
    if (!draft) return;
    const parsed = turnSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    const clash = turns.some(
      (t) => t.id !== editingId && t.label.trim().toLowerCase() === parsed.data.label.trim().toLowerCase(),
    );
    if (clash) {
      setErrors({ label: "Já existe um turno com este nome" });
      return;
    }
    if (editingId === "__new__") {
      onChange([...turns, { id: `local-${Date.now()}`, ...parsed.data }]);
    } else {
      onChange(turns.map((t) => (t.id === editingId ? { ...t, ...parsed.data } : t)));
    }
    cancel();
  }

  function remove(id: string) {
    onChange(turns.filter((t) => t.id !== id));
  }

  function toggleActive(id: string) {
    onChange(turns.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  }

  const editor = draft && (
    <div className="space-y-3 rounded-md border border-input bg-muted/40 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field id="s-label" label="Nome do turno" error={errors.label} required>
          {(p) => (
            <Input
              {...p}
              autoFocus
              placeholder="1º almoço, Jantar..."
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          )}
        </Field>
        <Field id="s-start" label="Hora de início" error={errors.startTime} required>
          {(p) => (
            <Input
              {...p}
              type="time"
              value={draft.startTime}
              onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
            />
          )}
        </Field>
      </div>
      <Field id="s-service" label="Serviço (opcional)" error={errors.service} hint="Texto livre: almoço, jantar, brunch, lanche... Pode ficar vazio.">
        {(p) => (
          <Input
            {...p}
            placeholder="ex.: brunch"
            value={draft.service ?? ""}
            onChange={(e) => setDraft({ ...draft, service: e.target.value })}
          />
        )}
      </Field>
      <div className="space-y-1.5">
        <p className="text-sm font-medium leading-none">
          Dias da semana <span className="text-destructive">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((w) => {
            const on = draft.weekdays.includes(w.key);
            return (
              <button
                key={w.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDay(w.key)}
                className={cn(
                  "h-11 min-w-11 rounded-md border px-3 text-sm font-medium transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-muted",
                )}
              >
                {w.short}
              </button>
            );
          })}
        </div>
        {errors.weekdays && <p className="text-xs font-medium text-destructive">{errors.weekdays}</p>}
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
        {turns.map((t) =>
          editingId === t.id ? (
            <li key={t.id}>{editor}</li>
          ) : (
            <li key={t.id} className="flex items-center gap-3 rounded-md border border-input bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {t.label}
                  <span className="text-muted-foreground">{t.startTime}</span>
                  {t.service && <Badge variant="neutral">{t.service}</Badge>}
                  {!t.active && <Badge variant="cancelada">Inativo</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">{weekdaysSummary(t.weekdays) || "Sem dias"}</p>
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
          <Plus className="h-4 w-4" /> Adicionar turno
        </Button>
      )}
    </div>
  );
}
