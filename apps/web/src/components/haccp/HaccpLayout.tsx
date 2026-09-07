import { NavLink } from "react-router-dom";
import { useRole } from "@/contexts/RoleContext";
import { statusMeta, HACCP_TONE_CLASS } from "@/lib/haccp-status";

// Sub-navegação do módulo HACCP (item 1). Segmented control mobile-first, com
// scroll horizontal em ecrãs estreitos. O consultor não vê a Recepção (não
// regista mercadoria); os restantes tabs são de leitura para ele.

interface Tab {
  to: string;
  label: string;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: "/haccp", label: "Hoje", end: true },
  { to: "/haccp/recepcao", label: "Recepção" },
  { to: "/haccp/nc", label: "Não conformidades" },
  { to: "/haccp/pontos", label: "Pontos" },
  { to: "/haccp/fornecedores", label: "Fornecedores" },
];

export function HaccpLayout({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const tabs = TABS.filter((t) => role !== "consultor" || t.to !== "/haccp/recepcao");

  return (
    <div className="container max-w-3xl py-6">
      <nav
        aria-label="Secções do HACCP"
        className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              "min-h-11 shrink-0 rounded-full border px-4 text-sm transition-colors flex items-center " +
              (isActive
                ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                : "border-input bg-card text-foreground hover:bg-muted")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}

// Chip de estado por célula (dia, turno, ponto). Cores por tom Costeiro.
// `pendingSync` tem precedência: um registo ainda na fila offline mostra-se
// "por sincronizar" (âmbar tracejado) em vez do estado do servidor, sem fingir
// que já está conforme/verificado.
export function HaccpChip({ status, pendingSync }: { status: string; pendingSync?: boolean }) {
  if (pendingSync) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-ambar-600 px-2.5 py-0.5 text-xs font-medium text-ambar-600">
        por sincronizar
      </span>
    );
  }
  const meta = statusMeta(status);
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
        HACCP_TONE_CLASS[meta.tone]
      }
    >
      {meta.label}
    </span>
  );
}
