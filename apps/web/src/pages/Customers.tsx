import * as React from "react";
import { Link } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerDetailDialog } from "@/components/customers/CustomerDetailDialog";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useCustomers, useDebouncedValue } from "@/hooks/use-customers";
import type { Customer } from "@/lib/types";

// C6 — Clientes: lista pesquisável (nome/telefone) + ficha em diálogo.
// As fichas criam-se automaticamente ao criar reservas (upsert por telefone);
// este ecrã é leitura + notas persistentes. 4 estados obrigatórios.

export default function Customers() {
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selected, setSelected] = React.useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const { data: restaurant, isLoading: loadingRest, isError: restError } = useActiveRestaurant();
  const customersQuery = useCustomers(restaurant?.id, debouncedSearch);

  const loading = loadingRest || customersQuery.isLoading;
  const errored = restError || customersQuery.isError;
  const customers = customersQuery.data ?? [];

  function openDetail(c: Customer) {
    setSelected(c);
    setDetailOpen(true);
  }

  return (
    <div className="container max-w-2xl py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Link to="/disponibilidade" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
      </header>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          className="pl-9"
          placeholder="Pesquisar por nome ou telefone"
          aria-label="Pesquisar clientes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {errored && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar os clientes.</p>
            <Button variant="outline" size="sm" onClick={() => customersQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {!errored && loading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {!errored && !loading && customers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            {debouncedSearch.trim() ? (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente encontrado para "{debouncedSearch.trim()}".
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ainda não tens clientes. As fichas criam-se automaticamente quando registas
                reservas com telefone.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!errored && !loading && customers.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {customers.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left transition-colors hover:bg-muted/50"
                onClick={() => openDetail(c)}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.phone ?? "Sem telefone"}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                </div>
                {c.notes && (
                  <span className="max-w-40 truncate text-xs text-muted-foreground">{c.notes}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <CustomerDetailDialog customer={selected} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
