// Sommelier Virtual (issue #38 + specs David 07-Jul): superfície PÚBLICA do
// menu (/m/{slug}). O cliente responde a DUAS perguntas antes das sugestões:
//   1. range de preço da garrafa;
//   2. região OU casta OU uma dica de gosto pessoal (texto livre).
// A IA sugere 1-3 vinhos EXCLUSIVAMENTE da carta do restaurante, com
// justificação curta. Whitelist pós-geração: sugestões fora da carta são
// descartadas (a IA nunca inventa vinhos que a casa não tem).
//
// Segurança/custo: anónimo por slug (como public_menu_by_slug); rate limit
// 30/dia por restaurante registado em ai_generations (dish_name 'sommelier:*');
// GATE ANTHROPIC_API_KEY com no-op observável.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Payload {
  slug: string;
  dishName?: string | null;
  priceRange?: string | null;
  preference?: string | null;
}

const DAILY_LIMIT = 30;
const PRICE_LABEL: Record<string, string> = {
  ate_15: "até 15 €",
  "15_25": "entre 15 € e 25 €",
  "25_40": "entre 25 € e 40 €",
  "40_mais": "acima de 40 €",
  indiferente: "sem limite definido",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// Normalização para matching de nomes (mesma lógica do cliente em lib/sommelier.ts).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isWineCategory(label: string): boolean {
  return norm(label).includes("vinho");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ suggested: false, reason: "payload inválido" }, 400);
  }

  const slug = (payload.slug ?? "").trim();
  if (slug.length < 2 || slug.length > 120) {
    return json({ suggested: false, reason: "slug inválido" }, 400);
  }
  const dishName = (payload.dishName ?? "").trim().slice(0, 120) || null;
  const priceRange = PRICE_LABEL[payload.priceRange ?? ""] ? (payload.priceRange as string) : "indiferente";
  const preference = (payload.preference ?? "").trim().slice(0, 200) || null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!restaurant) return json({ suggested: false, reason: "restaurante não encontrado" }, 404);

  // Rate limit por restaurante/dia UTC (protege o custo numa superfície pública).
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await admin
    .from("ai_generations")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", restaurant.id)
    .like("dish_name", "sommelier:%")
    .gte("created_at", dayStart);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ suggested: false, reason: "limite diário do sommelier atingido" });
  }

  // Carta: categorias/itens activos e disponíveis; vinhos = categorias "vinho*".
  const { data: cats } = await admin
    .from("menu_categories")
    .select("id, label")
    .eq("restaurant_id", restaurant.id)
    .eq("active", true);
  const wineCatIds = new Set((cats ?? []).filter((c) => isWineCategory(c.label)).map((c) => c.id));
  if (wineCatIds.size === 0) return json({ suggested: false, reason: "sem_vinhos" });

  const { data: items } = await admin
    .from("menu_items")
    .select("category_id, name, description, price_cents, available, active")
    .eq("restaurant_id", restaurant.id)
    .eq("active", true);
  const wines = (items ?? []).filter((i) => wineCatIds.has(i.category_id) && i.available);
  if (wines.length === 0) return json({ suggested: false, reason: "sem_vinhos" });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ suggested: false, reason: "ANTHROPIC_API_KEY não configurada" });
  }

  const wineList = wines
    .map(
      (w) =>
        `- ${w.name}${w.price_cents != null ? ` (${(w.price_cents / 100).toFixed(2).replace(".", ",")} €)` : " (preço não indicado)"}${w.description ? ` — ${w.description}` : ""}`,
    )
    .join("\n");

  const system =
    "És o sommelier da casa num restaurante português: caloroso, directo, sem snobismo. " +
    "Sugeres APENAS vinhos da carta que te é dada, nunca inventas. Respondes SEMPRE e APENAS " +
    "com JSON válido, sem markdown, sem texto fora do JSON.";

  const user = `Carta de vinhos do restaurante "${restaurant.name}" (a ÚNICA lista de onde podes sugerir):
${wineList}

O cliente respondeu às duas perguntas do sommelier:
1. Preço por garrafa: ${PRICE_LABEL[priceRange]}
2. Região, casta ou gosto pessoal: ${preference ?? "sem preferência declarada"}
${dishName ? `\nPrato escolhido: ${dishName}` : "\nO cliente ainda não escolheu prato (sugere para a refeição em geral)."}

Devolve JSON com exactamente este schema:
{
  "suggestions": [{"wine": "nome EXACTAMENTE como está na carta", "reason": "1-2 frases em português de Portugal, tom de sommelier simpático"}],
  "note": "frase curta final do sommelier ou null"
}

Regras:
- 1 a 3 sugestões, por ordem de adequação. O campo "wine" tem de COPIAR o nome da carta.
- Respeita o range de preço quando os preços existem; se nada encaixar, sugere o mais próximo e di-lo com honestidade no reason.
- Se houver prato, harmoniza com ele; usa a preferência do cliente como critério principal.
- Nunca sugiras águas/refrigerantes nem nada fora da lista.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[sommelier] Anthropic erro ${res.status}: ${detail.slice(0, 300)}`);
      return json({ suggested: false, reason: `anthropic ${res.status}` });
    }

    const data = await res.json();
    const blocks: { type?: string; text?: string }[] = Array.isArray(data?.content)
      ? data.content
      : [];
    const text = blocks.find((b) => b?.type === "text")?.text ?? "";
    const parsed = parseSuggestions(text);
    if (!parsed) {
      console.error(`[sommelier] resposta não-parseável (stop=${data?.stop_reason}): ${text.slice(0, 300)}`);
      return json({ suggested: false, reason: "resposta da IA não-parseável" });
    }

    // WHITELIST: só passam sugestões cujo vinho existe mesmo na carta.
    const byNorm = new Map(wines.map((w) => [norm(w.name), w]));
    const valid = parsed.suggestions
      .map((s) => {
        const match = byNorm.get(norm(s.wine));
        return match
          ? { wine: match.name, priceCents: match.price_cents, reason: s.reason }
          : null;
      })
      .filter((x): x is { wine: string; priceCents: number | null; reason: string } => x !== null)
      .slice(0, 3);
    if (valid.length === 0) {
      console.error(`[sommelier] 0 sugestões válidas pós-whitelist: ${text.slice(0, 200)}`);
      return json({ suggested: false, reason: "sem_correspondencia" });
    }

    const { error: logError } = await admin.from("ai_generations").insert({
      restaurant_id: restaurant.id,
      user_id: null,
      dish_name: `sommelier: ${dishName ?? "carta"}`,
      input_tokens: data?.usage?.input_tokens ?? null,
      output_tokens: data?.usage?.output_tokens ?? null,
    });
    if (logError) console.error("[sommelier] falha no log:", logError.message);

    return json({ suggested: true, suggestions: valid, note: parsed.note });
  } catch (e) {
    console.error("[sommelier] falha de rede:", e);
    return json({ suggested: false, reason: "erro de rede ao contactar a IA" });
  }
});

function parseSuggestions(
  text: string,
): { suggestions: { wine: string; reason: string }[]; note: string | null } | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      raw = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const suggestions = Array.isArray(o.suggestions)
    ? o.suggestions
        .map((s) => {
          if (typeof s !== "object" || s === null) return null;
          const r = s as Record<string, unknown>;
          const wine = typeof r.wine === "string" ? r.wine.trim().slice(0, 160) : "";
          const reason = typeof r.reason === "string" ? r.reason.trim().slice(0, 400) : "";
          return wine && reason ? { wine, reason } : null;
        })
        .filter((x): x is { wine: string; reason: string } => x !== null)
    : [];
  if (suggestions.length === 0) return null;
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 300) : null;
  return { suggestions, note };
}
