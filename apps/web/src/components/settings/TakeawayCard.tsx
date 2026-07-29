import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToggleTakeaway } from "@/hooks/use-takeaway";
import type { Restaurant } from "@/lib/types";

// Toggle do módulo take-away (spec §D.3) — owner/gestor. Honesto sobre o
// pagamento: paga-se ao levantar, não há pagamento online no v1.
export function TakeawayCard({ restaurant }: { restaurant: Restaurant }) {
  const toggle = useToggleTakeaway();
  const enabled = (restaurant as { takeaway_enabled?: boolean }).takeaway_enabled === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Take-away</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 accent-primary"
            checked={enabled}
            disabled={toggle.isPending}
            onChange={(e) =>
              toggle.mutate(
                { restaurantId: restaurant.id, enabled: e.target.checked },
                {
                  onSuccess: () =>
                    toast.success(e.target.checked ? "Take-away ligado" : "Take-away desligado"),
                  onError: (err) =>
                    toast.error(err instanceof Error ? err.message : "Não foi possível guardar."),
                },
              )
            }
          />
          <span>
            <span className="text-sm font-medium">Aceitar encomendas para levar</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Aparece um botão "Encomendar para levar" no teu menu público. O cliente
              escolhe, deixa o telefone e a hora, e <strong>paga ao levantar</strong> —
              sem pagamento online. As encomendas caem na fila do Balcão.
            </span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
