import * as React from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { reservationSchema, type ReservationValues } from "@/lib/schemas";
import { isPastDate, todayServiceDate } from "@/lib/service-date";
import { isoWeekdayOf, type RestaurantTable, type Reservation, type Turn } from "@/lib/types";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useSaveReservation } from "@/hooks/use-reservations";
import { useCustomerByPhone, useDebouncedValue } from "@/hooks/use-customers";

// C4 — Criar / editar reserva. turno OBRIGATÓRIO; mesa OPCIONAL (opção
// explícita "deixar por atribuir"). pax obrigatório; cliente nome+telefone
// obrigatórios, email opcional; hora exacta opcional. Walk-in para hoje
// permitido; datas passadas anteriores a hoje bloqueadas. Aviso não-bloqueante
// quando lugares da mesa < pax. Erro bloqueante se mesa já ocupada no turno.

export interface ReservationFormInitial {
  id?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  partySize?: number;
  date?: string; // service_date
  time?: string;
  turnId?: string;
  tableId?: string | null;
  notes?: string;
}

interface ReservationFormProps {
  tables: RestaurantTable[];
  turns: Turn[];
  /** Reservas existentes nesse contexto, para detetar mesa ocupada no turno. */
  existing: Reservation[];
  initial?: ReservationFormInitial;
  /** Pré-seleciona turno (ex.: criar a partir da vista com turno aberto). */
  presetTurnId?: string;
  presetDate?: string;
  onSaved: () => void;
  onCancel: () => void;
}

const UNASSIGNED = "__unassigned__";

type Errors = Partial<Record<keyof ReservationValues, string>>;

export function ReservationForm({
  tables,
  turns,
  existing,
  initial,
  presetTurnId,
  presetDate,
  onSaved,
  onCancel,
}: ReservationFormProps) {
  const [customerName, setCustomerName] = React.useState(initial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = React.useState(initial?.customerPhone ?? "");
  const [customerEmail, setCustomerEmail] = React.useState(initial?.customerEmail ?? "");
  const [partySize, setPartySize] = React.useState(initial?.partySize ?? 2);
  const [date, setDate] = React.useState(initial?.date ?? presetDate ?? todayServiceDate());
  const [time, setTime] = React.useState(initial?.time ?? "");
  const [turnId, setTurnId] = React.useState(initial?.turnId ?? presetTurnId ?? "");
  // tableId: "" / UNASSIGNED => por atribuir (table_id null).
  const [tableId, setTableId] = React.useState(initial?.tableId ?? UNASSIGNED);
  const [notes, setNotes] = React.useState(initial?.notes ?? "");

  const [errors, setErrors] = React.useState<Errors>({});
  const [globalError, setGlobalError] = React.useState<string>();

  const { data: restaurant } = useActiveRestaurant();

  // C6 — reconhecer cliente recorrente pelo telefone (só na criação; na edição
  // os dados já vêm da reserva). Sugere/preenche nome e email sem os
  // sobrepor se o staff já tiver escrito algo.
  const isEdit = Boolean(initial?.id);
  const debouncedPhone = useDebouncedValue(customerPhone, 400);
  const { data: knownCustomer } = useCustomerByPhone(
    restaurant?.id,
    isEdit ? "" : debouncedPhone,
  );
  const prefilledFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!knownCustomer || isEdit) return;
    if (prefilledFor.current === knownCustomer.id) return;
    prefilledFor.current = knownCustomer.id;
    setCustomerName((prev) => (prev.trim() ? prev : knownCustomer.name));
    setCustomerEmail((prev) => (prev.trim() ? prev : (knownCustomer.email ?? "")));
  }, [knownCustomer, isEdit]);

  const saveCtx = React.useMemo(
    () => (restaurant ? { restaurant, turns } : undefined),
    [restaurant, turns],
  );
  const save = useSaveReservation(saveCtx);
  const submitting = save.isPending;

  const activeTables = React.useMemo(() => tables.filter((t) => t.active), [tables]);
  const activeTurns = React.useMemo(() => turns.filter((t) => t.active), [turns]);

  // Turnos aplicáveis à data escolhida (pela weekday) — derivado dos turnos.
  const applicableTurns = React.useMemo(() => {
    if (!date) return activeTurns;
    const wd = isoWeekdayOf(new Date(`${date}T00:00:00`));
    return activeTurns.filter((t) => t.weekdays.includes(wd));
  }, [activeTurns, date]);

  const selectedTable = activeTables.find((t) => t.id === tableId);

  // Aviso não-bloqueante: lugares da mesa < pax.
  const seatsWarning =
    selectedTable && selectedTable.seats < partySize
      ? `Esta mesa tem ${selectedTable.seats} ${selectedTable.seats === 1 ? "lugar" : "lugares"}, o grupo é de ${partySize}.`
      : undefined;

  // Erro bloqueante: mesa já ocupada nesse (date, turno) por reserva não-cancelada.
  function tableOccupiedError(): string | undefined {
    if (tableId === UNASSIGNED || !tableId) return undefined;
    const clash = existing.some(
      (r) =>
        r.id !== initial?.id &&
        r.table_id === tableId &&
        r.turn_id === turnId &&
        r.service_date === date &&
        r.status !== "cancelada",
    );
    return clash ? "Esta mesa já está ocupada neste turno." : undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(undefined);

    const values = {
      customerName,
      customerPhone,
      customerEmail,
      partySize,
      date,
      time,
      turnId,
      tableId: tableId === UNASSIGNED ? "" : tableId,
      notes,
    };

    const parsed = reservationSchema.safeParse(values);
    const nextErrors: Errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ReservationValues;
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
    }
    // Data passada anterior a hoje bloqueada (walk-in para hoje permitido).
    if (date && isPastDate(date)) {
      nextErrors.date = "Não podes criar reservas em datas passadas.";
    }
    // Mesa ocupada (bloqueante; só se mesa atribuída).
    const occupied = tableOccupiedError();
    if (occupied) nextErrors.tableId = occupied;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    if (!parsed.success) return; // já tratado acima; type-guard para o output validado
    if (!restaurant) {
      setGlobalError("Restaurante ainda a carregar. Tenta novamente num instante.");
      return;
    }

    // WIRING #4 — upsert customer (C6) + insert/update reservation com turn_id
    // obrigatório, table_id null se por atribuir, service_date e reserved_at
    // EXPLÍCITOS (contrato FROZEN, fuso do restaurante), status 'confirmada'.
    // Email C7 disparado best-effort no onSuccess do hook (não bloqueia).
    save.mutate(
      { values: parsed.data, id: initial?.id },
      {
        onSuccess: () => onSaved(),
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "";
          // Violação do índice único de atribuição (mesa já ocupada no slot).
          if (/duplicate key|23505/i.test(msg)) {
            setErrors((prev) => ({ ...prev, tableId: "Esta mesa já está ocupada neste turno." }));
          } else {
            setGlobalError(msg || "Não foi possível guardar a reserva. Tenta novamente.");
          }
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="r-name" label="Nome do cliente" error={errors.customerName} required>
          {(p) => <Input {...p} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />}
        </Field>
        <Field id="r-phone" label="Telefone" error={errors.customerPhone} required>
          {(p) => <Input {...p} type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />}
        </Field>
      </div>

      {knownCustomer && !isEdit && (
        <div role="status" className="rounded-md border border-input bg-muted/50 p-3 text-sm">
          <p className="font-medium">Cliente recorrente: {knownCustomer.name}</p>
          {knownCustomer.notes && (
            <p className="mt-1 text-xs text-muted-foreground">Notas: {knownCustomer.notes}</p>
          )}
        </div>
      )}

      <Field id="r-email" label="Email (opcional)" error={errors.customerEmail} hint="Necessário para enviar a confirmação.">
        {(p) => <Input {...p} type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="r-pax" label="Pessoas" error={errors.partySize} required>
          {(p) => (
            <Input {...p} type="number" min={1} value={partySize} onChange={(e) => setPartySize(Number(e.target.value))} />
          )}
        </Field>
        <Field id="r-date" label="Data" error={errors.date} required>
          {(p) => (
            <Input
              {...p}
              type="date"
              min={todayServiceDate()}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTurnId(""); // turnos dependem do dia — força reselecção
              }}
            />
          )}
        </Field>
        <Field id="r-time" label="Hora (opcional)" error={errors.time} hint="Só exibição.">
          {(p) => <Input {...p} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
        </Field>
      </div>

      <Field id="r-turn" label="Turno" error={errors.turnId} required>
        {(p) => (
          <Select {...p} value={turnId} onChange={(e) => setTurnId(e.target.value)}>
            <option value="">Escolhe um turno</option>
            {applicableTurns.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.start_time}
                {t.service ? ` (${t.service})` : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {date && applicableTurns.length === 0 && (
        <p className="text-xs text-muted-foreground">Não há turnos configurados para este dia.</p>
      )}

      <Field id="r-table" label="Mesa (opcional)" error={errors.tableId} hint="Podes deixar por atribuir e escolher mais tarde.">
        {(p) => (
          <Select {...p} value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value={UNASSIGNED}>Deixar por atribuir</option>
            {activeTables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {t.seats} lug.
              </option>
            ))}
          </Select>
        )}
      </Field>

      {seatsWarning && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-[hsl(var(--status-pending-fg))]/30 bg-[hsl(var(--status-pending-bg))] p-3 text-sm text-[hsl(var(--status-pending-fg))]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{seatsWarning} Podes confirmar à mesma.</span>
        </div>
      )}

      <Field id="r-notes" label="Notas (opcional)" error={errors.notes} hint="Alergias, ocasião, pedido especial.">
        {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>

      {globalError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {globalError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "A guardar..." : "Guardar reserva"}
        </Button>
      </div>
    </form>
  );
}
