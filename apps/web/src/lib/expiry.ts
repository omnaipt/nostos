// Validades estimadas por categoria (Gap G, fundação — 0017). Resolução:
// override do ingrediente > default (categoria, storage_mode) > fallback
// ('*', storage_mode). Base USDA FoodKeeper + overlay conservador HACCP,
// sempre o limite inferior. ESTIMATIVA, não garantia: o rótulo prevalece
// (a copy honesta vive na UI, junto ao campo editável).

export interface ShelfLifeDefault {
  category: string;
  storage_mode: string;
  shelf_life_days: number;
}

export interface ShelfLifeSource {
  category: string | null;
  storage_mode: string;
  shelf_life_override_days: number | null;
}

export function resolveShelfLifeDays(
  ingredient: ShelfLifeSource,
  defaults: ShelfLifeDefault[],
): number | null {
  if (ingredient.shelf_life_override_days != null && ingredient.shelf_life_override_days > 0) {
    return ingredient.shelf_life_override_days;
  }
  const mode = ingredient.storage_mode || "ambiente";
  if (ingredient.category) {
    const exact = defaults.find(
      (d) => d.category === ingredient.category && d.storage_mode === mode,
    );
    if (exact) return exact.shelf_life_days;
  }
  const fallback = defaults.find((d) => d.category === "*" && d.storage_mode === mode);
  return fallback ? fallback.shelf_life_days : null;
}

// "2026-07-29" + 3 → "2026-08-01". Aritmética em UTC para não fugir um dia
// com o fuso local.
export function estimateExpiryDate(invoiceDate: string, shelfLifeDays: number): string {
  const d = new Date(`${invoiceDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + shelfLifeDays);
  return d.toISOString().slice(0, 10);
}
