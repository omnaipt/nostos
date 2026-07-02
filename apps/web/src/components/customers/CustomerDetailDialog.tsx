import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/reservations/StatusBadge";
import {
  useCustomerReservations,
  useUpdateCustomerNotes,
} from "@/hooks/use-customers";
import type { Customer } from "@/lib/types";

// C6 — Ficha de cliente: contacto, notas persistentes (distintas das notas de
// reserva) e histórico de reservas (incl. mesa/turno e no-shows), desc por data.

function formatHistoryDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerDetailDialog({ customer, open, onOpenChange }: Props) {
  const [notes, setNotes] = React.useState("");
  React.useEffect(() => {
    setNotes(customer?.notes ?? "");
  }, [customer?.id, customer?.notes]);

  const historyQuery = useCustomerReservations(open ? customer?.id : undefined);
  const updateNotes = useUpdateCustomerNotes();

  const history = historyQuery.data ?? [];
  const notesDirty = (customer?.notes ?? "") !== (notes.trim() ? notes : "");

  function saveNotes() {
    if (!customer) return;
    updateNotes.mutate(
      { id: customer.id, notes },
      {
        onSuccess: () => toast.success("Notas guardadas"),
        onError: () => toast.error("Não foi possível guardar as notas."),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer?.name ?? "Cliente"}
      description="Ficha de cliente: contacto, notas e histórico de reservas."
    >
      {customer && (
        <div className="space-y-5">
          <div className="grid gap-1 text-sm">
            <p>
              <span className="text-muted-foreground">Telefone: </span>
              {customer.phone ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Email: </span>
              {customer.email ?? "—"}
            </p>
          </div>

          <div className="space-y-2">
            <Field
              id="c-notes"
              label="Notas do cliente"
              hint="Persistentes entre reservas (ex.: alergia, mesa preferida)."
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={saveNotes}
                disabled={updateNotes.isPending || !notesDirty}
              >
                {updateNotes.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {updateNotes.isPending ? "A guardar..." : "Guardar notas"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Histórico de reservas</h3>

            {historyQuery.isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {historyQuery.isError && (
              <div className="flex flex-col items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="text-destructive">Não foi possível carregar o histórico.</p>
                <Button size="sm" variant="outline" onClick={() => historyQuery.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            )}

            {!historyQuery.isLoading && !historyQuery.isError && history.length === 0 && (
              <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                Primeira visita — ainda sem reservas anteriores.
              </p>
            )}

            {!historyQuery.isLoading && !historyQuery.isError && history.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {history.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {formatHistoryDate(r.service_date)}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {r.party_size} pax
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.turns ? `${r.turns.label} · ${r.turns.start_time}` : "Sem turno"}
                        {" · "}
                        {r.tables ? r.tables.label : "Mesa por atribuir"}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
