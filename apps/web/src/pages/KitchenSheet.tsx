import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useIngredients } from "@/hooks/use-ingredients";
import { useMenuItems } from "@/hooks/use-menu";
import { useTechSheetLines, useTechSheets } from "@/hooks/use-tech-sheets";
import { ALLERGEN_LABEL } from "@/lib/types";

// Ficha de cozinha imprimível (S3): a ficha técnica num layout limpo para a
// parede/pasta da cozinha. Sem preços nem margens de propósito — a cozinha vê
// quantidades e execução; os números do dono ficam no backoffice.

export default function KitchenSheet() {
  const { menuItemId } = useParams<{ menuItemId: string }>();
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const itemsQuery = useMenuItems(restaurantId);
  const sheetsQuery = useTechSheets(restaurantId);
  const linesQuery = useTechSheetLines(restaurantId);
  const ingredientsQuery = useIngredients(restaurantId);

  const loading =
    loadingRest || itemsQuery.isLoading || sheetsQuery.isLoading || linesQuery.isLoading;

  const item = (itemsQuery.data ?? []).find((i) => i.id === menuItemId) ?? null;
  const sheet = (sheetsQuery.data ?? []).find((s) => s.menu_item_id === menuItemId) ?? null;
  const lines = sheet
    ? (linesQuery.data ?? []).filter((l) => l.tech_sheet_id === sheet.id)
    : [];
  const ingredientsById = new Map((ingredientsQuery.data ?? []).map((i) => [i.id, i]));

  if (loading) {
    return (
      <div className="container max-w-2xl py-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  if (!item || !sheet) {
    return (
      <div className="container max-w-2xl py-8 text-center">
        <p className="text-sm text-muted-foreground">
          {!item ? "Prato não encontrado." : "Este prato ainda não tem ficha técnica."}
        </p>
        <Link to="/definicoes" className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-4"}>
          Ir às Definições
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 print:max-w-none print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link to="/margens" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Voltar
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <article className="rounded-lg border border-input bg-card p-6 print:border-0 print:p-0">
        <header className="mb-4 border-b border-border pb-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Ficha técnica de cozinha · {restaurant?.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{item.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sheet.servings} dose{sheet.servings > 1 ? "s" : ""}
            {sheet.status === "validada" ? " · validada pelo chef" : " · RASCUNHO (não validada)"}
          </p>
        </header>

        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Ingredientes</h2>
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5 pr-2">{l.name}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {String(l.qty).replace(".", ",")} {l.unit}
                  </td>
                  <td className="py-1.5 pl-3 text-xs text-muted-foreground">
                    {l.ingredient_id && ingredientsById.get(l.ingredient_id)
                      ? ""
                      : "fora da despensa"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {sheet.steps.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Preparação</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {sheet.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </section>
        )}

        {item.allergens.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Alergénios</h2>
            <p className="text-sm">
              {item.allergens.map((a) => ALLERGEN_LABEL[a] ?? a).join(" · ")}
            </p>
          </section>
        )}

        {sheet.notes && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Notas</h2>
            <p className="text-sm">{sheet.notes}</p>
          </section>
        )}

        <footer className="mt-6 border-t border-border pt-2 text-xs text-muted-foreground print:mt-8">
          nostos · actualizada a {new Date(sheet.updated_at).toLocaleDateString("pt-PT")}
        </footer>
      </article>
    </div>
  );
}
