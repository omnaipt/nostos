import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useRole } from "@/contexts/RoleContext";
import { canAccess, homeForRole } from "@/lib/roles";

// Gating de rota por perfil (spec §1). Frontend por decisão registada — se a
// rota não pertence ao role, redirige para o Início do role com um toast
// honesto. Durante o carregamento do role não renderiza nada (evita flash da
// página antes de a decisão estar tomada).
export function RoleGate({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useRole();
  const location = useLocation();
  const navigate = useNavigate();
  const allowed = canAccess(role, location.pathname);

  useEffect(() => {
    if (isLoading || allowed) return;
    toast.error("Esta área não faz parte do seu perfil.");
    navigate(homeForRole(role), { replace: true });
  }, [isLoading, allowed, role, navigate]);

  if (isLoading || !allowed) return null;
  return <>{children}</>;
}
