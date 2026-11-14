import * as React from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { CasaLogo } from "@/components/CasaLogo";
import { navForRole, type NavItem } from "@/lib/roles";

// Navegação global do backoffice (auditoria 29-07: o produto estava enterrado
// em /definicoes atrás de um cartão "Mesas e turnos"; se o dono não encontra,
// o cliente também não).
//
// Pele "Costeiro quente" (29-07): a barra é atlantico-900 (estrutura), o
// ativo é a ÚNICA pill terracota, e à esquerda vive o bloco da casa
// (logo/monograma + nome) com o nostos a assinar discreto — o produto é do
// restaurante.
//
// Nav filtrada por perfil (spec Roles 29-07): o balcão vê Balcão+Clientes, a
// cozinha vê Ementa+Despensa+Entradas+Inventário, owner/gestor veem tudo.
//
// Em desktop (≥1280px) os itens que não cabem recolhem para um menu "Mais"
// (sprint 06, item 1/achado 1: Clientes e Definições ficavam no overflow
// invisível do scroll e o dono não lhes chegava). Em telemóvel mantém-se a
// barra com scroll horizontal.

const linkClass = (isActive: boolean) =>
  "rounded-full px-3 py-1.5 text-sm transition-colors " +
  (isActive
    ? "bg-terracota-600 font-medium text-areia-50"
    : "text-atlantico-300 hover:bg-atlantico-700 hover:text-areia-50");

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { data: restaurant } = useActiveRestaurant();
  const { role, isLoading: roleLoading } = useRole();
  // Enquanto o role não é conhecido, nav vazia (evita mostrar itens que o role
  // não pode e depois os retirar).
  const items = React.useMemo<NavItem[]>(
    () => (roleLoading ? [] : navForRole(role)),
    [roleLoading, role],
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-atlantico-700 bg-atlantico-900 text-areia-50 shadow-warm">
        <div className="container flex h-14 items-center gap-3">
          <Link
            to="/"
            aria-label="Início"
            className="flex shrink-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlantico-300"
          >
            <CasaLogo name={restaurant?.name ?? "nostos"} size={30} />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="max-w-40 truncate text-sm font-medium">
                {restaurant?.name ?? "nostos"}
              </span>
              <span className="text-[10px] tracking-wide text-atlantico-300">com nostos</span>
            </span>
          </Link>

          {/* Telemóvel/tablet: barra com scroll horizontal (comportamento atual). */}
          <nav
            aria-label="Navegação principal"
            className="flex flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap py-1 [scrollbar-width:none] xl:hidden [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => linkClass(isActive)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop (≥1280px): os itens que não cabem recolhem para "Mais". */}
          <DesktopNav items={items} />

          <div className="flex shrink-0 items-center">
            {/* O email saiu da barra (ocupava ~180px e empurrava as Definições
                para o overflow invisível — David 29-07); fica no tooltip. */}
            <button
              type="button"
              onClick={signOut}
              title={user?.email ?? undefined}
              className="rounded-full px-3 py-1.5 text-sm text-atlantico-300 transition-colors hover:bg-atlantico-700 hover:text-areia-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlantico-300"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

// Barra de desktop com overflow medido: mede a largura de cada item num row
// invisível e mostra inline só os que cabem; o resto vai para o menu "Mais".
function DesktopNav({ items }: { items: NavItem[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(items.length);
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const GAP = 4; // gap-1
    const MORE_WIDTH = 84; // reserva para o botão "Mais"

    const compute = () => {
      const avail = container.clientWidth;
      if (avail === 0) return; // barra escondida (telemóvel): não mexe
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth);
      const fits = (reserve: number) => {
        let used = 0;
        let count = 0;
        for (let i = 0; i < widths.length; i++) {
          const w = widths[i] + (i > 0 ? GAP : 0);
          if (used + w + reserve <= avail) {
            used += w;
            count += 1;
          } else break;
        }
        return count;
      };
      const all = fits(0);
      setVisibleCount(all === widths.length ? all : fits(MORE_WIDTH));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [items]);

  const count = Math.min(visibleCount, items.length);
  const inline = items.slice(0, count);
  const overflow = items.slice(count);

  return (
    <nav
      ref={containerRef}
      aria-label="Navegação principal"
      className="relative hidden min-w-0 flex-1 items-center gap-1 xl:flex"
    >
      {/* Row invisível para medir a largura total de cada item. */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 flex gap-1 opacity-0"
      >
        {items.map((item) => (
          <span key={item.to} className="rounded-full px-3 py-1.5 text-sm">
            {item.label}
          </span>
        ))}
      </div>

      {inline.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => linkClass(isActive)}
        >
          {item.label}
        </NavLink>
      ))}

      {overflow.length > 0 && (
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            onBlur={() => window.setTimeout(() => setMoreOpen(false), 120)}
            className={
              "flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors " +
              "text-atlantico-300 hover:bg-atlantico-700 hover:text-areia-50"
            }
          >
            Mais
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-md border border-atlantico-700 bg-atlantico-900 p-1 shadow-warm"
            >
              {overflow.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    "block rounded px-3 py-1.5 text-sm transition-colors " +
                    (isActive
                      ? "bg-terracota-600 font-medium text-areia-50"
                      : "text-atlantico-300 hover:bg-atlantico-700 hover:text-areia-50")
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
