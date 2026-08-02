import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

// C3 — Onboarding do restaurante (mesas + turnos). Sucesso => toast + redirect
// para a Vista de Disponibilidade (ecrã âncora).
export default function Onboarding() {
  const navigate = useNavigate();
  return (
    <div className="container max-w-2xl py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">Criar restaurante</h1>
        <p className="text-sm text-muted-foreground">
          Registe o restaurante, as mesas e os turnos para começar a aceitar reservas.
        </p>
      </header>
      <OnboardingForm
        onCreated={() => {
          toast.success("Restaurante criado");
          navigate("/disponibilidade");
        }}
      />
    </div>
  );
}
