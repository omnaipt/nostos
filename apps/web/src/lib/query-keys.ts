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
};
