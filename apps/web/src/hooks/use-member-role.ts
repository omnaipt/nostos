import { useQuery } from "@tanstack/react-query";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { looseRpc } from "@/lib/contract-rpc";
import { MEMBER_ROLES, type MemberRole } from "@/lib/roles";

// Role do utilizador no restaurante activo. Contrato congelado (spec §1): RPC
// member_role(p_restaurant_id) do Marco (fase A). DEFENSIVO enquanto a migração
// não estiver em prod, ou em qualquer erro: assume 'owner' — o único role que
// existe hoje é o dono, e assim nada fica escondido antes do backend chegar
// (o gating aperta quando os roles reais existirem).
export function useMemberRole(): { role: MemberRole; isLoading: boolean } {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const q = useQuery({
    queryKey: ["member-role", restaurant?.id],
    queryFn: async (): Promise<MemberRole> => {
      const { data, error } = await looseRpc<string>("member_role", {
        p_restaurant_id: restaurant!.id,
      });
      if (error) throw error;
      return (MEMBER_ROLES as string[]).includes(data as string)
        ? (data as MemberRole)
        : "owner";
    },
    enabled: !!restaurant?.id,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const role: MemberRole = q.isError ? "owner" : (q.data ?? "owner");
  const isLoading = loadingRest || (!!restaurant?.id && q.isLoading);
  return { role, isLoading };
}
