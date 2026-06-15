import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Restaurant } from "@/lib/types";

// Restaurante activo do utilizador autenticado. RESOLVIDO VIA RLS: a policy
// restaurants_member_select só devolve restaurantes onde o user é membro, por
// isso NÃO filtramos restaurant_id no cliente — pedimos a lista e ficamos com
// o primeiro (Fase 1: um utilizador = um restaurante). Quando suportarmos
// multi-restaurante por user, troca-se isto por um seletor.
async function fetchActiveRestaurant(): Promise<Restaurant | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Restaurant) ?? null;
}

export function useActiveRestaurant() {
  return useQuery({
    queryKey: queryKeys.activeRestaurant,
    queryFn: fetchActiveRestaurant,
    staleTime: 5 * 60 * 1000,
  });
}
