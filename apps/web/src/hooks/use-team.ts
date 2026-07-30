import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { looseRpc, isMissingContract } from "@/lib/contract-rpc";
import type { MemberRole } from "@/lib/roles";

// Gestão de equipa (spec §1) — owner-only. A lista lê-se de restaurant_members
// (RLS deixa qualquer membro ver os do seu gym) + o meu próprio perfil.
//
// LIMITAÇÃO conhecida e sinalizada ao Marco: `profiles` é self-only (SELECT
// id=auth.uid()), por isso do lado do cliente NÃO consigo ler o nome/email de
// um colega — só o do próprio. Para a lista mostrar identidades de todos, o
// Marco (fase A) precisa de expor uma RPC `list_team_members(p_restaurant_id)`
// → [{ user_id, email, full_name, role }]; quando existir, troca-se a leitura
// abaixo por ela. Até lá: eu apareço com nome/email, os outros por role.
//
// CONTRATO do Marco consumido nas mutações:
//   • invite_member(p_email, p_role)  (owner-only, magic link — padrão JMS Ops)
//   • mudar role / remover: escrita directa em restaurant_members (RLS owner-only
//     + trigger "≥1 owner" que o Marco adiciona; até lá degrada com erro claro).

export interface TeamMember {
  userId: string;
  role: MemberRole;
  isSelf: boolean;
  name: string | null;
  email: string | null;
  pending: boolean;
}

const TEAM_KEY = (restaurantId: string | undefined) => ["team", restaurantId] as const;

function asRole(v: string): MemberRole {
  return v === "gestor" || v === "balcao" || v === "cozinha" ? v : "owner";
}

export function useTeam(restaurantId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: TEAM_KEY(restaurantId),
    queryFn: async (): Promise<TeamMember[]> => {
      // Preferir a RPC list_team_members (Marco, 0021): dá nome+email de TODA a
      // equipa (profiles é self-only, auth.users não é legível do cliente).
      const rpc = await looseRpc<
        { user_id: string; email: string | null; full_name: string | null; role: string }[]
      >("list_team_members", { p_restaurant_id: restaurantId });
      if (!rpc.error && rpc.data) {
        return rpc.data.map((m) => ({
          userId: m.user_id,
          role: asRole(m.role),
          isSelf: m.user_id === user?.id,
          name: m.full_name,
          email: m.email,
          pending: false,
        }));
      }
      if (rpc.error && !isMissingContract(rpc.error)) throw new Error(rpc.error.message);

      // Fallback pré-0021 (RPC ainda não em prod): lê a tabela; só o próprio
      // tem nome/email. Removível quando a 0021 estiver aplicada em todo o lado.
      const { data: members, error } = await supabase
        .from("restaurant_members")
        .select("user_id, role, created_at")
        .eq("restaurant_id", restaurantId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;

      let selfName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        selfName = prof?.full_name ?? null;
      }
      return (members ?? []).map((m) => ({
        userId: m.user_id,
        role: asRole(m.role),
        isSelf: m.user_id === user?.id,
        name: m.user_id === user?.id ? selfName : null,
        email: m.user_id === user?.id ? (user?.email ?? null) : null,
        pending: false,
      }));
    },
    enabled: !!restaurantId,
  });
}

export function useInviteMember(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: MemberRole }) => {
      const { error } = await looseRpc("invite_member", {
        p_email: input.email,
        p_role: input.role,
      });
      if (error) {
        if (isMissingContract(error)) {
          throw new Error("Os convites ainda não estão activos neste ambiente.");
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAM_KEY(restaurantId) }),
  });
}

export function useChangeMemberRole(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: MemberRole }) => {
      const { error } = await supabase
        .from("restaurant_members")
        .update({ role: input.role })
        .eq("restaurant_id", restaurantId as string)
        .eq("user_id", input.userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAM_KEY(restaurantId) }),
  });
}

export function useRemoveMember(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("restaurant_members")
        .delete()
        .eq("restaurant_id", restaurantId as string)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAM_KEY(restaurantId) }),
  });
}
