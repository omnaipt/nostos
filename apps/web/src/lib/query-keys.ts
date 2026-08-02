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
  menuItemVariants: (restaurantId: string | undefined) =>
    ["menu", restaurantId, "variants"] as const,
  menuImports: (restaurantId: string | undefined) =>
    ["menu", restaurantId, "imports"] as const,
  menuImport: (importId: string | undefined) => ["menu-import", importId] as const,
  // Ficha Técnica + Despensa (0006). fichasRoot invalida despensa + fichas + linhas.
  fichasRoot: ["fichas"] as const,
  ingredients: (restaurantId: string | undefined) =>
    ["fichas", restaurantId, "ingredients"] as const,
  techSheets: (restaurantId: string | undefined) =>
    ["fichas", restaurantId, "sheets"] as const,
  techSheetLines: (restaurantId: string | undefined) =>
    ["fichas", restaurantId, "lines"] as const,
  // Stock (0011). stockRoot invalida movimentos de qualquer ingrediente.
  stockRoot: ["stock"] as const,
  stockMovements: (restaurantId: string | undefined, ingredientId: string | undefined) =>
    ["stock", restaurantId, "movements", ingredientId] as const,
  lastPurchases: (restaurantId: string | undefined) =>
    ["stock", restaurantId, "last-purchases"] as const,
  // Entradas de compra (Gap A): lista agrupada por fatura + último custo p/ UI.
  purchaseEntries: (restaurantId: string | undefined) =>
    ["stock", restaurantId, "purchase-entries"] as const,
  lastPurchaseCosts: (restaurantId: string | undefined) =>
    ["stock", restaurantId, "last-purchase-costs"] as const,
  // Validades (0017): defaults globais + compras a expirar (alertas Zé).
  shelfLifeDefaults: ["shelf-life-defaults"] as const,
  expiringPurchases: (restaurantId: string | undefined) =>
    ["stock", restaurantId, "expiring-purchases"] as const,
  // Imports SAF-T (0012). saftRoot invalida lotes + linhas + último fecho.
  saftRoot: ["saft"] as const,
  saftImports: (restaurantId: string | undefined) => ["saft", restaurantId, "imports"] as const,
  saftUnmatchedLines: (importId: string | undefined) =>
    ["saft", "unmatched", importId] as const,
  lastAppliedImport: (restaurantId: string | undefined) =>
    ["saft", restaurantId, "last-applied"] as const,
  // Traduções do menu (0025). translationsRoot invalida progresso + linhas.
  translationsRoot: ["translations"] as const,
  translationProgress: (restaurantId: string | undefined) =>
    ["translations", restaurantId, "progress"] as const,
  translations: (restaurantId: string | undefined, lang: string) =>
    ["translations", restaurantId, "rows", lang] as const,
  // Estatísticas (0024). Os filtros entram na chave: mudar de turno ou de dia
  // da semana é outra pergunta, não a mesma com outra roupa.
  statsRoot: ["stats"] as const,
  salesSummary: (
    restaurantId: string | undefined,
    f: { from: string; to: string; turnIds: string[] | null; weekdays: number[] | null },
  ) => ["stats", restaurantId, "summary", f.from, f.to, f.turnIds, f.weekdays] as const,
  salesByItem: (
    restaurantId: string | undefined,
    f: { from: string; to: string; turnIds: string[] | null; weekdays: number[] | null },
  ) => ["stats", restaurantId, "by-item", f.from, f.to, f.turnIds, f.weekdays] as const,
};
