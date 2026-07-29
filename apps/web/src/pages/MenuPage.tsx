import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportMenuCard } from "@/components/menu/ImportMenuCard";
import { MenuManager } from "@/components/menu/MenuManager";
import { MenuQR } from "@/components/menu/MenuQR";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";

// /ementa — a ementa como página própria (auditoria 29-07: o editor vivia
// enterrado em /definicoes). Importar por foto/PDF (onboarding) + editor
// completo (pratos de hoje, doses, toggles, vinhos) + QR do menu para
// imprimir. Aceita ?ficha=<itemId> para abrir a ficha técnica de um prato
// directamente (link vindo de /margens).

export default function MenuPage() {
  const { data: restaurant, isLoading, isError } = useActiveRestaurant();
  const [params] = useSearchParams();
  const fichaItemId = params.get("ficha");

  return (
    <div className="container max-w-2xl py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">Ementa</h1>
        <p className="text-sm text-muted-foreground">
          O que a casa serve: pratos, pratos do dia, doses e o QR do menu.
        </p>
      </header>

      {isError && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Não foi possível carregar a ementa. Tenta novamente.
          </CardContent>
        </Card>
      )}

      {!isError && isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isError && !isLoading && restaurant && (
        <div className="space-y-6">
          {/* Onboarding demonstrável: Definições (logo+tema+tom) → Importar →
              rever → publicar → QR na mesa. */}
          <ImportMenuCard restaurantId={restaurant.id} />

          <MenuManager restaurantId={restaurant.id} initialSheetItemId={fichaItemId} />

          {restaurant.slug && (
            <Card>
              <CardHeader>
                <CardTitle>QR do menu</CardTitle>
              </CardHeader>
              <CardContent>
                <MenuQR slug={restaurant.slug} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
