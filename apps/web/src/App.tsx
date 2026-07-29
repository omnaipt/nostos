import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Landing from "@/pages/Landing";
import { useAuth } from "@/contexts/AuthContext";
import Onboarding from "@/pages/Onboarding";
import Availability from "@/pages/Availability";
import Settings from "@/pages/Settings";
import Customers from "@/pages/Customers";
import Margins from "@/pages/Margins";
import MenuPage from "@/pages/MenuPage";
import Pantry from "@/pages/Pantry";
import Entradas from "@/pages/Entradas";
import Inventario from "@/pages/Inventario";
import SaftClose from "@/pages/SaftClose";
import KitchenSheet from "@/pages/KitchenSheet";
import PublicBooking from "@/pages/PublicBooking";
import PublicMenu from "@/pages/PublicMenu";
import RecoverPassword from "@/pages/RecoverPassword";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

// Raiz condicionada pela sessão: anónimo vê a landing comercial; membro vê o
// Dashboard. Sem redirect para não partir bookmarks nem piscar o ecrã.
function HomeGate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? (
    <AppShell>
      <Dashboard />
    </AppShell>
  ) : (
    <Landing />
  );
}

// Página autenticada do backoffice com a navegação global (auditoria 29-07).
// A ficha de cozinha (/fichas/:id/imprimir) fica de fora: é uma folha de
// impressão, o chrome de navegação só sujava o papel.
function Backoffice({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
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
            <Route path="/recuperar-password" element={<RecoverPassword />} />
            <Route path="/repor-password" element={<ResetPassword />} />
            {/* Raiz: landing pública para anónimos, Dashboard para membros (S4). */}
            <Route path="/" element={<HomeGate />} />
            <Route path="/disponibilidade" element={<Backoffice><Availability /></Backoffice>} />
            <Route path="/clientes" element={<Backoffice><Customers /></Backoffice>} />
            <Route path="/ementa" element={<Backoffice><MenuPage /></Backoffice>} />
            <Route path="/definicoes" element={<Backoffice><Settings /></Backoffice>} />
            <Route path="/margens" element={<Backoffice><Margins /></Backoffice>} />
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
