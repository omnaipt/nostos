import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

// Navegação global do backoffice (auditoria 29-07: o produto estava enterrado
// em /definicoes atrás de um cartão "Mesas e turnos"; se o dono não encontra,
// o cliente também não). Desktop e mobile usam a mesma barra no topo, com
// scroll horizontal em ecrãs estreitos — 8 entradas não cabem num bottom tab
// bar honesto e o scroll de chips já é o padrão do menu público.

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Início", end: true },
  { to: "/disponibilidade", label: "Reservas" },
  { to: "/ementa", label: "Ementa" },
  { to: "/margens", label: "Margens" },
  { to: "/despensa", label: "Despensa" },
  { to: "/fecho-dia", label: "Fecho do dia" },
  { to: "/clientes", label: "Clientes" },
  { to: "/definicoes", label: "Definições" },
];

// Sprint de stock do Marco (rotas /entradas e /inventario, em curso em
// paralelo): quando os PRs dele fundirem, basta virar esta flag.
const SHOW_STOCK_ROUTES = true;
const STOCK_NAV: { to: string; label: string; end?: boolean }[] = [
  { to: "/entradas", label: "Entradas" },
  { to: "/inventario", label: "Inventário" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const items = SHOW_STOCK_ROUTES
    ? [...NAV.slice(0, 6), ...STOCK_NAV, ...NAV.slice(6)]
    : NAV;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-12 items-center gap-3">
          <Link to="/" className="shrink-0" aria-label="Início">
            <img src="/brand/nostos-restaurantes.svg" alt="nostos restaurantes" className="h-7" />
          </Link>
          <nav
            aria-label="Navegação principal"
            className="flex flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors " +
                  (isActive
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-44 truncate text-xs text-muted-foreground md:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sair
            </Button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
