// Import SAF-T (v0) — o fecho do dia. Recebe o XML do software de facturação,
// põe as linhas de venda em staging (saft_import_lines), casa com pratos via
// pos_product_map, e explode as fichas técnicas (0006) em stock_movements
// 'sale_depletion'. Contrato no fim da migração 0012 + docs/specs.
//
// Operações (POST):
//   { restaurantId, filename, xml }  → ingest: cria o lote, staging, match;
//                                      aplica logo se não houver unmatched.
//   { restaurantId, importId }       → re-apply: re-casa unmatched com o mapa
//                                      actual e aplica os matched.
//
// Regras v0 (decisões 28-07):
//   - Só documentos FT/FS/FR com estado N; NC (notas de crédito) e anulados
//     ficam fora e contam-se no relatório.
//   - Pratos sem ficha técnica: contam e reportam, NÃO abatem.
//   - Linhas de ficha sem ingrediente da despensa (linha livre): ignoradas.
//   - Conversão de unidades só dentro da família (g↔kg, ml↔l); família
//     diferente da do ingrediente conta como não-abatível e reporta-se.
//   - Idempotência: aplicar limpa primeiro os movimentos deste lote (tag
//     'saft_import:<id>' no note; o delete reverte o saldo por trigger 0011).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

interface Payload {
  restaurantId?: string;
  filename?: string;
  xml?: string;
  importId?: string;
}

interface SaftLine {
  invoiceNo: string;
  invoiceDate: string | null;
  posCode: string;
  posDescription: string | null;
  qty: number;
  unitPriceCents: number | null;
}

const ALLOWED_TYPES = new Set(["FT", "FS", "FR"]);
const MAX_XML_BYTES = 4 * 1024 * 1024;

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

// Família de unidades: converte a qty da linha da ficha para a unidade do
// ingrediente (exigida pelos movimentos, 0011). null = famílias diferentes.
function toIngredientUnit(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  if (from === "g" && to === "kg") return qty / 1000;
  if (from === "kg" && to === "g") return qty * 1000;
  if (from === "ml" && to === "l") return qty / 1000;
  if (from === "l" && to === "ml") return qty * 1000;
  return null;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

// deno-lint-ignore no-explicit-any
function parseSaft(xml: string): {
  lines: SaftLine[];
  invoicesCount: number;
  grossTotalCents: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  skippedDocs: number;
} {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false, // tudo string; convertemos nós, sem surpresas de float
  });
  // deno-lint-ignore no-explicit-any
  const doc: any = parser.parse(xml);
  const audit = doc?.AuditFile;
  const invoices = asArray(audit?.SourceDocuments?.SalesInvoices?.Invoice);

  const lines: SaftLine[] = [];
  let invoicesCount = 0;
  let grossTotalCents = 0;
  let grossSeen = false;
  let skippedDocs = 0;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  for (const inv of invoices) {
    const type = String(inv?.InvoiceType ?? "").trim().toUpperCase();
    const status = String(inv?.DocumentStatus?.InvoiceStatus ?? "N").trim().toUpperCase();
    if (!ALLOWED_TYPES.has(type) || status === "A") {
      skippedDocs++;
      continue;
    }
    const invoiceNo = String(inv?.InvoiceNo ?? "").trim();
    if (!invoiceNo) {
      skippedDocs++;
      continue;
    }
    invoicesCount++;
    const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(inv?.InvoiceDate ?? ""))
      ? String(inv.InvoiceDate)
      : null;
    if (invoiceDate) {
      if (!periodStart || invoiceDate < periodStart) periodStart = invoiceDate;
      if (!periodEnd || invoiceDate > periodEnd) periodEnd = invoiceDate;
    }
    const gross = Number(inv?.DocumentTotals?.GrossTotal);
    if (Number.isFinite(gross)) {
      grossTotalCents += Math.round(gross * 100);
      grossSeen = true;
    }
    for (const l of asArray(inv?.Line)) {
      const posCode = String(l?.ProductCode ?? "").trim();
      const qty = Number(l?.Quantity);
      if (!posCode || !Number.isFinite(qty) || qty <= 0) continue;
      const unitPrice = Number(l?.UnitPrice);
      lines.push({
        invoiceNo,
        invoiceDate,
        posCode,
        posDescription: String(l?.ProductDescription ?? "").trim() || null,
        qty: Math.round(qty * 1000) / 1000,
        unitPriceCents: Number.isFinite(unitPrice) ? Math.round(unitPrice * 100) : null,
      });
    }
  }

  return {
    lines,
    invoicesCount,
    grossTotalCents: grossSeen ? grossTotalCents : null,
    periodStart,
    periodEnd,
    skippedDocs,
  };
}

// Explosão das fichas + abate. Idempotente: limpa os movimentos deste lote
// antes de reescrever. Devolve o relatório de aplicação.
async function applyImport(
  admin: SupabaseClient,
  restaurantId: string,
  importId: string,
): Promise<{ ok: true; report: Record<string, unknown> } | { ok: false; error: string }> {
  const tag = `saft_import:${importId}`;

  // Limpeza idempotente: o trigger stock_movements_revert (0011) repõe o saldo.
  const { error: cleanErr } = await admin
    .from("stock_movements")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("source", "saft_import")
    .eq("note", tag);
  if (cleanErr) return { ok: false, error: `limpeza falhou: ${cleanErr.message}` };

  const { data: matched, error: linesErr } = await admin
    .from("saft_import_lines")
    .select("invoice_no, qty, menu_item_id")
    .eq("import_id", importId)
    .eq("status", "matched");
  if (linesErr) return { ok: false, error: `leitura de linhas falhou: ${linesErr.message}` };

  const itemIds = [...new Set((matched ?? []).map((l) => l.menu_item_id as string))];

  const { data: sheets, error: sheetsErr } = itemIds.length
    ? await admin
        .from("tech_sheets")
        .select("menu_item_id, servings, tech_sheet_ingredients(ingredient_id, qty, unit)")
        .eq("restaurant_id", restaurantId)
        .in("menu_item_id", itemIds)
    : { data: [], error: null };
  if (sheetsErr) return { ok: false, error: `leitura de fichas falhou: ${sheetsErr.message}` };

  const sheetByItem = new Map(
    (sheets ?? []).map((s) => [s.menu_item_id as string, s]),
  );

  const ingredientIds = [
    ...new Set(
      (sheets ?? []).flatMap((s) =>
        // deno-lint-ignore no-explicit-any
        asArray((s as any).tech_sheet_ingredients).map((i: any) => i.ingredient_id)
      ).filter(Boolean) as string[],
    ),
  ];
  const { data: ingredients, error: ingErr } = ingredientIds.length
    ? await admin
        .from("ingredients")
        .select("id, name, unit")
        .eq("restaurant_id", restaurantId)
        .in("id", ingredientIds)
    : { data: [], error: null };
  if (ingErr) return { ok: false, error: `leitura da despensa falhou: ${ingErr.message}` };
  const ingById = new Map((ingredients ?? []).map((i) => [i.id as string, i]));

  // Sem ficha: identificar por nome para o relatório ser accionável.
  const noSheetIds = itemIds.filter((id) => !sheetByItem.has(id));
  let noSheetNames: string[] = [];
  if (noSheetIds.length) {
    const { data: items } = await admin
      .from("menu_items")
      .select("id, name")
      .in("id", noSheetIds);
    noSheetNames = (items ?? []).map((i) => i.name as string);
  }

  // Agregar abates por (fatura, ingrediente): source_ref = invoice_no (contrato
  // 0012) sem gerar uma linha por cada ingrediente de cada linha de venda.
  const depletion = new Map<string, { ingredientId: string; invoiceNo: string; qty: number }>();
  const unitMismatch = new Set<string>();
  for (const line of matched ?? []) {
    const sheet = sheetByItem.get(line.menu_item_id as string);
    if (!sheet) continue;
    const servings = Math.max(Number(sheet.servings) || 1, 1);
    // deno-lint-ignore no-explicit-any
    for (const si of asArray((sheet as any).tech_sheet_ingredients)) {
      if (!si.ingredient_id) continue; // linha livre, sem despensa
      const ing = ingById.get(si.ingredient_id as string);
      if (!ing) continue;
      const converted = toIngredientUnit(Number(si.qty), String(si.unit), String(ing.unit));
      if (converted == null) {
        unitMismatch.add(ing.name as string);
        continue;
      }
      const used = (Number(line.qty) * converted) / servings;
      const key = `${line.invoice_no}|${si.ingredient_id}`;
      const cur = depletion.get(key);
      if (cur) cur.qty += used;
      else depletion.set(key, {
        ingredientId: si.ingredient_id as string,
        invoiceNo: line.invoice_no as string,
        qty: used,
      });
    }
  }

  const movements = [...depletion.values()]
    .map((d) => ({
      restaurant_id: restaurantId,
      ingredient_id: d.ingredientId,
      kind: "sale_depletion",
      qty: -(Math.round(d.qty * 1000) / 1000),
      unit: (ingById.get(d.ingredientId)?.unit ?? "un") as string,
      source: "saft_import",
      source_ref: d.invoiceNo,
      note: tag,
    }))
    .filter((m) => m.qty < 0); // arredondado a 0.000 não gera movimento

  if (movements.length) {
    const { error: movErr } = await admin.from("stock_movements").insert(movements);
    if (movErr) return { ok: false, error: `abate falhou: ${movErr.message}` };
  }

  const { error: updErr } = await admin
    .from("saft_imports")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", importId);
  if (updErr) return { ok: false, error: `fecho do lote falhou: ${updErr.message}` };

  return {
    ok: true,
    report: {
      movements: movements.length,
      ingredientsTouched: new Set(movements.map((m) => m.ingredient_id)).size,
      dishesWithoutSheet: noSheetNames,
      unitMismatch: [...unitMismatch],
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ imported: false, reason: "payload inválido" }, 400);
  }
  const restaurantId = payload.restaurantId;
  if (!restaurantId || typeof restaurantId !== "string") {
    return json({ imported: false, reason: "restaurantId em falta" }, 400);
  }

  // ── Autorização: JWT válido + membro do restaurante (padrão da casa) ───────
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ imported: false, reason: "não autenticado" }, 401);
  }
  const { data: member } = await admin
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!member) {
    return json({ imported: false, reason: "sem acesso a este restaurante" }, 403);
  }

  // ── Re-apply de um lote existente (pós-conciliação) ────────────────────────
  if (payload.importId) {
    const { data: imp } = await admin
      .from("saft_imports")
      .select("id, restaurant_id, status")
      .eq("id", payload.importId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!imp) return json({ imported: false, reason: "import não encontrado" }, 404);

    // Re-casar unmatched com o mapa actual (a conciliação criou entradas novas).
    const { data: maps } = await admin
      .from("pos_product_map")
      .select("pos_code, menu_item_id")
      .eq("restaurant_id", restaurantId);
    const mapByCode = new Map((maps ?? []).map((m) => [m.pos_code as string, m.menu_item_id as string]));

    const { data: unmatched } = await admin
      .from("saft_import_lines")
      .select("id, pos_code")
      .eq("import_id", imp.id)
      .eq("status", "unmatched");
    for (const line of unmatched ?? []) {
      const itemId = line.pos_code ? mapByCode.get(line.pos_code as string) : undefined;
      if (itemId) {
        await admin
          .from("saft_import_lines")
          .update({ status: "matched", menu_item_id: itemId })
          .eq("id", line.id);
      }
    }
    const { count: stillUnmatched } = await admin
      .from("saft_import_lines")
      .select("*", { count: "exact", head: true })
      .eq("import_id", imp.id)
      .eq("status", "unmatched");
    const { count: matchedCount } = await admin
      .from("saft_import_lines")
      .select("*", { count: "exact", head: true })
      .eq("import_id", imp.id)
      .eq("status", "matched");

    const applied = await applyImport(admin, restaurantId, imp.id as string);
    if (!applied.ok) {
      await admin.from("saft_imports").update({ status: "failed", error: applied.error }).eq("id", imp.id);
      return json({ imported: false, reason: applied.error }, 500);
    }
    await admin
      .from("saft_imports")
      .update({ matched_count: matchedCount ?? 0, unmatched_count: stillUnmatched ?? 0 })
      .eq("id", imp.id);
    return json({
      imported: true,
      importId: imp.id,
      status: "applied",
      matched: matchedCount ?? 0,
      unmatched: stillUnmatched ?? 0,
      ...applied.report,
    });
  }

  // ── Ingest de um XML novo ──────────────────────────────────────────────────
  const xml = payload.xml;
  if (!xml || typeof xml !== "string") {
    return json({ imported: false, reason: "xml em falta" }, 400);
  }
  if (xml.length > MAX_XML_BYTES) {
    return json({ imported: false, reason: "xml demasiado grande (limite 4 MB)" }, 413);
  }

  let parsed: ReturnType<typeof parseSaft>;
  try {
    parsed = parseSaft(xml);
  } catch (e) {
    return json({ imported: false, reason: `xml não-parseável: ${String(e).slice(0, 200)}` }, 400);
  }
  if (parsed.invoicesCount === 0) {
    return json({ imported: false, reason: "sem documentos FT/FS/FR no ficheiro" }, 400);
  }

  const { data: imp, error: impErr } = await admin
    .from("saft_imports")
    .insert({
      restaurant_id: restaurantId,
      filename: (payload.filename ?? "").slice(0, 200) || null,
      status: "parsing",
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      invoices_count: parsed.invoicesCount,
      lines_count: parsed.lines.length,
      gross_total_cents: parsed.grossTotalCents,
    })
    .select("id")
    .single();
  if (impErr || !imp) {
    return json({ imported: false, reason: `criação do lote falhou: ${impErr?.message}` }, 500);
  }

  const { data: maps } = await admin
    .from("pos_product_map")
    .select("pos_code, menu_item_id")
    .eq("restaurant_id", restaurantId);
  const mapByCode = new Map((maps ?? []).map((m) => [m.pos_code as string, m.menu_item_id as string]));

  const rows = parsed.lines.map((l) => {
    const itemId = mapByCode.get(l.posCode);
    return {
      restaurant_id: restaurantId,
      import_id: imp.id,
      invoice_no: l.invoiceNo,
      invoice_date: l.invoiceDate,
      pos_code: l.posCode,
      pos_description: l.posDescription,
      qty: l.qty,
      unit_price_cents: l.unitPriceCents,
      menu_item_id: itemId ?? null,
      status: itemId ? "matched" : "unmatched",
    };
  });
  const { error: stageErr } = await admin.from("saft_import_lines").insert(rows);
  if (stageErr) {
    await admin.from("saft_imports").update({ status: "failed", error: stageErr.message }).eq("id", imp.id);
    return json({ imported: false, reason: `staging falhou: ${stageErr.message}` }, 500);
  }

  const matchedCount = rows.filter((r) => r.status === "matched").length;
  const unmatchedCount = rows.length - matchedCount;
  const unmatchedCodes = [
    ...new Set(rows.filter((r) => r.status === "unmatched").map((r) => `${r.pos_code} ${r.pos_description ?? ""}`.trim())),
  ];

  await admin
    .from("saft_imports")
    .update({ matched_count: matchedCount, unmatched_count: unmatchedCount })
    .eq("id", imp.id);

  // Com unmatched: fica em review, a fila de conciliação trata; sem abates.
  if (unmatchedCount > 0) {
    await admin.from("saft_imports").update({ status: "review" }).eq("id", imp.id);
    return json({
      imported: true,
      importId: imp.id,
      status: "review",
      invoices: parsed.invoicesCount,
      lines: rows.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      unmatchedCodes,
      skippedDocs: parsed.skippedDocs,
    });
  }

  const applied = await applyImport(admin, restaurantId, imp.id as string);
  if (!applied.ok) {
    await admin.from("saft_imports").update({ status: "failed", error: applied.error }).eq("id", imp.id);
    return json({ imported: false, reason: applied.error }, 500);
  }
  return json({
    imported: true,
    importId: imp.id,
    status: "applied",
    invoices: parsed.invoicesCount,
    lines: rows.length,
    matched: matchedCount,
    unmatched: 0,
    skippedDocs: parsed.skippedDocs,
    ...applied.report,
  });
});
