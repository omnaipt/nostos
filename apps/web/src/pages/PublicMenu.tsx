import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { UtensilsCrossed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicRestaurant } from "@/hooks/use-public-booking";
import { usePublicMenu } from "@/hooks/use-public-menu";
import { SommelierWidget } from "@/components/public/SommelierWidget";
import { isWineCategory } from "@/lib/sommelier";
import { ALLERGEN_LABEL, formatPriceCents } from "@/lib/types";

// Menu público (/m/{slug}). Só leitura, anónimo, via RPC. Sem preços em falta
// a partir de "—". Itens esgotados aparecem esbatidos com selo "Esgotado".

export default function PublicMenu() {
  const { slug } = useParams<{ slug: string }>();
  const restaurantQuery = usePublicRestaurant(slug);
  const menuQuery = usePublicMenu(slug);

  // ERRO / NÃO ENCONTRADO
  if (
    restaurantQuery.isError ||
    (restaurantQuery.isSuccess && !restaurantQuery.data)
  ) {
    return (
      <MenuShell>
        <Card className="w-full max-w-lg">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {restaurantQuery.isError
              ? "Não foi possível carregar o menu. Tenta novamente."
              : "Restaurante não encontrado. Confirma o link."}
          </CardContent>
        </Card>
      </MenuShell>
    );
  }

  // LOADING
  if (restaurantQuery.isLoading || menuQuery.isLoading) {
    return (
      <MenuShell>
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-3 py-8">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-2/3" />
          </CardContent>
        </Card>
      </MenuShell>
    );
  }

  const restaurant = restaurantQuery.data!;
  const categories = (menuQuery.data ?? []).filter((c) => c.items.length > 0);

  // Sommelier Virtual: só aparece se a carta tiver vinhos disponíveis.
  const hasWines = categories.some(
    (c) => isWineCategory(c.label) && c.items.some((i) => i.available),
  );
  const dishNames = categories
    .filter((c) => !isWineCategory(c.label))
    .flatMap((c) => c.items.filter((i) => i.available).map((i) => i.name));

  return (
    <MenuShell>
      <div className="w-full max-w-lg space-y-6">
        <header className="flex items-center gap-2 px-1">
          <UtensilsCrossed className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
        </header>

        {menuQuery.isError && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Não foi possível carregar o menu. Tenta novamente.
            </CardContent>
          </Card>
        )}

        {!menuQuery.isError && categories.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              O menu ainda não está disponível.
            </CardContent>
          </Card>
        )}

        {categories.map((cat) => (
          <section key={cat.id} className="space-y-3">
            <h2 className="border-b border-border pb-1 text-lg font-semibold text-primary">
              {cat.label}
            </h2>
            <ul className="space-y-4">
              {cat.items.map((item) => (
                <li
                  key={item.id}
                  className={item.available ? "" : "opacity-60"}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {item.name}
                      {!item.available && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          Esgotado
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatPriceCents(item.priceCents)}
                    </span>
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  {item.allergens.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Alergénios:{" "}
                      {item.allergens
                        .map((a) => ALLERGEN_LABEL[a] ?? a)
                        .join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {slug && hasWines && <SommelierWidget slug={slug} dishNames={dishNames} />}
      </div>
    </MenuShell>
  );
}

function MenuShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 py-6">
        {children}
        <p className="text-xs text-muted-foreground">
          Menu por <span className="font-semibold">nostos</span>
        </p>
      </div>
    </div>
  );
}
