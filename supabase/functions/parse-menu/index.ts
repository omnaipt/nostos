// Parse do menu por foto/PDF (onboarding de restaurante novo) — a peça que
// fecha o enrollment (logo ✓ tema ✓ tom ✓ menu). Edge-irmã do parse-invoice:
// mesmo padrão de auth, rate limit, JSON estrito anti-invenção e módulo puro
// partilhado (./draft.ts).
//
// PRINCÍPIO: o parse NUNCA publica sozinho. O draft validado fica em STAGING
// (menu_imports, status 'review', payload jsonb da 0019); publicar é acção do
// dono no ecrã de revisão do Zé, via publish_menu_import (transaccional).
// menu_categories/menu_items NUNCA são tocados por esta edge.
//
// Modos:
//   • "menu" (default): carta de comida. Páginas que pareçam carta de VINHOS
//     são ignoradas e sinalizadas (wines_detected) — importam-se em passo
//     separado.
//   • "wine_list": só vinhos, com a convenção "Região · castas · perfil" na
//     descrição (Spec_Sommelier_Gestao_Carta); staging com source_kind
//     wine_list.
//
// Auth JWT + membership; rate limit 10/dia por tenant (ai_generations,
// prefixo [menu] — menus são maiores/caros que faturas).
// GATE: ANTHROPIC_API_KEY (secret). Sem key → { parsed:false } (no-op).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseMenuDraft } from "./draft.ts";

interface PayloadFile {
  kind: "pdf" | "image";
  mediaType: string;
  dataBase64: string;
}

interface Payload {
  restaurantId: string;
  files: PayloadFile[];
  mode?: "menu" | "wine_list";
  sourceRef?: string; // nome do ficheiro, para o rasto do lote
}

const DAILY_LIMIT = 10;
const MAX_FILES = 8; // menus têm mais páginas que faturas
const MAX_TOTAL_BASE64 = 20_000_000; // ~14 MB de ficheiros
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
    return json({ parsed: false, reason: "payload inválido" }, 400);
  }
  if (!payload.restaurantId || typeof payload.restaurantId !== "string") {
    return json({ parsed: false, reason: "restaurantId em falta" }, 400);
  }
  const mode = payload.mode === "wine_list" ? "wine_list" : "menu";
  const files = Array.isArray(payload.files) ? payload.files.slice(0, MAX_FILES) : [];
  if (files.length === 0) {
    return json({ parsed: false, reason: "sem ficheiros" }, 400);
  }
  const hasPdf = files.some((f) => f.kind === "pdf");
  if (hasPdf && files.length > 1) {
    return json({ parsed: false, reason: "PDF vai sozinho (1 ficheiro) ou fotos (até 8)" }, 400);
  }
  let total = 0;
  for (const f of files) {
    if (typeof f.dataBase64 !== "string" || f.dataBase64.length === 0) {
      return json({ parsed: false, reason: "ficheiro vazio" }, 400);
    }
    if (f.kind === "pdf" && f.mediaType !== "application/pdf") {
      return json({ parsed: false, reason: "PDF com media type errado" }, 400);
    }
    if (f.kind === "image" && !IMAGE_TYPES.has(f.mediaType)) {
      return json({ parsed: false, reason: `formato de imagem não suportado: ${f.mediaType}` }, 400);
    }
    total += f.dataBase64.length;
  }
  if (total > MAX_TOTAL_BASE64) {
    return json({ parsed: false, reason: "ficheiros demasiado grandes (máx ~14 MB)" }, 400);
  }

  // ── Autorização: JWT válido + membro do restaurante ────────────────────────
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ parsed: false, reason: "não autenticado" }, 401);
  }
  const { data: member } = await admin
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("restaurant_id", payload.restaurantId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!member) {
    return json({ parsed: false, reason: "sem acesso a este restaurante" }, 403);
  }

  // ── Rate limit: DAILY_LIMIT parses de menu/dia por tenant ──────────────────
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await admin
    .from("ai_generations")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", payload.restaurantId)
    .like("dish_name", "[menu]%")
    .gte("created_at", dayStart);
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return json({
      parsed: false,
      reason: `limite diário de ${DAILY_LIMIT} leituras de menu atingido`,
      remaining: 0,
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.info("[parse-menu] NO-OP (ANTHROPIC_API_KEY ausente)");
    return json({ parsed: false, reason: "ANTHROPIC_API_KEY não configurada" });
  }

  const system =
    "És um digitalizador de menus de restaurantes portugueses. Lês fotos/PDFs de " +
    "cartas e extrais a estrutura em JSON estrito. REGRA ABSOLUTA: nunca inventes " +
    "pratos, preços nem alergénios; ilegível ou ambíguo = null/needs_review com note. " +
    "Respondes SEMPRE e APENAS com JSON válido, sem markdown, sem texto fora do JSON.";

  const schema = `{
  "categories": [{
    "name": "nome da secção como está na carta",
    "items": [{
      "name": "nome do prato",
      "description": "descrição/ingredientes" | null,
      "price_type": "fixed"|"per_kg"|"market"|"variants",
      "price_cents": number | null,
      "variants": [{"label": "2 pax"|"dose"|"½ dose"|..., "price_cents": number|null, "serves": number|null}],
      "serves": number | null,
      "allergens_suggested": ["gluten"|"crustaceos"|"ovos"|"peixe"|"amendoins"|"soja"|"leite"|"frutos_casca"|"aipo"|"mostarda"|"sesamo"|"sulfitos"|"tremoco"|"moluscos"],
      "confidence": "alta"|"media"|"baixa",
      "needs_review": boolean,
      "note": "string" | null
    }]
  }],
  "wines_detected": boolean
}`;

  const menuRules = `Regras (taxonomia real de menus PT):
- "price_type": dois preços "2 pax/1 pax" ou "dose/½ dose" → "variants" (preços nas variants, price_cents null); "€/kg" → "per_kg"; "preço do dia"/"consultar"/"s/ cotação" → "market" (price_cents null); um preço único → "fixed". Na DÚVIDA → "fixed" com needs_review true e note.
- Preços em cêntimos (12,50 € → 1250). Preço ilegível = null + needs_review + note; NUNCA estimes.
- "allergens_suggested": SUGESTÃO pela descrição do prato (só códigos da lista); o dono confirma depois. Vazio se incerto.
- Categorias pela ordem do documento; itens pela ordem dentro da secção.
- Página/secção que pareça CARTA DE VINHOS (castas, regiões, garrafa/copo): NÃO extraias essas linhas — devolve "wines_detected": true e segue; os vinhos importam-se em passo separado.
- Linha ilegível: name com o que se lê, resto null, confidence "baixa", note "ilegível".`;

  const wineRules = `Regras (modo CARTA DE VINHOS):
- Extrai APENAS vinhos. Categorias = secções da carta (ex.: "Vinhos Tintos", "Vinhos Brancos", "Espumantes").
- "description" OBRIGATORIAMENTE na convenção "Região · castas · perfil" (ex.: "Douro · Touriga Nacional · encorpado"); campo em falta na carta → omite esse segmento, nunca inventes.
- Preço da garrafa como "fixed" em price_cents; se houver garrafa E copo, "variants" com labels "garrafa" e "copo". Preço ilegível = null + needs_review.
- "wines_detected": true. "allergens_suggested": ["sulfitos"] só se a carta o indicar; senão vazio.
- Comida no meio da carta: ignora e assinala em note na primeira linha afectada.`;

  const content: unknown[] = files.map((f) =>
    f.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.dataBase64 } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.dataBase64 } }
  );
  content.push({
    type: "text",
    text: `Extrai ${mode === "wine_list" ? "esta carta de vinhos" : "este menu"} para JSON com exactamente este schema:\n${schema}\n\n${mode === "wine_list" ? wineRules : menuRules}`,
  });

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
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[parse-menu] Anthropic erro ${res.status}: ${detail.slice(0, 300)}`);
      return json({ parsed: false, reason: `anthropic ${res.status}` });
    }

    const data = await res.json();
    const blocks: { type?: string; text?: string }[] = Array.isArray(data?.content)
      ? data.content
      : [];
    const text = blocks.find((b) => b?.type === "text")?.text ?? "";
    const draft = parseMenuDraft(text);
    if (!draft) {
      console.error(
        `[parse-menu] resposta não-parseável (stop=${data?.stop_reason}): ${text.slice(0, 300)}`,
      );
      return json({ parsed: false, reason: "resposta da IA não-parseável" });
    }

    // ── STAGING: o draft vive em menu_imports; publicar é do dono (Zé) ───────
    const sourceKind = mode === "wine_list" ? "wine_list" : hasPdf ? "pdf" : "photo";
    const { data: importRow, error: importError } = await admin
      .from("menu_imports")
      .insert({
        restaurant_id: payload.restaurantId,
        source_kind: sourceKind,
        source_ref: (payload.sourceRef ?? "").trim().slice(0, 200) || null,
        status: "review",
        payload: draft,
        items_count: draft.items_count,
        flagged_count: draft.flagged_count,
      })
      .select("id")
      .single();
    if (importError || !importRow) {
      console.error("[parse-menu] falha no staging:", importError?.message);
      return json({ parsed: false, reason: "falha a guardar o rascunho" });
    }

    // Log de consumo (best-effort). Prefixo [menu] separa o limite.
    const { error: logError } = await admin.from("ai_generations").insert({
      restaurant_id: payload.restaurantId,
      user_id: userData.user.id,
      dish_name: `[menu] ${sourceKind} ${draft.items_count} itens`.slice(0, 120),
      input_tokens: data?.usage?.input_tokens ?? null,
      output_tokens: data?.usage?.output_tokens ?? null,
    });
    if (logError) console.error("[parse-menu] falha no log:", logError.message);

    return json({
      parsed: true,
      import_id: importRow.id,
      draft,
      remaining: DAILY_LIMIT - used - 1,
    });
  } catch (e) {
    console.error("[parse-menu] falha de rede:", e);
    return json({ parsed: false, reason: "erro de rede ao contactar a IA" });
  }
});
