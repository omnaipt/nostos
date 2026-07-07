// Ficha Técnica IA — gera o PRIMEIRO RASCUNHO da ficha técnica de um prato
// (ingredientes com quantidades, passos, alergénios UE) a partir do nome e
// descrição. O chef corrige, não escreve do zero (bandeira do lançamento 1-Set).
//
// GATE: precisa de ANTHROPIC_API_KEY (secret do projeto). Sem key, devolve
// { generated:false, reason } com 200 — no-op observável, nunca quebra a UI.
// A função NÃO escreve na base de dados: devolve o rascunho e o cliente
// grava via RLS (tenant-scoped). verify_jwt: só staff autenticado chama.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface Payload {
  dishName: string;
  description?: string | null;
  servings?: number;
}

interface SheetDraft {
  servings: number;
  ingredients: { name: string; qty: number; unit: string }[];
  steps: string[];
  allergens: string[];
  notes: string | null;
}

const UNITS = new Set(["g", "kg", "ml", "l", "un"]);
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
  const servings = Math.min(Math.max(Math.trunc(payload.servings ?? 1), 1), 20);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.info(`[generate-tech-sheet] NO-OP (ANTHROPIC_API_KEY ausente) prato=${dishName}`);
    return json({ generated: false, reason: "ANTHROPIC_API_KEY não configurada" });
  }

  const system =
    "És chef executivo de um restaurante português. Escreves fichas técnicas de cozinha " +
    "realistas e práticas, em português de Portugal. Respondes SEMPRE e APENAS com JSON válido, " +
    "sem markdown, sem texto fora do JSON.";

  const user = `Cria a ficha técnica do prato "${dishName}"${
    payload.description ? ` (descrição do menu: "${payload.description}")` : ""
  } para ${servings} dose(s).

Devolve JSON com exactamente este schema:
{
  "servings": ${servings},
  "ingredients": [{"name": "string", "qty": number, "unit": "g"|"kg"|"ml"|"l"|"un"}],
  "steps": ["passo 1", "passo 2", ...],
  "allergens": ["..."],
  "notes": "string ou null"
}

Regras:
- Quantidades realistas de cozinha profissional para ${servings} dose(s); usa "g"/"ml" para pesos/volumes pequenos.
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
        max_tokens: 2500,
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
    // O content pode trazer blocos não-texto (ex.: thinking) antes do texto:
    // procurar explicitamente o primeiro bloco type==="text".
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
    return json({ generated: true, sheet: draft });
  } catch (e) {
    console.error("[generate-tech-sheet] falha de rede:", e);
    return json({ generated: false, reason: "erro de rede ao contactar a IA" });
  }
});

// Parsing defensivo: aceita JSON puro ou embrulhado em fences; valida e
// normaliza unidades/alergénios; rejeita estruturas fora do schema.
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
          return name && qty > 0 ? { name, qty, unit } : null;
        })
        .filter((x): x is { name: string; qty: number; unit: string } => x !== null)
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
