// Ficha Técnica IA (v3) — gera o PRIMEIRO RASCUNHO da ficha técnica de um
// prato a partir do nome/descrição. O chef corrige, não escreve do zero.
//
// v3 (S2):
// - Autorização real: valida o JWT do caller E a membership no restaurante.
// - Rate limit: 25 gerações por restaurante por dia (UTC), com registo em
//   public.ai_generations (tokens incluídos, para monitorizar custo).
// - Prompt inclui a despensa do restaurante: a IA reutiliza os nomes exactos
//   para o auto-match de linhas funcionar.
// - Custo estimado de compra por ingrediente (est_cost) para semear a
//   despensa com um clique.
//
// GATE: ANTHROPIC_API_KEY (secret). Sem key → { generated:false } (no-op).
// A função só ESCREVE no log ai_generations (service role); a ficha é
// gravada pelo cliente via RLS.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

interface Payload {
  restaurantId: string;
  dishName: string;
  description?: string | null;
  servings?: number;
  pantry?: string[];
}

interface DraftIngredient {
  name: string;
  qty: number;
  unit: string;
  est_cost: { unit: string; cents: number } | null;
}

interface SheetDraft {
  servings: number;
  ingredients: DraftIngredient[];
  steps: string[];
  allergens: string[];
  notes: string | null;
}

const DAILY_LIMIT = 25;
const UNITS = new Set(["g", "kg", "ml", "l", "un"]);
const COST_UNITS = new Set(["kg", "l", "un"]);
const ALLERGENS = new Set([
  "gluten", "crustaceos", "ovos", "peixe", "amendoins", "soja", "leite",
  "frutos_casca", "aipo", "mostarda", "sesamo", "sulfitos", "tremoco", "moluscos",
]);

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ generated: false, reason: "payload inválido" }, 400);
  }

  const dishName = (payload.dishName ?? "").trim();
  if (dishName.length < 2 || dishName.length > 120) {
    return json({ generated: false, reason: "nome do prato inválido" }, 400);
  }
  if (!payload.restaurantId || typeof payload.restaurantId !== "string") {
    return json({ generated: false, reason: "restaurantId em falta" }, 400);
  }
  const servings = Math.min(Math.max(Math.trunc(payload.servings ?? 1), 1), 20);

  // ── Autorização: JWT válido + membro do restaurante ────────────────────────
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ generated: false, reason: "não autenticado" }, 401);
  }
  const userId = userData.user.id;

  const { data: member } = await admin
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("restaurant_id", payload.restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) {
    return json({ generated: false, reason: "sem acesso a este restaurante" }, 403);
  }

  // ── Rate limit: DAILY_LIMIT por restaurante por dia UTC ────────────────────
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await admin
    .from("ai_generations")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", payload.restaurantId)
    .gte("created_at", dayStart);
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return json({
      generated: false,
      reason: `limite diário de ${DAILY_LIMIT} gerações atingido`,
      remaining: 0,
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.info(`[generate-tech-sheet] NO-OP (ANTHROPIC_API_KEY ausente) prato=${dishName}`);
    return json({ generated: false, reason: "ANTHROPIC_API_KEY não configurada" });
  }

  // Despensa: nomes exactos para a IA reutilizar (limpa e limita).
  const pantry = Array.isArray(payload.pantry)
    ? payload.pantry
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim().slice(0, 80))
        .filter((p) => p.length >= 2)
        .slice(0, 60)
    : [];

  const system =
    "És chef executivo de um restaurante português. Escreves fichas técnicas de cozinha " +
    "realistas e práticas, em português de Portugal. Respondes SEMPRE e APENAS com JSON válido, " +
    "sem markdown, sem texto fora do JSON.";

  const user = `Cria a ficha técnica do prato "${dishName}"${
    payload.description ? ` (descrição do menu: "${payload.description}")` : ""
  } para ${servings} dose(s).
${
    pantry.length > 0
      ? `\nDespensa do restaurante — quando um ingrediente corresponder a um destes, usa EXACTAMENTE este nome:\n${pantry.map((p) => `- ${p}`).join("\n")}\n`
      : ""
  }
Devolve JSON com exactamente este schema:
{
  "servings": ${servings},
  "ingredients": [{"name": "string", "qty": number, "unit": "g"|"kg"|"ml"|"l"|"un", "est_cost": {"unit": "kg"|"l"|"un", "cents": number} | null}],
  "steps": ["passo 1", "passo 2", ...],
  "allergens": ["..."],
  "notes": "string ou null"
}

Regras:
- Quantidades realistas de cozinha profissional para ${servings} dose(s); usa "g"/"ml" para pesos/volumes pequenos.
- "est_cost": preço de COMPRA aproximado em Portugal (retalho/grossista) em cêntimos por kg, por litro ou por unidade. Ex.: bacalhau demolhado ~1250/kg, azeite ~600/l, ovo ~25/un. null se não souberes estimar.
- 4 a 12 ingredientes; passos claros e curtos (3 a 8), na ordem de execução.
- "allergens" APENAS destes códigos (Reg. UE 1169/2011): gluten, crustaceos, ovos, peixe, amendoins, soja, leite, frutos_casca, aipo, mostarda, sesamo, sulfitos, tremoco, moluscos. Vazio se nenhum.
- "notes": dica de consistência/empratamento numa frase, ou null.`;

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
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[generate-tech-sheet] Anthropic erro ${res.status}: ${detail.slice(0, 300)}`);
      return json({ generated: false, reason: `anthropic ${res.status}` });
    }

    const data = await res.json();
    // O content pode trazer blocos não-texto (ex.: thinking) antes do texto.
    const blocks: { type?: string; text?: string }[] = Array.isArray(data?.content)
      ? data.content
      : [];
    const text = blocks.find((b) => b?.type === "text")?.text ?? "";
    const draft = parseDraft(text, servings);
    if (!draft) {
      console.error(
        `[generate-tech-sheet] resposta não-parseável (stop=${data?.stop_reason}): ${text.slice(0, 300)}`,
      );
      return json({ generated: false, reason: "resposta da IA não-parseável" });
    }

    // Log de consumo (best-effort: nunca falha a resposta).
    const { error: logError } = await admin.from("ai_generations").insert({
      restaurant_id: payload.restaurantId,
      user_id: userId,
      dish_name: dishName,
      input_tokens: data?.usage?.input_tokens ?? null,
      output_tokens: data?.usage?.output_tokens ?? null,
    });
    if (logError) console.error("[generate-tech-sheet] falha no log:", logError.message);

    return json({ generated: true, sheet: draft, remaining: DAILY_LIMIT - used - 1 });
  } catch (e) {
    console.error("[generate-tech-sheet] falha de rede:", e);
    return json({ generated: false, reason: "erro de rede ao contactar a IA" });
  }
});

// Parsing defensivo: aceita JSON puro ou embrulhado em fences; valida e
// normaliza unidades/alergénios/est_cost; rejeita estruturas fora do schema.
function parseDraft(text: string, servings: number): SheetDraft | null {
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

  const ingredients = Array.isArray(o.ingredients)
    ? o.ingredients
        .map((i) => {
          if (typeof i !== "object" || i === null) return null;
          const r = i as Record<string, unknown>;
          const name = typeof r.name === "string" ? r.name.trim().slice(0, 120) : "";
          const qty = typeof r.qty === "number" && r.qty > 0 ? Math.round(r.qty * 1000) / 1000 : 0;
          const unit = typeof r.unit === "string" && UNITS.has(r.unit) ? r.unit : "un";
          let est: DraftIngredient["est_cost"] = null;
          if (typeof r.est_cost === "object" && r.est_cost !== null) {
            const e = r.est_cost as Record<string, unknown>;
            if (
              typeof e.unit === "string" && COST_UNITS.has(e.unit) &&
              typeof e.cents === "number" && e.cents > 0 && e.cents < 100000
            ) {
              est = { unit: e.unit, cents: Math.round(e.cents) };
            }
          }
          return name && qty > 0 ? { name, qty, unit, est_cost: est } : null;
        })
        .filter((x): x is DraftIngredient => x !== null)
        .slice(0, 20)
    : [];
  if (ingredients.length === 0) return null;

  const steps = Array.isArray(o.steps)
    ? o.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 400)).slice(0, 12)
    : [];

  const allergens = Array.isArray(o.allergens)
    ? [...new Set(o.allergens.filter((a): a is string => typeof a === "string" && ALLERGENS.has(a)))]
    : [];

  const notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 500) : null;

  return { servings, ingredients, steps, allergens, notes };
}
