import { Link, NavLink } from "react-router-dom";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { CasaLogo } from "@/components/CasaLogo";
import { navForRole } from "@/lib/roles";

// Navegação global do backoffice (auditoria 29-07: o produto estava enterrado
// em /definicoes atrás de um cartão "Mesas e turnos"; se o dono não encontra,
// o cliente também não). Desktop e mobile usam a mesma barra no topo, com
// scroll horizontal em ecrãs estreitos.
//
// Pele "Costeiro quente" (29-07): a barra é atlantico-900 (estrutura), o
// activo é a ÚNICA pill terracota, e à esquerda vive o bloco da casa
// (logo/monograma + nome) com o nostos a assinar discreto — o produto é do
// restaurante.
//
// Nav filtrada por perfil (spec Roles 29-07): o balcão vê Balcão+Clientes, a
// cozinha vê Ementa+Despensa+Entradas+Inventário, owner/gestor veem tudo.

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const { data: restaurant } = useActiveRestaurant();
  const { role, isLoading: roleLoading } = useRole();
  // Enquanto o role não é conhecido, nav vazia (evita mostrar itens que o role
  // não pode e depois os retirar).
  const items = roleLoading ? [] : navForRole(role);

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
                  "rounded-full px-3 py-1.5 text-sm transition-colors " +
                  (isActive
                    ? "bg-terracota-600 font-medium text-areia-50"
                    : "text-atlantico-300 hover:bg-atlantico-700 hover:text-areia-50")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
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
