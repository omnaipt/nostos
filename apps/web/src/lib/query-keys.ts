// Chaves de query TanStack centralizadas. Tudo tenant-scoped via RLS no
// servidor — não filtramos restaurant_id no cliente. O restaurante activo
// entra nas chaves só para cache/invalidação coerentes entre vistas.

export const queryKeys = {
  activeRestaurant: ["active-restaurant"] as const,
  tables: (restaurantId: string | undefined) => ["tables", restaurantId] as const,
  turns: (restaurantId: string | undefined) => ["turns", restaurantId] as const,
  availability: (
    restaurantId: string | undefined,
    serviceDate: string,
    turnId: string,
  ) => ["availability", restaurantId, serviceDate, turnId] as const,
};
