// Artigos de compra (Stock S1, public.purchase_items da 0032): cálculos puros
// partilhados pela UI de entradas/despensa e pelos testes. A conversão usa a
// mesma unitFactor da ficha técnica (lib/types.ts), espelho de public.unit_factor.

import { unitFactor } from "@/lib/types";

// Quantidade na unidade do ingrediente para `packs` embalagens de um artigo
// (pack_qty + pack_unit). null quando packs/pack_qty inválidos ou o formato não
// é convertível para a unidade do ingrediente (a guarda da 0032 rejeitaria).
export function packEntryQty(
  packs: number,
  packQty: number,
  packUnit: string,
  ingredientUnit: string,
  ingredientUnitWeightG?: number | null,
): number | null {
  if (!Number.isFinite(packs) || packs <= 0) return null;
  if (!Number.isFinite(packQty) || packQty <= 0) return null;
  const factor = unitFactor(packUnit, ingredientUnit, ingredientUnitWeightG);
  if (factor == null) return null;
  return packs * packQty * factor;
}

// Custo por unidade base (a do ingrediente) a partir do custo de UMA embalagem
// s/IVA. Divide pelo conteúdo convertido (pack_qty × factor). null sem custo ou
// quando o formato não é convertível.
export function packEntryBaseCostCents(
  costPerPackCents: number | null,
  packQty: number,
  packUnit: string,
  ingredientUnit: string,
  ingredientUnitWeightG?: number | null,
): number | null {
  if (costPerPackCents == null || costPerPackCents < 0) return null;
  if (!Number.isFinite(packQty) || packQty <= 0) return null;
  const factor = unitFactor(packUnit, ingredientUnit, ingredientUnitWeightG);
  if (factor == null || factor === 0) return null;
  return costPerPackCents / (packQty * factor);
}

// Conteúdo (pack_qty + pack_unit) lido de um texto livre do formato, por exemplo
// "Azeite Gallo VE 5L" -> { packQty: 5, packUnit: "l" }, "Farinha 1kg" -> 1 kg,
// "Leite 750 ml" -> 750 ml. null quando não há um par número+unidade legível.
// Só as unidades do domínio (g, kg, ml, l); cl e outras ficam para edição manual.
export function parsePackFromText(
  text: string,
): { packQty: number; packUnit: "g" | "kg" | "ml" | "l" } | null {
  const m = text
    .toLowerCase()
    .match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|lt|l)\b/);
  if (!m) return null;
  const qty = Number(m[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const raw = m[2];
  const packUnit = raw === "lt" ? "l" : (raw as "g" | "kg" | "ml" | "l");
  return { packQty: qty, packUnit };
}

export interface ArticleDraft {
  brand: string;
  label: string;
  packQty: number | null;
  packUnit: "g" | "kg" | "ml" | "l" | "un" | null;
}

// Proposta de artigo a partir do nome do produto na fatura (o que parse-invoice
// devolve). Preenche o que consegue ler; o resto fica para o dono editar antes
// de confirmar. label = texto livre do formato (o próprio nome da linha).
export function proposeArticleFromRawName(rawName: string): ArticleDraft {
  const label = rawName.trim();
  const pack = parsePackFromText(label);
  return {
    brand: "",
    label,
    packQty: pack?.packQty ?? null,
    packUnit: pack?.packUnit ?? null,
  };
}

// ── Nomes de unidade por extenso (mensagens ao utilizador) ──────────────────
// "indique a quantidade em litros" (item 2), "conta-se em unidades" (item 5).
const UNIT_NAME_PLURAL: Record<string, string> = {
  g: "gramas",
  kg: "quilogramas",
  ml: "mililitros",
  l: "litros",
  un: "unidades",
};

export function unitNamePlural(unit: string): string {
  return UNIT_NAME_PLURAL[unit] ?? unit;
}

// Rótulo curto da unidade (igual ao UNIT_OPTIONS: "l" mostra-se "L").
const UNIT_LABEL: Record<string, string> = { g: "g", kg: "kg", ml: "ml", l: "L", un: "un" };
function unitLabel(unit: string): string {
  return UNIT_LABEL[unit] ?? unit;
}

function family(u: string): "mass" | "vol" | "count" | null {
  if (u === "g" || u === "kg") return "mass";
  if (u === "ml" || u === "l") return "vol";
  if (u === "un") return "count";
  return null;
}

// Número para texto pt-PT curto (vírgula decimal, sem zeros supérfluos).
function fmtNum(n: number): string {
  return String(n).replace(".", ",");
}

// Primeira letra maiúscula, resto minúsculas ("GALLO" -> "Gallo").
function titleCaseWord(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

// Minúsculas sem acentos, para comparar palavras ("GROSSO" vs nome do ingrediente).
function lowerNoAccents(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Palavras de embalagem reconhecidas, com a forma de apresentação (acentuada).
const PACKAGING: Record<string, string> = {
  garrafao: "Garrafão",
  garrafa: "Garrafa",
  lata: "Lata",
  pack: "Pack",
  caixa: "Caixa",
  cx: "Caixa",
  saco: "Saco",
  embalagem: "Embalagem",
  frasco: "Frasco",
  boiao: "Boião",
  pacote: "Pacote",
  bidon: "Bidão",
  bidao: "Bidão",
  garrafoes: "Garrafão",
};

// Regex do conteúdo (número + unidade) no texto da linha, preservando a posição
// para separar o que vem antes (marca/embalagem) do formato.
const CONTENT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|lt|l)\b/i;

// ── Item 1: transição entrada directa -> artigo (achado 11) ─────────────────
// A entrada directa guarda a quantidade na unidade do ingrediente. Ao escolher
// ou criar um artigo, converte-se essa quantidade para nº de embalagens pelo
// conteúdo do artigo. Só vale um inteiro: fraccionário ou não convertível fica
// vazio e assinalado, para o dono confirmar: NUNCA o valor por omissão de 1.
export interface PacksTransition {
  packs: string; // "" quando não se pôde determinar
  flagged: boolean; // true quando havia quantidade mas não deu nº inteiro de embalagens
}

export function packsFromDirectQty(
  qty: number | null,
  pack: { packQty: number; packUnit: string },
  ingredientUnit: string,
  ingredientUnitWeightG?: number | null,
): PacksTransition {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) {
    return { packs: "", flagged: false };
  }
  const factor = unitFactor(ingredientUnit, pack.packUnit, ingredientUnitWeightG);
  if (factor == null || !(pack.packQty > 0)) {
    return { packs: "", flagged: true };
  }
  const raw = (qty * factor) / pack.packQty;
  const rounded = Math.round(raw);
  if (rounded > 0 && Math.abs(raw - rounded) < 1e-9) {
    return { packs: String(rounded), flagged: false };
  }
  return { packs: "", flagged: true };
}

// Embalagens ao passar para um artigo, com o contexto da fatura: quando a
// fatura vem em `un` (ou a quantidade foi lida como nº de embalagens), as
// embalagens são a própria quantidade da fatura; caso contrário converte-se a
// quantidade da entrada directa (na unidade do ingrediente) pelo conteúdo.
export function packsOnArticleChange(args: {
  invoiceUnit: string | null | undefined;
  invoiceQty: number | null | undefined;
  directQty: number | null;
  pack: { packQty: number; packUnit: string };
  ingredientUnit: string;
  ingredientUnitWeightG?: number | null;
}): PacksTransition {
  if (args.invoiceUnit === "un" && args.invoiceQty != null && args.invoiceQty > 0) {
    return { packs: String(args.invoiceQty), flagged: false };
  }
  return packsFromDirectQty(
    args.directQty,
    args.pack,
    args.ingredientUnit,
    args.ingredientUnitWeightG,
  );
}

// ── Item 1 (06b, achado 14): transição ao escolher um artigo existente ──────
// Ao escolher/propor um artigo existente, as embalagens vêm de
// packsOnArticleChange e o preço por embalagem de packCostCentsFromInvoice (a
// mesma função da aprendizagem e da criação). O preço não se preenche quando o
// utilizador já escreveu um (hasUserCost), para não o apagar; packCostCents fica
// null nesse caso ou quando a fatura não vem em `un`.
export interface ExistingArticleTransition {
  packs: string;
  flagged: boolean;
  packCostCents: number | null;
}

export function existingArticleTransition(args: {
  invoiceUnit: string | null | undefined;
  invoiceQty: number | null | undefined;
  invoiceUnitCostCents: number | null | undefined;
  directQty: number | null;
  pack: { packQty: number; packUnit: string };
  ingredientUnit: string;
  ingredientUnitWeightG?: number | null;
  hasUserCost: boolean;
}): ExistingArticleTransition {
  const t = packsOnArticleChange({
    invoiceUnit: args.invoiceUnit,
    invoiceQty: args.invoiceQty,
    directQty: args.directQty,
    pack: args.pack,
    ingredientUnit: args.ingredientUnit,
    ingredientUnitWeightG: args.ingredientUnitWeightG,
  });
  const packCostCents = args.hasUserCost
    ? null
    : packCostCentsFromInvoice({
        invoiceUnit: args.invoiceUnit,
        invoiceUnitCostCents: args.invoiceUnitCostCents,
      });
  return { packs: t.packs, flagged: t.flagged, packCostCents };
}

// ── Item 2 (06b, achado 12): sugerir o artigo existente em vez de criar ─────
// Artigos activos do ingrediente cujo conteúdo (pack_qty × pack_unit) é igual ao
// conteúdo lido na linha da fatura, depois de convertido para a unidade base do
// ingrediente — por exemplo 5 l da fatura contra um artigo de 5 l, ou 120 g
// contra 0,12 kg. Vazio quando a linha não tem conteúdo legível ou nenhum artigo
// bate certo; nesse caso mantém-se o comportamento do sprint 06.
export function articlesMatchingContent<T extends { pack_qty: number; pack_unit: string }>(
  rawName: string | null | undefined,
  articles: T[],
  ingredient: { unit: string; unit_weight_g?: number | null },
): T[] {
  const pack = parsePackFromText(rawName ?? "");
  if (!pack) return [];
  const lineQty = packEntryQty(1, pack.packQty, pack.packUnit, ingredient.unit, ingredient.unit_weight_g);
  if (lineQty == null) return [];
  return articles.filter((a) => {
    const artQty = packEntryQty(1, a.pack_qty, a.pack_unit, ingredient.unit, ingredient.unit_weight_g);
    return artQty != null && Math.abs(artQty - lineQty) < 1e-9;
  });
}

// ── Item 2: modo inicial da linha e bloqueio de registo (achado 5) ──────────
// Abre já no formulário de novo artigo quando há conteúdo de embalagem no nome,
// ou quando a fatura vem em `un` para um ingrediente em massa/volume e não há
// artigo escolhido, em vez de uma entrada directa que registaria o nº errado.
export function shouldOpenNewArticle(args: {
  rawName: string | null | undefined;
  invoiceUnit: string | null | undefined;
  ingredientUnit: string;
  hasArticle: boolean;
}): boolean {
  if (args.hasArticle) return false;
  if (args.rawName && parsePackFromText(args.rawName)) return true;
  const fam = family(args.ingredientUnit);
  if (args.invoiceUnit === "un" && (fam === "mass" || fam === "vol")) return true;
  return false;
}

// Razão para bloquear o registo de uma linha, ou null quando pode registar-se.
// Bloqueia enquanto a unidade da fatura não for convertível para a do
// ingrediente e não houver artigo escolhido.
export function lineBlockReason(args: {
  invoiceUnit: string | null | undefined;
  ingredientUnit: string;
  ingredientUnitWeightG?: number | null;
  hasArticle: boolean;
}): string | null {
  if (args.hasArticle) return null;
  if (args.invoiceUnit == null) return null; // sem unidade lida: a entrada directa decide
  if (unitFactor(args.invoiceUnit, args.ingredientUnit, args.ingredientUnitWeightG) == null) {
    return `Escolha ou crie o artigo, ou indique a quantidade em ${unitNamePlural(args.ingredientUnit)}.`;
  }
  return null;
}

// ── Item 3: preço por embalagem a partir da fatura (achado 6) ───────────────
// Quando a fatura vem em `un`, cada unidade facturada é uma embalagem, logo o
// preço unitário da fatura é o preço por embalagem. Noutras unidades o preço
// por embalagem depende do conteúdo e deixa-se ao dono.
export function packCostCentsFromInvoice(args: {
  invoiceUnit: string | null | undefined;
  invoiceUnitCostCents: number | null | undefined;
}): number | null {
  if (args.invoiceUnitCostCents == null) return null;
  if (args.invoiceUnit === "un") return args.invoiceUnitCostCents;
  return null;
}

// ── Item 4: proposta de ingrediente a partir da linha (achado 9) ────────────
// Nome sem o formato (o conteúdo e a palavra de embalagem que o antecede) e
// unidade a partir do conteúdo: kg para massa, l para volume, un sem conteúdo.
export interface IngredientDraft {
  name: string;
  unit: "g" | "kg" | "ml" | "l" | "un";
}

export function proposeIngredientFromRawName(rawName: string): IngredientDraft {
  const raw = rawName.trim();
  const m = raw.match(CONTENT_RE);
  let head = m ? raw.slice(0, m.index).trim() : raw;
  // Tira a palavra de embalagem final ("... GARRAFAO 5L" -> "...").
  const tokens = head.length ? head.split(/\s+/) : [];
  if (tokens.length && PACKAGING[lowerNoAccents(tokens[tokens.length - 1])]) {
    tokens.pop();
  }
  head = tokens.join(" ");
  const name = head ? titleCaseWord(head.toLowerCase()) : raw;
  const pack = parsePackFromText(raw);
  let unit: IngredientDraft["unit"] = "un";
  if (pack) {
    const fam = family(pack.packUnit);
    unit = fam === "mass" ? "kg" : fam === "vol" ? "l" : "un";
  }
  return { name, unit };
}

// ── Item 5: proposta de artigo coerente com a unidade do ingrediente ────────
// Separa marca e formato (heurística simples) e, para um ingrediente contado em
// `un` sem peso médio, propõe conteúdo 1 un mantendo o formato lido do nome.
export function proposeArticleForIngredient(
  rawName: string,
  ingredient: { name: string; unit: string; unit_weight_g?: number | null },
): ArticleDraft {
  const raw = (rawName ?? "").trim();
  const pack = parsePackFromText(raw);
  const ingUnit = ingredient.unit;

  // Conteúdo e unidade do artigo.
  let packQty: number | null;
  let packUnit: ArticleDraft["packUnit"];
  if (pack && unitFactor(pack.packUnit, ingUnit, ingredient.unit_weight_g) != null) {
    packQty = pack.packQty;
    packUnit = pack.packUnit;
  } else if (ingUnit === "un") {
    // Ingrediente à unidade sem peso: uma embalagem é uma unidade.
    packQty = 1;
    packUnit = "un";
  } else if (pack) {
    packQty = pack.packQty;
    packUnit = pack.packUnit;
  } else {
    packQty = null;
    packUnit = (family(ingUnit) ? ingUnit : "un") as ArticleDraft["packUnit"];
  }

  // Formato (label) e marca a partir do texto antes do conteúdo.
  const m = raw.match(CONTENT_RE);
  const before = m ? raw.slice(0, m.index).trim() : raw;
  const beforeTokens = before.length ? before.split(/\s+/) : [];
  let pkgDisplay: string | null = null;
  let brandTok: string | undefined = beforeTokens[beforeTokens.length - 1];
  if (brandTok && PACKAGING[lowerNoAccents(brandTok)]) {
    pkgDisplay = PACKAGING[lowerNoAccents(brandTok)];
    brandTok = beforeTokens[beforeTokens.length - 2];
  }

  const contentStr = pack ? `${fmtNum(pack.packQty)} ${unitLabel(pack.packUnit)}` : "";
  let label = "";
  if (pkgDisplay) label = contentStr ? `${pkgDisplay} ${contentStr}` : pkgDisplay;
  else if (contentStr) label = `Embalagem ${contentStr}`;

  // Marca: a palavra antes do conteúdo/embalagem, quando não faz parte do nome
  // do ingrediente. Caso contrário fica vazia (nunca o nome inteiro da linha).
  let brand = "";
  if (brandTok) {
    const ingWords = new Set(lowerNoAccents(ingredient.name).split(/\s+/));
    if (!ingWords.has(lowerNoAccents(brandTok))) brand = titleCaseWord(brandTok);
  }

  return { brand, label, packQty, packUnit };
}

// Mensagem de formato não convertível (item 5): diz em que unidade o ingrediente
// se conta e que conteúdos são aceites, ou que se preencha o peso médio.
export function unconvertibleFormatMessage(ingredientUnit: string): string {
  const fam = family(ingredientUnit);
  const possible =
    fam === "mass"
      ? "gramas ou quilogramas"
      : fam === "vol"
        ? "mililitros ou litros"
        : "unidades";
  return `Este ingrediente conta-se em ${unitNamePlural(ingredientUnit)}. Use um conteúdo em ${possible}, ou preencha o peso médio do ingrediente.`;
}

export interface AliasEntryProposal {
  purchaseItemId: string;
  packs: number;
  qty: number; // na unidade do ingrediente
  baseCostCents: number | null; // custo por unidade base
}

// Proposta de entrada a partir de um alias já ligado a um artigo (segunda fatura
// do mesmo fornecedor com o mesmo nome de linha): mesmo artigo, mesmas
// embalagens, sem intervenção. invoiceQty é o nº de embalagens da linha.
export function proposeEntryFromAlias(args: {
  invoiceQty: number;
  costPerPackCents: number | null;
  purchaseItem: { id: string; pack_qty: number; pack_unit: string };
  ingredientUnit: string;
  ingredientUnitWeightG?: number | null;
}): AliasEntryProposal | null {
  const packs = args.invoiceQty;
  const qty = packEntryQty(
    packs,
    args.purchaseItem.pack_qty,
    args.purchaseItem.pack_unit,
    args.ingredientUnit,
    args.ingredientUnitWeightG,
  );
  if (qty == null) return null;
  const baseCostCents = packEntryBaseCostCents(
    args.costPerPackCents,
    args.purchaseItem.pack_qty,
    args.purchaseItem.pack_unit,
    args.ingredientUnit,
    args.ingredientUnitWeightG,
  );
  return { purchaseItemId: args.purchaseItem.id, packs, qty, baseCostCents };
}
