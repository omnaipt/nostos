import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Reservation {
  id: string;
  customer_name: string;
  party_size: number;
  reserved_at: string;
  status: string;
  table_label: string | null;
}

export default function Reservations() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reservations"],
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, customer_name, party_size, reserved_at, status, table_label")
        .order("reserved_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="container py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reservas</h1>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>Voltar</Link>
      </header>

      {isLoading && <p className="text-muted-foreground">A carregar reservas...</p>}
      {error && <p className="text-destructive">Erro a carregar reservas.</p>}
      {data && data.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Ainda não há reservas.</CardContent></Card>
      )}

      <div className="space-y-3">
        {data?.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex-row items-center justify-between py-4">
              <CardTitle className="text-base">{r.customer_name}</CardTitle>
              <span className="text-xs uppercase text-muted-foreground">{r.status}</span>
            </CardHeader>
            <CardContent className="flex gap-6 py-0 pb-4 text-sm text-muted-foreground">
              <span>{format(new Date(r.reserved_at), "dd/MM HH:mm")}</span>
              <span>{r.party_size} pax</span>
              {r.table_label && <span>Mesa {r.table_label}</span>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
