import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Onboarding from "@/pages/Onboarding";
import Availability from "@/pages/Availability";
import Settings from "@/pages/Settings";
import Customers from "@/pages/Customers";
import PublicBooking from "@/pages/PublicBooking";
import RecoverPassword from "@/pages/RecoverPassword";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/r/:slug" element={<PublicBooking />} />
            <Route path="/recuperar-password" element={<RecoverPassword />} />
            <Route path="/repor-password" element={<ResetPassword />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/disponibilidade"
              element={
                <ProtectedRoute>
                  <Availability />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/definicoes"
              element={
                <ProtectedRoute>
                  <Settings />
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
