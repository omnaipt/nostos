import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import type { Reservation, RestaurantTable } from "@/lib/types";

// C5 — acção "atribuir mesa" a uma reserva POR ATRIBUIR, a partir da vista.
// Só mostra mesas livres nesse (date, turno). TODO(marco): wire Supabase —
// update reservation.table_id (sujeito ao índice de unicidade do schema).

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  /** Mesas livres no turno desta reserva. */
  freeTables: RestaurantTable[];
  onAssign: (reservationId: string, tableId: string) => void;
}

export function AssignTableDialog({ open, onOpenChange, reservation, freeTables, onAssign }: Props) {
  const [tableId, setTableId] = React.useState("");
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setTableId("");
      setError(undefined);
    }
  }, [open, reservation?.id]);

  if (!reservation) return null;

  function submit() {
    if (!tableId) {
      setError("Escolha uma mesa.");
      return;
    }
    onAssign(reservation!.id, tableId);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Atribuir mesa"
      description={`${reservation.customer_name} · ${reservation.party_size} pax`}
    >
      <div className="space-y-4">
        {freeTables.length === 0 ? (
          <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            Não há mesas livres neste turno.
          </p>
        ) : (
          <Field id="assign-table" label="Mesa livre" error={error} required>
            {(p) => (
              <Select {...p} value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">Escolher mesa</option>
                {freeTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} · {t.seats} lug.
                    {t.seats < reservation.party_size ? " (lugares insuficientes)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={freeTables.length === 0}>
            Atribuir
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
