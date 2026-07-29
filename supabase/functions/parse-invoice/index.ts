// Parse de faturas de fornecedor (PDF ou fotos) → entrada pré-preenchida.
//
// PRINCÍPIO INEGOCIÁVEL (David 29-07): o parse NUNCA regista sozinho. A edge
// é PURA — bytes → JSON — e o resultado pré-preenche o formulário de /entradas;
// o dono revê, corrige e carrega em "Registar entrada". Nada é escrito na BD
// (excepto o log de consumo ai_generations).
//
// Irmã do parse-menu (Spec_Parse_Menu_EdgeFunction): JSON estrito, regras
// anti-invenção (ilegível = null + note, nunca estimado), custos SEM IVA
// quando a fatura discrimina (Makro/Recheio discriminam; só total c/IVA →
// null + note e o dono decide). Matching ao catálogo: exacto → contenção
// ÚNICA (padrão sommelier v3) em match.ts.
//
// Cascata de matching (match.ts, módulo puro partilhado): alias do fornecedor
// (0018, aprendido da confirmação do dono — VERDE) → norma exacta (VERDE) →
// contenção única (ÂMBAR) → sugestão do modelo (ÂMBAR) → vazio. A guarda de
// unidade despromove para âmbar; nunca se converte à sorte.
//
// Auth: JWT + membership (padrão generate-tech-sheet). Rate limit: 20/dia por
// tenant, mesma tabela ai_generations com prefixo [fatura] no dish_name.
// GATE: ANTHROPIC_API_KEY (secret). Sem key → { parsed:false } (no-op).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type CatalogIngredient,
  matchLine,
  norm,
  normalizeUnit,
  type ParsedLine,
  type SupplierAlias,
} from "./match.ts";

interface PayloadFile {
  kind: "pdf" | "image";
  mediaType: string; // application/pdf | image/jpeg | image/png | image/webp
  dataBase64: string;
}

interface Payload {
  restaurantId: string;
  files: PayloadFile[];
  // Catálogo do tenant (o cliente manda; evita service role para leitura).
  ingredients: CatalogIngredient[];
}

const DAILY_LIMIT = 20;
const MAX_FILES = 5;
const MAX_TOTAL_BASE64 = 14_000_000; // ~10 MB de ficheiro; margem p/ payload
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
  const files = Array.isArray(payload.files) ? payload.files.slice(0, MAX_FILES) : [];
  if (files.length === 0) {
    return json({ parsed: false, reason: "sem ficheiros" }, 400);
  }
  const hasPdf = files.some((f) => f.kind === "pdf");
  if (hasPdf && files.length > 1) {
    return json({ parsed: false, reason: "PDF vai sozinho (1 ficheiro) ou fotos (até 5)" }, 400);
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
    return json({ parsed: false, reason: "ficheiros demasiado grandes (máx ~10 MB)" }, 400);
  }
  const catalog: CatalogIngredient[] = Array.isArray(payload.ingredients)
    ? payload.ingredients
        .filter((i) => i && typeof i.id === "string" && typeof i.name === "string" && typeof i.unit === "string")
        .slice(0, 300)
    : [];

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

  // ── Rate limit: DAILY_LIMIT parses/dia por tenant (prefixo [fatura]) ───────
  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const { count } = await admin
    .from("ai_generations")
    .select("*", { count: "exact", head: true })
    .eq("restaurant_id", payload.restaurantId)
    .like("dish_name", "[fatura]%")
    .gte("created_at", dayStart);
  const used = count ?? 0;
  if (used >= DAILY_LIMIT) {
    return json({
      parsed: false,
      reason: `limite diário de ${DAILY_LIMIT} leituras de fatura atingido`,
      remaining: 0,
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.info("[parse-invoice] NO-OP (ANTHROPIC_API_KEY ausente)");
    return json({ parsed: false, reason: "ANTHROPIC_API_KEY não configurada" });
  }

  const system =
    "És um assistente de contabilidade de um restaurante português. Lês faturas de " +
    "fornecedor (por vezes em espanhol — Makro) e extrais os dados em JSON estrito. " +
    "REGRA ABSOLUTA: nunca inventes nem estimes valores. Campo ilegível, ausente ou " +
    "ambíguo = null com uma note curta a explicar. Respondes SEMPRE e APENAS com JSON " +
    "válido, sem markdown, sem texto fora do JSON.";

  const catalogNames = catalog.map((c) => c.name);
  const instructions = `Extrai desta fatura de fornecedor:
{
  "supplier": "nome do fornecedor" | null,
  "invoice_number": "nº da fatura" | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "lines": [{
    "raw_name": "descrição EXACTA da linha na fatura",
    "qty": number | null,
    "unit": "kg"|"g"|"l"|"ml"|"un" | null,
    "unit_cost_cents_ex_vat": number | null,
    "confidence": "alta"|"media"|"baixa",
    "note": "string" | null,
    "catalog_match": "nome EXACTO do catálogo" | null
  }]
}

Regras:
- APENAS linhas de PRODUTOS (alimentares ou consumíveis). Ignora portes, taxas, descontos globais, linhas de IVA e totais.
- "unit_cost_cents_ex_vat": custo UNITÁRIO sem IVA, em cêntimos. Se a fatura discrimina o preço s/IVA (Makro e Recheio discriminam), usa-o. Se SÓ houver valor c/IVA, devolve null com note "só valor c/IVA: X €". NUNCA calcules tu a remoção do IVA.
- "unit": normaliza para kg/g/l/ml/un só quando inequívoco (KGS→kg, UD→un, GR→g...); senão null com note.
- "qty": a quantidade na unidade indicada. Embalagens (ex.: "2x5kg") → qty total (10) unit kg, com note.
- Linha ilegível (foto tremida, dobra): raw_name com o que se lê, resto null, confidence "baixa", note "ilegível".
- "confidence": "alta" = tudo legível e inequívoco; "media" = alguma interpretação; "baixa" = pouco fiável.
- Datas em qualquer formato → YYYY-MM-DD; ambígua (ex.: 03/04) → null com note.
${
    catalogNames.length > 0
      ? `- "catalog_match": se a linha corresponde CLARAMENTE a um destes produtos do catálogo do restaurante, o nome EXACTO dele; senão null. Na dúvida ("gel" vs "gelado"), null — nunca adivinhes:\n${catalogNames.map((n) => `  - ${n}`).join("\n")}`
      : `- "catalog_match": sempre null (sem catálogo fornecido).`
  }`;

  const content: unknown[] = files.map((f) =>
    f.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.dataBase64 } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.dataBase64 } }
  );
  content.push({ type: "text", text: instructions });

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
        max_tokens: 8000,
        system,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[parse-invoice] Anthropic erro ${res.status}: ${detail.slice(0, 300)}`);
      return json({ parsed: false, reason: `anthropic ${res.status}` });
    }

    const data = await res.json();
    const blocks: { type?: string; text?: string }[] = Array.isArray(data?.content)
      ? data.content
      : [];
    const text = blocks.find((b) => b?.type === "text")?.text ?? "";
    const parsed = parseInvoice(text);
    if (!parsed) {
      console.error(
        `[parse-invoice] resposta não-parseável (stop=${data?.stop_reason}): ${text.slice(0, 300)}`,
      );
      return json({ parsed: false, reason: "resposta da IA não-parseável" });
    }

    // Aliases do fornecedor (0018): decididos pelo dono em faturas anteriores.
    // Chave = supplier_norm do PARSE (estável entre faturas do mesmo fornecedor).
    const supplierNorm = parsed.supplier ? norm(parsed.supplier) : null;
    let aliases: SupplierAlias[] = [];
    if (supplierNorm) {
      const { data: aliasRows } = await admin
        .from("supplier_product_aliases")
        .select("raw_name_norm, ingredient_id")
        .eq("restaurant_id", payload.restaurantId)
        .eq("supplier_norm", supplierNorm)
        .limit(500);
      aliases = (aliasRows ?? []) as SupplierAlias[];
    }

    // Cascata: alias → exacto → contenção única → sugestão do modelo → vazio.
    const lines = parsed.lines.map((l) => matchLine(l, catalog, aliases));

    // Log de consumo (best-effort). Prefixo [fatura] separa o limite do das fichas.
    const { error: logError } = await admin.from("ai_generations").insert({
      restaurant_id: payload.restaurantId,
      user_id: userData.user.id,
      dish_name: `[fatura] ${parsed.supplier ?? "sem fornecedor"} ${parsed.invoice_number ?? ""}`.trim().slice(0, 120),
      input_tokens: data?.usage?.input_tokens ?? null,
      output_tokens: data?.usage?.output_tokens ?? null,
    });
    if (logError) console.error("[parse-invoice] falha no log:", logError.message);

    return json({
      parsed: true,
      supplier: parsed.supplier,
      // O cliente usa esta norma para a APRENDIZAGEM (upsert de aliases no
      // Registar entrada) — estável entre faturas do mesmo fornecedor.
      supplier_norm: supplierNorm,
      invoice_number: parsed.invoice_number,
      invoice_date: parsed.invoice_date,
      lines,
      remaining: DAILY_LIMIT - used - 1,
    });
  } catch (e) {
    console.error("[parse-invoice] falha de rede:", e);
    return json({ parsed: false, reason: "erro de rede ao contactar a IA" });
  }
});

interface ParsedInvoice {
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  lines: ParsedLine[];
}

// Parsing defensivo (mesmo padrão do generate-tech-sheet): JSON puro ou em
// fences; valida tipos; unidades re-normalizadas do nosso lado (não confiamos
// que o modelo cumpra o enum).
function parseInvoice(text: string): ParsedInvoice | null {
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

  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  const date = str(o.invoice_date, 10);
  const dateOk = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;

  const lines: ParsedLine[] = Array.isArray(o.lines)
    ? o.lines
        .map((l): ParsedLine | null => {
          if (typeof l !== "object" || l === null) return null;
          const r = l as Record<string, unknown>;
          const rawName = str(r.raw_name, 200);
          if (!rawName) return null;
          const qty = typeof r.qty === "number" && r.qty > 0 && r.qty < 100000
            ? Math.round(r.qty * 1000) / 1000
            : null;
          const cost = typeof r.unit_cost_cents_ex_vat === "number" &&
              r.unit_cost_cents_ex_vat > 0 && r.unit_cost_cents_ex_vat < 10_000_000
            ? Math.round(r.unit_cost_cents_ex_vat * 100) / 100
            : null;
          const confidence = r.confidence === "alta" || r.confidence === "media" || r.confidence === "baixa"
            ? r.confidence
            : "baixa";
          return {
            raw_name: rawName,
            qty,
            unit: normalizeUnit(typeof r.unit === "string" ? r.unit : null),
            unit_cost_cents_ex_vat: cost,
            confidence,
            note: str(r.note, 300),
            catalog_match: str(r.catalog_match, 120),
          };
        })
        .filter((x): x is ParsedLine => x !== null)
        .slice(0, 80)
    : [];

  return {
    supplier: str(o.supplier, 120),
    invoice_number: str(o.invoice_number, 60),
    invoice_date: dateOk,
    lines,
  };
}
