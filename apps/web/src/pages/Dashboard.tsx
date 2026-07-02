import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { data: restaurant } = useActiveRestaurant();
  const publicUrl = restaurant?.slug ? `${window.location.origin}/r/${restaurant.slug}` : null;
  return (
    <div className="container py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">STOA</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>Sair</Button>
        </div>
      </header>
      {publicUrl && (
        <p className="mb-6 rounded-md border border-input bg-card p-3 text-sm">
          <span className="text-muted-foreground">Link público de reservas: </span>
          <a href={publicUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            {publicUrl}
          </a>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Disponibilidade</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Ver mesas e turnos do dia e gerir reservas.</p>
            <Link to="/disponibilidade" className={buttonVariants()}>Abrir disponibilidade</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Clientes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Consultar fichas de cliente, notas e histórico de reservas.</p>
            <Link to="/clientes" className={buttonVariants({ variant: "outline" })}>Abrir clientes</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Mesas e turnos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Configurar o esquema de mesas e os turnos.</p>
            <Link to="/definicoes" className={buttonVariants({ variant: "outline" })}>Abrir definições</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
