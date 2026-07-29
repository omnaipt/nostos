import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarCheck, UtensilsCrossed, Wine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicRestaurant } from "@/hooks/use-public-booking";
import { usePublicMenu, type PublicMenuItem } from "@/hooks/use-public-menu";
import { SommelierWidget } from "@/components/public/SommelierWidget";
import { isWineCategory } from "@/lib/sommelier";
import { ALLERGEN_LABEL, formatPriceCents } from "@/lib/types";

// Menu público (/m/{slug}). Só leitura, anónimo, via RPC. Sem preços em falta
// a partir de "—". Itens esgotados aparecem esbatidos com selo "Esgotado".

export default function PublicMenu() {
  const { slug } = useParams<{ slug: string }>();
  const restaurantQuery = usePublicRestaurant(slug);
  const menuQuery = usePublicMenu(slug);
  // Sommelier v2: abre a partir do prato ("vou comer isto") ou do botão geral.
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierDish, setSommelierDish] = useState<string | null>(null);

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
  // Regiões da carta (convenção "Região · castas · perfil" na descrição dos
  // vinhos) para os chips do sommelier: extraídas do próprio menu, sem schema.
  const wineRegions = Array.from(
    new Set(
      categories
        .filter((c) => isWineCategory(c.label))
        .flatMap((c) => c.items)
        .filter((i) => i.available && i.description)
        .map((i) => (i.description ?? "").split("·")[0].trim())
        .filter((r) => r.length > 1 && r.length <= 30),
    ),
  ).slice(0, 8);
  return (
    <MenuShell>
      <div className="w-full max-w-lg space-y-6">
        <header className="flex items-center gap-2 px-1">
          <UtensilsCrossed className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
        </header>

        {/* Navegação horizontal por categoria (pedido David 29-07): sticky no
            topo, salta por âncora para cada secção do menu. */}
        {categories.length > 1 && (
          <nav
            aria-label="Categorias do menu"
            className="sticky top-0 z-20 -my-2 flex gap-1.5 overflow-x-auto border-b border-border/60 bg-background/90 px-1 py-2 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="shrink-0 rounded-full border border-input bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() =>
                  document
                    .getElementById(`cat-${c.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {c.label}
              </button>
            ))}
          </nav>
        )}

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
          <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-14 space-y-3">
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
                    <ItemPrice item={item} />
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  {item.allergens.length > 0 && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Alergénios:{" "}
                      {item.allergens
                        .map((a) => ALLERGEN_LABEL[a] ?? a)
                        .join(", ")}
                    </p>
                  )}
                  {hasWines && item.available && !isWineCategory(cat.label) && (
                    <button
                      type="button"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Que vinho combina com ${item.name}?`}
                      onClick={() => {
                        setSommelierDish(item.name);
                        setSommelierOpen(true);
                      }}
                    >
                      <Wine className="h-3.5 w-3.5" aria-hidden />
                      Que vinho combina?
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Reserva despromovida no menu (David 29-07): quem lê o menu por QR
            já está sentado; a porta de entrada da reserva é /r/{slug}. Fica
            só um caminho discreto para quem chega ao menu fora da mesa. */}
        <p className="pt-2 text-center">
          <Link
            to={`/r/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            Reservar mesa para outro dia
          </Link>
        </p>

        {slug && hasWines && (
          <SommelierWidget
            slug={slug}
            dish={sommelierDish}
            onDishChange={setSommelierDish}
            open={sommelierOpen}
            onOpenChange={setSommelierOpen}
            regions={wineRegions}
          />
        )}
      </div>
    </MenuShell>
  );
}

// Preço conforme o price_type (0010): fixed normal; per_kg com sufixo "/kg";
// market em "preço do dia"; variants empilha "label · preço" (ex.: 2 pax,
// ½ dose). Variante sem preço cai para "preço do dia".
function ItemPrice({ item }: { item: PublicMenuItem }) {
  if (item.priceType === "market") {
    return (
      <span className="shrink-0 text-sm italic text-muted-foreground">
        preço do dia
      </span>
    );
  }
  if (item.priceType === "per_kg") {
    return (
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatPriceCents(item.priceCents)}
        <span className="text-xs"> /kg</span>
      </span>
    );
  }
  if (item.priceType === "variants" && item.variants.length > 0) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-sm tabular-nums text-muted-foreground">
        {item.variants.map((v) => (
          <span key={v.label}>
            {v.label} ·{" "}
            {v.priceCents == null ? (
              <span className="italic">preço do dia</span>
            ) : (
              formatPriceCents(v.priceCents)
            )}
            {v.unit === "kg" && <span className="text-xs"> /kg</span>}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="shrink-0 tabular-nums text-muted-foreground">
      {formatPriceCents(item.priceCents)}
    </span>
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
