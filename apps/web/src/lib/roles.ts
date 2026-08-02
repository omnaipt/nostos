// Perfis de utilizador CURADOS (spec Roles_Balcao_Takeaway 29-07): 4 roles em
// vez de matriz de permissões à la carte (falsa flexibilidade + bugs de RLS).
// O gating por área na nav/rotas é FRONTEND por decisão registada na spec —
// não é segurança criptográfica; para empregados do próprio restaurante é
// risco aceitável no v1. A RLS endurece só o crítico (identidade/equipa),
// isso é do Marco (fase A). Contrato congelado: os slugs abaixo.

export type MemberRole = "owner" | "gestor" | "balcao" | "cozinha";
export const MEMBER_ROLES: MemberRole[] = ["owner", "gestor", "balcao", "cozinha"];

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Dono",
  gestor: "Gestor",
  balcao: "Balcão",
  cozinha: "Cozinha",
};

export const ROLE_HINT: Record<MemberRole, string> = {
  owner: "Tudo, incluindo equipa e identidade da casa.",
  gestor: "Tudo operacional; não gere equipa nem identidade.",
  balcao: "Reservas de todos os canais, clientes e take-away.",
  cozinha: "Fichas técnicas, despensa, entradas e inventário.",
};

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

// Superset ordenado da navegação do backoffice. Cada role vê um subconjunto.
const ALL_NAV: NavItem[] = [
  { to: "/", label: "Início", end: true },
  { to: "/disponibilidade", label: "Reservas" },
  { to: "/balcao", label: "Balcão" },
  { to: "/ementa", label: "Ementa" },
  { to: "/margens", label: "Margens" },
  { to: "/estatisticas", label: "Estatísticas" },
  { to: "/despensa", label: "Despensa" },
  { to: "/entradas", label: "Entradas" },
  { to: "/inventario", label: "Inventário" },
  { to: "/fecho-dia", label: "Fecho do dia" },
  { to: "/clientes", label: "Clientes" },
  { to: "/definicoes", label: "Definições" },
];

// Prefixos de rota permitidos por role (spec §1 + prompt B.2). owner e gestor
// partilham o conjunto de ROTAS; a diferença (equipa/identidade) é gating de
// CARTÃO dentro de /definicoes, não de rota.
const ALLOWED: Record<MemberRole, string[]> = {
  owner: ALL_NAV.map((n) => n.to),
  gestor: ALL_NAV.map((n) => n.to),
  balcao: ["/balcao", "/clientes"],
  cozinha: ["/ementa", "/despensa", "/entradas", "/inventario"],
};

export function navForRole(role: MemberRole): NavItem[] {
  const allow = new Set(ALLOWED[role]);
  return ALL_NAV.filter((n) => allow.has(n.to));
}

// Início efectivo do role: o balcão abre no /balcao (é o seu ecrã de trabalho),
// a cozinha na Ementa. owner/gestor mantêm o Dashboard em "/".
export function homeForRole(role: MemberRole): string {
  if (role === "balcao") return "/balcao";
  if (role === "cozinha") return "/ementa";
  return "/";
}

// "/" casa exacto (é o Início); o resto por prefixo de segmento, para apanhar
// sub-rotas (ex.: /ementa/rever/:id herda de /ementa).
export function canAccess(role: MemberRole, pathname: string): boolean {
  return ALLOWED[role].some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/"),
  );
}
