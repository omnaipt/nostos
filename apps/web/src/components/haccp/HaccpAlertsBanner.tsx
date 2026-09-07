import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { HaccpAlert } from "@/lib/haccp-alerts";

// Banner de alertas (item 3). Coral, cada alerta com link para o ecrã certo.
// Sem alertas, não renderiza nada.

export function HaccpAlertsBanner({ alerts }: { alerts: HaccpAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="mb-4 space-y-1 rounded-md border border-coral-600/30 bg-coral-100 p-3">
      {alerts.map((a, i) => (
        <Link
          key={`${a.kind}-${i}`}
          to={a.to}
          className="flex items-start gap-2 text-sm text-coral-600 hover:underline"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{a.text}</span>
        </Link>
      ))}
    </div>
  );
}
