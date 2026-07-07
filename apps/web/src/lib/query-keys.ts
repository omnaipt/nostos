// Chaves de query TanStack centralizadas. Tudo tenant-scoped via RLS no
// servidor — não filtramos restaurant_id no cliente. O restaurante activo
// entra nas chaves só para cache/invalidação coerentes entre vistas.

export const queryKeys = {
  activeRestaurant: ["active-restaurant"] as const,
  tables: (restaurantId: string | undefined) => ["tables", restaurantId] as const,
  turns: (restaurantId: string | undefined) => ["turns", restaurantId] as const,
  // Prefixo tipado para invalidar TODAS as queries de availability (qualquer
  // data/turno) numa só chamada, sem literais "availability" soltos pelo código.
  availabilityRoot: ["availability"] as const,
  availability: (
    restaurantId: string | undefined,
    serviceDate: string,
    turnId: string,
  ) => ["availability", restaurantId, serviceDate, turnId] as const,
  // C6 — clientes. customersRoot invalida lista + lookups por telefone.
  customersRoot: ["customers"] as const,
  customers: (restaurantId: string | undefined, search: string) =>
    ["customers", restaurantId, "list", search] as const,
  customerByPhone: (restaurantId: string | undefined, phone: string) =>
    ["customers", restaurantId, "by-phone", phone] as const,
  customerReservations: (customerId: string | undefined) =>
    ["customer-reservations", customerId] as const,
  // Menu Digital — categorias e itens tenant-scoped. menuRoot invalida ambos.
  menuRoot: ["menu"] as const,
  menuCategories: (restaurantId: string | undefined) =>
    ["menu", restaurantId, "categories"] as const,
  menuItems: (restaurantId: string | undefined) =>
    ["menu", restaurantId, "items"] as const,
  // Ficha Técnica + Despensa (0006). fichasRoot invalida despensa + fichas + linhas.
  fichasRoot: ["fichas"] as const,
  ingredients: (restaurantId: string | undefined) =>
    ["fichas", restaurantId, "ingredients"] as const,
  techSheets: (restaurantId: string | undefined) =>
    ["fichas", restaurantId, "sheets"] as const,
  techSheetLines: (restaurantId: string | undefined) =>
    ["fichas", restaurantId, "lines"] as const,
};
