import { createContext, useContext, type ReactNode } from "react";
import { useMemberRole } from "@/hooks/use-member-role";
import type { MemberRole } from "@/lib/roles";

// Uma ÚNICA instância do role por árvore autenticada. O role é consumido em
// vários sítios ao mesmo tempo (nav no AppShell, gating no RoleGate, cartões
// owner-only na Settings); centralizar evita hooks de role duplicados na mesma
// página e mantém uma só fonte de verdade.

interface RoleState {
  role: MemberRole;
  isLoading: boolean;
}

const RoleContext = createContext<RoleState | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const value = useMemberRole();
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleState {
  const ctx = useContext(RoleContext);
  // Fora do provider (não deveria acontecer em rotas autenticadas): owner
  // defensivo, coerente com o default do useMemberRole.
  return ctx ?? { role: "owner", isLoading: false };
}
