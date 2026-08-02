import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGate } from "@/components/RoleGate";
import { AppShell } from "@/components/AppShell";
import { RoleProvider, useRole } from "@/contexts/RoleContext";
import { homeForRole } from "@/lib/roles";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
import { useAuth } from "@/contexts/AuthContext";
import Onboarding from "@/pages/Onboarding";
import Availability from "@/pages/Availability";
import Balcao from "@/pages/Balcao";
import Settings from "@/pages/Settings";
import Customers from "@/pages/Customers";
import Margins from "@/pages/Margins";
import Stats from "@/pages/Stats";
import MenuPage from "@/pages/MenuPage";
import MenuImportReview from "@/pages/MenuImportReview";
import Pantry from "@/pages/Pantry";
import Entradas from "@/pages/Entradas";
import Inventario from "@/pages/Inventario";
import SaftClose from "@/pages/SaftClose";
import KitchenSheet from "@/pages/KitchenSheet";
import PublicBooking from "@/pages/PublicBooking";
import PublicMenu from "@/pages/PublicMenu";
import PublicTakeaway from "@/pages/PublicTakeaway";
import RecoverPassword from "@/pages/RecoverPassword";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

// Raiz condicionada pela sessão: anónimo vê a landing; membro vê o Início do
// seu perfil. owner/gestor → Dashboard; balcão → /balcao; cozinha → /ementa
// (spec Roles 29-07). Sem redirect para owner/gestor (não parte bookmarks).
function HomeGate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Landing />;
  return (
    <RoleProvider>
      <AppShell>
        <RoleHome />
      </AppShell>
    </RoleProvider>
  );
}

function RoleHome() {
  const { role, isLoading } = useRole();
  const navigate = useNavigate();
  const home = isLoading ? "/" : homeForRole(role);
  useEffect(() => {
    if (!isLoading && home !== "/") navigate(home, { replace: true });
  }, [isLoading, home, navigate]);
  if (isLoading || home !== "/") return null;
  return <Dashboard />;
}

// Página autenticada do backoffice com a navegação global (auditoria 29-07) e
// o gating por perfil (spec Roles 29-07). A ficha de cozinha
// (/fichas/:id/imprimir) fica de fora: é folha de impressão, o chrome só sujava
// o papel.
function Backoffice({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <RoleProvider>
        <AppShell>
          <RoleGate>{children}</RoleGate>
        </AppShell>
      </RoleProvider>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/r/:slug" element={<PublicBooking />} />
            <Route path="/m/:slug" element={<PublicMenu />} />
            <Route path="/m/:slug/levar" element={<PublicTakeaway />} />
            <Route path="/recuperar-password" element={<RecoverPassword />} />
            <Route path="/repor-password" element={<ResetPassword />} />
            {/* Raiz: landing pública para anónimos, Dashboard para membros (S4). */}
            <Route path="/" element={<HomeGate />} />
            <Route path="/disponibilidade" element={<Backoffice><Availability /></Backoffice>} />
            <Route path="/balcao" element={<Backoffice><Balcao /></Backoffice>} />
            <Route path="/clientes" element={<Backoffice><Customers /></Backoffice>} />
            <Route path="/ementa" element={<Backoffice><MenuPage /></Backoffice>} />
            <Route path="/ementa/rever/:importId" element={<Backoffice><MenuImportReview /></Backoffice>} />
            <Route path="/definicoes" element={<Backoffice><Settings /></Backoffice>} />
            <Route path="/margens" element={<Backoffice><Margins /></Backoffice>} />
            <Route path="/estatisticas" element={<Backoffice><Stats /></Backoffice>} />
            <Route path="/despensa" element={<Backoffice><Pantry /></Backoffice>} />
            <Route path="/entradas" element={<Backoffice><Entradas /></Backoffice>} />
            <Route path="/inventario" element={<Backoffice><Inventario /></Backoffice>} />
            <Route path="/fecho-dia" element={<Backoffice><SaftClose /></Backoffice>} />
            <Route
              path="/fichas/:menuItemId/imprimir"
              element={
                <ProtectedRoute>
                  <KitchenSheet />
                </ProtectedRoute>
              }
            />
            {/* Rota antiga: a Vista de Dia foi substituída pela Vista de Disponibilidade. */}
            <Route path="/reservas" element={<Navigate to="/disponibilidade" replace />} />
            <Route path="/index" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
