// Traduzir menu (v1) — escreve o RASCUNHO das traduções do menu para EN/ES/FR.
// O português é a base e nunca é tocado. O dono revê e valida; só depois é que
// a tradução chega ao cliente (0025).
//
// Duas regras que valem mais do que o resto do ficheiro:
//
// 1. NÃO INVENTA DESCRIÇÕES. Muitas ementas portuguesas têm o nome do prato e
//    mais nada. Um modelo a quem se pede "traduz a descrição" escreve de bom
//    grado uma descrição que ninguém aprovou, e o cliente lê à mesa uma promessa
//    que a cozinha não fez. Sem descrição em português, a descrição traduzida
//    fica null.
//
// 2. NÃO DESTRÓI TRABALHO HUMANO. Linhas já validadas pelo dono, ou editadas à
//    mão, não são substituídas por uma nova geração.
//
// GATE: ANTHROPIC_API_KEY (secret). Sem key devolve { translated:false }.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Lang = "en" | "es" | "fr";

interface Payload {
  restaurantId: string;
  langs?: Lang[];
}

const LANGS: Lang[] = ["en", "es", "fr"];
const LANG_NAME: Record<Lang, string> = {
  en: "inglês",
  es: "espanhol",
  fr: "francês",
};

const DAILY_LIMIT = 25;
const ITEM_BATCH = 40;

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ translated: false, reason: "payload inválido" }, 400);
  }
  if (!payload.restaurantId || typeof payload.restaurantId !== "string") {
    return json({ translated: false, reason: "restaurantId em falta" }, 400);
  }
  const langs = (Array.isArray(payload.langs) ? payload.langs : LANGS).filter(
    (l): l is Lang => LANGS.includes(l as Lang),
  );
  if (langs.length === 0) {
    return json({ translated: false, reason: "nenhum idioma válido pedido" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ translated: false, reason: "não autenticado" }, 401);
  }
  const { data: member } = await admin
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("restaurant_id", payload.restaurantId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!member) {
    return json({ translated: false, reason: "sem acesso a este restaurante" }, 403);
  }

  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await admin
    .from("ai_generations")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", payload.restaurantId)
    .gte("created_at", dayStart);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ translated: false, reason: `limite diário de ${DAILY_LIMIT} gerações atingido` });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.info("[translate-menu] NO-OP (ANTHROPIC_API_KEY ausente)");
    return json({ translated: false, reason: "ANTHROPIC_API_KEY não configurada" });
  }

  const { data: cats } = await admin
    .from("menu_categories")
    .select("id, label")
    .eq("restaurant_id", payload.restaurantId)
    .eq("active", true);
  const { data: items } = await admin
    .from("menu_items")
    .select("id, name, description")
    .eq("restaurant_id", payload.restaurantId)
    .eq("active", true);
  const { data: variants } = await admin
    .from("menu_item_variants")
    .select("id, label")
    .eq("restaurant_id", payload.restaurantId);

  if (!items?.length && !cats?.length) {
    return json({ translated: false, reason: "ementa vazia" }, 400);
  }

  // Linhas intocáveis: validadas pelo dono ou escritas à mão.
  const { data: locked } = await admin
    .from("menu_translations")
    .select("entity_type, entity_id, lang")
    .eq("restaurant_id", payload.restaurantId)
    .or("status.eq.validada,source.eq.manual");
  const isLocked = new Set(
    (locked ?? []).map((l) => `${l.lang}:${l.entity_type}:${l.entity_id}`),
  );

  const system =
    "És tradutor profissional de ementas de restaurantes portugueses. Traduzes para clientes " +
    "estrangeiros que estão à mesa e vão decidir o que comer pelo que leem. Respondes SEMPRE e " +
    "APENAS com JSON válido, sem markdown, sem texto fora do JSON.";

  const rules = (langName: string) => `Traduz para ${langName}.

Regras, por ordem de importancia:
1. NUNCA inventes. Se um prato nao tiver descricao em portugues, a descricao traduzida e null. Nao escrevas descricoes novas, nao acrescentes adjectivos, nao sugiras ingredientes que nao estejam escritos.
2. Pratos tradicionais portugueses sem equivalente real (Bacalhau a Bras, Acorda, Cataplana, Bulhao Pato) MANTEM o nome em portugues. Se houver descricao em portugues, e ai que explicas o prato em poucas palavras. O nome e o nome da casa.
3. Vinhos: nomes de produtores, quintas, regioes, castas e denominacoes ficam EXACTAMENTE como estao. So se traduz a parte generica (Branco, Tinto, Rose, Espumante, Doce) e a descricao.
4. Doses e formatos traduzem-se: "2 pax" para 2 pessoas no idioma de destino, "Dose" para dose inteira, "1/2 dose" para meia dose, "Jarro 0,5" para jarro de meio litro.
5. Linguagem de ementa: curta, concreta, sem publicidade. Quem le esta de pe ou a mesa com fome.
6. Devolve EXACTAMENTE os mesmos ids que recebeste. Nao acrescentes nem retires entradas.`;

  const results: Record<string, { itens: number; categorias: number; doses: number }> = {};
  let totalIn = 0;
  let totalOut = 0;

  for (const lang of langs) {
    const rows: Record<string, unknown>[] = [];

    const catsToDo = (cats ?? []).filter((c) => !isLocked.has(`${lang}:category:${c.id}`));
    const varsToDo = (variants ?? []).filter((v) => !isLocked.has(`${lang}:variant:${v.id}`));
    const itemsToDo = (items ?? []).filter((i) => !isLocked.has(`${lang}:item:${i.id}`));

    const batches = itemsToDo.length ? chunk(itemsToDo, ITEM_BATCH) : [[]];

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const primeira = b === 0;
      const user = `${rules(LANG_NAME[lang])}

${
        primeira
          ? `CATEGORIAS (traduz o rotulo):\n${JSON.stringify(
              catsToDo.map((c) => ({ id: c.id, label: c.label })),
            )}\n\nDOSES E FORMATOS (traduz o rotulo):\n${JSON.stringify(
              varsToDo.map((v) => ({ id: v.id, label: v.label })),
            )}\n\n`
          : ""
      }PRATOS (traduz o nome e, se existir, a descricao):
${JSON.stringify(batch.map((i) => ({ id: i.id, name: i.name, description: i.description })))}

Devolve JSON com este schema exacto:
{
  "categories": [{"id": "uuid", "name": "string"}],
  "items": [{"id": "uuid", "name": "string", "description": "string ou null"}],
  "variants": [{"id": "uuid", "label": "string"}]
}
${primeira ? "" : 'Nesta leva envia "categories": [] e "variants": [].'}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 8000,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`[translate-menu] anthropic ${res.status}: ${body.slice(0, 300)}`);
        return json({ translated: false, reason: `falha do modelo (${res.status})` }, 502);
      }
      const data = await res.json();
      totalIn += data?.usage?.input_tokens ?? 0;
      totalOut += data?.usage?.output_tokens ?? 0;

      const text: string = (data?.content ?? [])
        .filter((x: { type?: string }) => x?.type === "text")
        .map((x: { text?: string }) => x?.text ?? "")
        .join("")
        .trim();
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s < 0 || e <= s) {
        return json({ translated: false, reason: "resposta do modelo nao era JSON" }, 502);
      }
      let parsed: {
        categories?: { id: string; name: string }[];
        items?: { id: string; name: string; description: string | null }[];
        variants?: { id: string; label: string }[];
      };
      try {
        parsed = JSON.parse(text.slice(s, e + 1));
      } catch {
        return json({ translated: false, reason: "JSON do modelo invalido" }, 502);
      }

      // Whitelist por id: o que nao estava no pedido nao entra na base de dados.
      const catIds = new Set(catsToDo.map((c) => c.id));
      const varIds = new Set(varsToDo.map((v) => v.id));
      const itemIds = new Set(batch.map((i) => i.id));
      // Descricao so sai se existir descricao em portugues (regra 1).
      const hasDesc = new Map(batch.map((i) => [i.id, !!(i.description ?? "").trim()]));
      const now = new Date().toISOString();

      for (const c of parsed.categories ?? []) {
        if (!catIds.has(c?.id)) continue;
        const name = clean(c.name, 120);
        if (!name) continue;
        rows.push({
          restaurant_id: payload.restaurantId,
          entity_type: "category",
          entity_id: c.id,
          lang,
          name,
          description: null,
          source: "ai",
          status: "rascunho",
          updated_at: now,
        });
      }
      for (const v of parsed.variants ?? []) {
        if (!varIds.has(v?.id)) continue;
        const name = clean(v.label, 80);
        if (!name) continue;
        rows.push({
          restaurant_id: payload.restaurantId,
          entity_type: "variant",
          entity_id: v.id,
          lang,
          name,
          description: null,
          source: "ai",
          status: "rascunho",
          updated_at: now,
        });
      }
      for (const it of parsed.items ?? []) {
        if (!itemIds.has(it?.id)) continue;
        const name = clean(it.name, 200);
        if (!name) continue;
        rows.push({
          restaurant_id: payload.restaurantId,
          entity_type: "item",
          entity_id: it.id,
          lang,
          name,
          description: hasDesc.get(it.id) ? clean(it.description, 600) : null,
          source: "ai",
          status: "rascunho",
          updated_at: now,
        });
      }
    }

    if (rows.length) {
      const { error } = await admin
        .from("menu_translations")
        .upsert(rows, { onConflict: "restaurant_id,entity_type,entity_id,lang" });
      if (error) {
        return json({ translated: false, reason: `gravacao falhou: ${error.message}` }, 500);
      }
    }
    results[lang] = {
      itens: rows.filter((r) => r.entity_type === "item").length,
      categorias: rows.filter((r) => r.entity_type === "category").length,
      doses: rows.filter((r) => r.entity_type === "variant").length,
    };
  }

  await admin.from("ai_generations").insert({
    restaurant_id: payload.restaurantId,
    user_id: userData.user.id,
    dish_name: `traduzir-ementa:${langs.join("+")}`,
    input_tokens: totalIn,
    output_tokens: totalOut,
  });

  return json({ translated: true, results });
});
