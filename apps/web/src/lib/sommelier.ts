// Sommelier Virtual — helpers partilhados do lado do cliente.
// A detecção de vinhos e a normalização espelham a edge function
// sommelier-pairing (manter em sincronia).

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Uma categoria é "de vinhos" se o label normalizado contiver "vinho"
// (cobre "Vinhos", "Vinhos e Bebidas", "Carta de Vinhos", "Vinho a copo").
export function isWineCategory(label: string): boolean {
  return normalizeName(label).includes("vinho");
}

export const PRICE_RANGES = [
  { code: "ate_15", label: "até 15 €" },
  { code: "15_25", label: "15–25 €" },
  { code: "25_40", label: "25–40 €" },
  { code: "40_mais", label: "40 €+" },
  { code: "indiferente", label: "tanto faz" },
] as const;
export type PriceRange = (typeof PRICE_RANGES)[number]["code"];

export interface SommelierSuggestion {
  wine: string;
  priceCents: number | null;
  reason: string;
}

export interface SommelierResult {
  suggested: boolean;
  reason?: string;
  suggestions?: SommelierSuggestion[];
  note?: string | null;
}
