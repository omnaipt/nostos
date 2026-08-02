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

// Uma categoria é "de vinhos" se o label normalizado tiver a palavra "vinho"
// (cobre "Vinhos", "Vinhos e Bebidas", "Carta de Vinhos", "Vinho a copo").
//
// Com o menu multilingue (0025) o label chega TRADUZIDO a este lado, por isso
// aceitamos também as palavras EN/ES/FR: em inglês a categoria vinha "Wines" e
// o sommelier desaparecia da ementa. A edge continua a decidir sobre os labels
// portugueses (lê a tabela, não a RPC), logo a whitelist não muda com o idioma.
// Palavra inteira e não contenção: "vin" dentro de "vinagre" não é vinho.
const WINE_WORDS = /\b(vinho|vinhos|vino|vinos|vin|vins|wine|wines)\b/;

export function isWineCategory(label: string): boolean {
  return WINE_WORDS.test(normalizeName(label));
}

// Escalões de preço. Só os CÓDIGOS vivem aqui: são eles que seguem no pedido
// à edge e não podem mudar com o idioma do cliente. Os rótulos visíveis estão
// no dicionário (lib/i18n.ts, chaves somPreco*), traduzidos nos quatro idiomas.
export const PRICE_RANGES = [
  { code: "ate_15" },
  { code: "15_25" },
  { code: "25_40" },
  { code: "40_mais" },
  { code: "indiferente" },
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
