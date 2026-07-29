import type {
  DraftItem,
  MenuDraft,
  PriceType,
} from "../../../../supabase/functions/parse-menu/draft";
import { parsePriceToCents } from "@/lib/types";

// Transformações PURAS do ecrã de revisão do menu importado (PR 2/2 do parse):
// draft da edge → estado editável → payload da publish_menu_import (0020).
// Publicar É a revisão: ao publicar, needs_review sai a false (o dono assumiu)
// e a note original fica como rasto. Alergénios seguem como sugestão — o
// allergens_confirmed=false é imposto no servidor (selo "por confirmar").

export interface EditVariant {
  key: string;
  label: string;
  price: string; // "12,50" editável; vazio = preço do dia
  serves: string;
}

export interface EditItem {
  key: string;
  name: string;
  description: string;
  priceType: PriceType;
  price: string;
  serves: string;
  variants: EditVariant[];
  allergens: string[];
  confidence: DraftItem["confidence"];
  needsReview: boolean;
  note: string | null;
  // Já existe item com este nome na ementa actual (reimportar acrescenta —
  // o aviso evita duplicados silenciosos; remover a linha é 1 clique).
  duplicate: boolean;
}

export interface EditCategory {
  key: string;
  name: string;
  items: EditItem[];
}

export function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}

export function draftToEditable(
  draft: MenuDraft,
  existingNames: Set<string>,
): EditCategory[] {
  let k = 0;
  const key = (p: string) => `${p}-${k++}`;
  return draft.categories.map((c) => ({
    key: key("cat"),
    name: c.name,
    items: c.items.map((i) => ({
      key: key("item"),
      name: i.name,
      description: i.description ?? "",
      priceType: i.price_type,
      price: centsToInput(i.price_cents),
      serves: i.serves != null ? String(i.serves) : "",
      variants: i.variants.map((v) => ({
        key: key("var"),
        label: v.label,
        price: centsToInput(v.price_cents),
        serves: v.serves != null ? String(v.serves) : "",
      })),
      allergens: i.allergens_suggested,
      confidence: i.confidence,
      needsReview: i.needs_review,
      note: i.note,
      duplicate: existingNames.has(i.name.trim().toLowerCase()),
    })),
  }));
}

export interface PayloadResult {
  menu: { categories: unknown[] } | null;
  problems: string[];
}

function intFromInput(v: string, max: number): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Math.trunc(Number(t));
  return Number.isFinite(n) && n > 0 && n < max ? n : null;
}

// Valida e constrói o p_menu. problems.length > 0 → NÃO publicar (a RPC
// abortaria com os mesmos erros; aqui apanham-se antes, com nomes).
export function editableToPayload(cats: EditCategory[]): PayloadResult {
  const problems: string[] = [];
  const categories: unknown[] = [];

  cats.forEach((c, catIdx) => {
    const catName = c.name.trim();
    const items: unknown[] = [];
    for (const i of c.items) {
      const name = i.name.trim();
      if (!name) {
        problems.push(`Categoria «${catName || `#${catIdx + 1}`}»: item sem nome.`);
        continue;
      }
      let price: number | null = null;
      if (i.priceType === "fixed" || i.priceType === "per_kg") {
        price = parsePriceToCents(i.price);
        if (price == null) {
          problems.push(`«${name}»: falta o preço (ou muda para "preço do dia").`);
        }
      }
      const variants: unknown[] = [];
      if (i.priceType === "variants") {
        for (const v of i.variants) {
          const label = v.label.trim();
          if (!label) {
            problems.push(`«${name}»: dose sem nome.`);
            continue;
          }
          variants.push({
            label,
            price_cents: v.price.trim() ? parsePriceToCents(v.price) : null,
            serves: intFromInput(v.serves, 50),
          });
        }
        if (variants.length === 0) {
          problems.push(`«${name}»: é por doses mas não tem nenhuma dose.`);
        }
      }
      items.push({
        name,
        description: i.description.trim() || null,
        price_type: i.priceType,
        price_cents: price,
        serves: intFromInput(i.serves, 50),
        allergens_suggested: i.allergens,
        // Publicar é a revisão: o dono assumiu. A note fica como rasto da origem.
        needs_review: false,
        note: i.note,
        variants,
      });
    }
    if (items.length > 0) {
      if (!catName) {
        problems.push(`Categoria #${catIdx + 1} sem nome.`);
      } else {
        categories.push({ name: catName, sort: catIdx, items });
      }
    }
  });

  if (categories.length === 0) {
    problems.push("Não sobrou nenhum item para publicar.");
  }
  return { menu: problems.length === 0 ? { categories } : null, problems };
}
