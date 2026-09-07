import * as React from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { HaccpLayout } from "@/components/haccp/HaccpLayout";
import { useRole } from "@/contexts/RoleContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import {
  useSuppliers,
  useHaccpSupplierStats,
  useCreateSupplier,
  useUpdateSupplier,
} from "@/hooks/use-haccp-receptions";
import type { Supplier } from "@/lib/types";

// Fornecedores (item 7): lista com contagens (vista haccp_supplier_stats).
// Escrita para owner/gestor/cozinha/balcao; consultor apenas lê.

export default function HaccpFornecedores() {
  const { role } = useRole();
  const canWrite = role !== "consultor";
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const suppliersQuery = useSuppliers(restaurantId);
  const statsQuery = useHaccpSupplierStats(restaurantId);
  const createSupplier = useCreateSupplier(restaurantId);
  const updateSupplier = useUpdateSupplier(restaurantId);

  const [editing, setEditing] = React.useState<Supplier | "new" | null>(null);

  const statsById = React.useMemo(
    () => new Map((statsQuery.data ?? []).map((s) => [s.supplier_id, s])),
    [statsQuery.data],
  );
  const suppliers = suppliersQuery.data ?? [];

  return (
    <HaccpLayout>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">Fornecedores</h1>
        {canWrite && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Novo fornecedor
          </Button>
        )}
      </header>

      {suppliersQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!suppliersQuery.isLoading && suppliers.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ainda sem fornecedores. Adicione o primeiro ou crie um na recepção.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {suppliers.map((s) => {
          const stat = statsById.get(s.id);
          const rejections = stat?.rejections_count ?? 0;
          return (
            <div
              key={s.id}
              className={
                "flex items-center justify-between gap-3 rounded-md border border-input bg-card p-3 " +
                (s.active ? "" : "opacity-60")
              }
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.name}
                  {!s.active && <span className="ml-2 text-xs text-muted-foreground">(inactivo)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.nif ? `NIF ${s.nif} · ` : ""}
                  {stat?.receptions_count ?? 0} recepções ·{" "}
                  <span className={rejections >= 2 ? "font-medium text-coral-600" : ""}>
                    {rejections} recusas
                  </span>
                  {stat?.last_rejection_at &&
                    ` · última recusa ${new Intl.DateTimeFormat("pt-PT", {
                      day: "numeric",
                      month: "short",
                    }).format(new Date(stat.last_rejection_at))}`}
                </p>
              </div>
              {canWrite && (
                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {editing && canWrite && (
        <SupplierDialog
          existing={editing === "new" ? null : editing}
          saving={createSupplier.isPending || updateSupplier.isPending}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            const opts = {
              onSuccess: () => {
                toast.success("Fornecedor guardado.");
                setEditing(null);
              },
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Não foi possível guardar."),
            };
            if (editing === "new") {
              createSupplier.mutate({ name: input.name, nif: input.nif }, opts);
            } else {
              updateSupplier.mutate(
                { id: (editing as Supplier).id, name: input.name, nif: input.nif, active: input.active },
                opts,
              );
            }
          }}
        />
      )}
    </HaccpLayout>
  );
}

function SupplierDialog({
  existing,
  saving,
  onClose,
  onSave,
}: {
  existing: Supplier | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: { name: string; nif: string | null; active: boolean }) => void;
}) {
  const [name, setName] = React.useState(existing?.name ?? "");
  const [nif, setNif] = React.useState(existing?.nif ?? "");
  const [active, setActive] = React.useState(existing?.active ?? true);
  const [error, setError] = React.useState<string>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError("Indique o nome (mínimo 2 caracteres).");
      return;
    }
    if (nif.trim() !== "" && !/^[0-9]{9}$/.test(nif.trim())) {
      setError("O NIF tem de ter 9 dígitos.");
      return;
    }
    setError(undefined);
    onSave({ name: name.trim(), nif: nif.trim() || null, active });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Editar fornecedor" : "Novo fornecedor"}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="sup-name" label="Nome" required>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field id="sup-nif" label="NIF">
          {(p) => (
            <Input {...p} inputMode="numeric" value={nif} onChange={(e) => setNif(e.target.value)} />
          )}
        </Field>
        {existing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Activo
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "A guardar…" : "Guardar"}
        </Button>
      </form>
    </Dialog>
  );
}
