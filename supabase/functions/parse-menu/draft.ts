// Validação/normalização PURA do draft de menu vindo do modelo (partilhada:
// a edge importa ./draft.ts; o frontend do Zé e o vitest importam por caminho
// relativo — uma só implementação, padrão do parse-invoice/match.ts).
//
// O modelo classifica o price_type pela taxonomia real dos 3 menus de 28-07;
// aqui NÃO se confia no enum: valida-se, normaliza-se a coerência da 0010
// (fixed/per_kg exigem preço; market/variants não têm), e o que não bate
// certo fica needs_review com note — o ecrã de revisão obriga a resolver
// antes de publicar (a RPC publish_menu_import aborta se escapar).

export type PriceType = "fixed" | "per_kg" | "market" | "variants";

export interface DraftVariant {
  label: string;
  price_cents: number | null;
  serves: number | null;
}

export interface DraftItem {
  name: string;
  description: string | null;
  price_type: PriceType;
  price_cents: number | null;
  variants: DraftVariant[];
  serves: number | null;
  allergens_suggested: string[];
  confidence: "alta" | "media" | "baixa";
  needs_review: boolean;
  note: string | null;
}

export interface DraftCategory {
  name: string;
  sort: number;
  items: DraftItem[];
}

export interface MenuDraft {
  categories: DraftCategory[];
  wines_detected: boolean;
  items_count: number;
  flagged_count: number; // needs_review OU confidence baixa
}

const PRICE_TYPES = new Set<PriceType>(["fixed", "per_kg", "market", "variants"]);
const ALLERGENS = new Set([
  "gluten", "crustaceos", "ovos", "peixe", "amendoins", "soja", "leite",
  "frutos_casca", "aipo", "mostarda", "sesamo", "sulfitos", "tremoco", "moluscos",
]);
const MAX_CATEGORIES = 30;
const MAX_ITEMS_PER_CATEGORY = 80;

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function intOrNull(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v < max
    ? Math.round(v)
    : null;
}

function appendNote(base: string | null, extra: string): string {
  return base ? `${base} · ${extra}` : extra;
}

// JSON puro ou embrulhado em fences (mesmo parsing defensivo das edges irmãs).
export function extractJson(text: string): unknown | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export function parseMenuDraft(text: string): MenuDraft | null {
  const raw = extractJson(text);
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const categories: DraftCategory[] = [];
  let itemsCount = 0;
  let flagged = 0;

  const rawCats = Array.isArray(o.categories) ? o.categories.slice(0, MAX_CATEGORIES) : [];
  rawCats.forEach((c, catIdx) => {
    if (typeof c !== "object" || c === null) return;
    const rc = c as Record<string, unknown>;
    const catName = str(rc.name, 80);
    if (!catName) return;

    const items: DraftItem[] = [];
    const rawItems = Array.isArray(rc.items) ? rc.items.slice(0, MAX_ITEMS_PER_CATEGORY) : [];
    for (const i of rawItems) {
      if (typeof i !== "object" || i === null) continue;
      const ri = i as Record<string, unknown>;
      const name = str(ri.name, 120);
      if (!name) continue;

      let priceType = (str(ri.price_type, 12) ?? "fixed") as PriceType;
      let needsReview = ri.needs_review === true;
      let note = str(ri.note, 300);
      if (!PRICE_TYPES.has(priceType)) {
        // Na dúvida → fixed com needs_review (taxonomia §3 do prompt).
        note = appendNote(note, `price_type desconhecido: ${priceType}`);
        priceType = "fixed";
        needsReview = true;
      }

      let price = intOrNull(ri.price_cents, 1_000_000);
      const rawVariants = Array.isArray(ri.variants) ? ri.variants.slice(0, 8) : [];
      const variants: DraftVariant[] = [];
      for (const v of rawVariants) {
        if (typeof v !== "object" || v === null) continue;
        const rv = v as Record<string, unknown>;
        const label = str(rv.label, 40);
        if (!label) continue;
        variants.push({
          label,
          price_cents: intOrNull(rv.price_cents, 1_000_000),
          serves: intOrNull(rv.serves, 50),
        });
      }

      // Coerência 0010 antecipada (o publish aborta; aqui sinaliza-se):
      if ((priceType === "fixed" || priceType === "per_kg") && price == null) {
        needsReview = true;
        note = appendNote(note, "sem preço legível");
      }
      if (priceType === "market" || priceType === "variants") {
        price = null;
      }
      if (priceType === "variants" && variants.length === 0) {
        needsReview = true;
        note = appendNote(note, "doses por preencher");
      }

      const allergens = Array.isArray(ri.allergens_suggested)
        ? [...new Set(
            ri.allergens_suggested.filter(
              (a): a is string => typeof a === "string" && ALLERGENS.has(a),
            ),
          )]
        : [];

      const confidence =
        ri.confidence === "alta" || ri.confidence === "media" || ri.confidence === "baixa"
          ? ri.confidence
          : "baixa";

      if (needsReview || confidence === "baixa") flagged += 1;
      itemsCount += 1;
      items.push({
        name,
        description: str(ri.description, 400),
        price_type: priceType,
        price_cents: price,
        variants: priceType === "variants" ? variants : [],
        serves: intOrNull(ri.serves, 50),
        allergens_suggested: allergens,
        confidence,
        needs_review: needsReview,
        note,
      });
    }
    if (items.length > 0) {
      categories.push({ name: catName, sort: catIdx, items });
    }
  });

  if (categories.length === 0) return null;
  return {
    categories,
    wines_detected: o.wines_detected === true,
    items_count: itemsCount,
    flagged_count: flagged,
  };
}
