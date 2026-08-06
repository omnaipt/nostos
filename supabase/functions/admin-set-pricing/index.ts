// admin-set-pricing (POST) — muda plano e/ou condição especial (override).
// Payload: {tenant_id, plan_code?, override?: {price_cents, reason_code, reason_note, until?} | null, actor_email}
// Resposta: {ok, effective_price_cents}
import { authenticate, audit, json, requireFields, serviceClient } from "./admin.ts";

const REASONS = ["estrategico", "volume", "outro"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(auth.rawBody);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const missing = requireFields(body, ["tenant_id", "actor_email"]);
  if (missing) return json(400, { error: `missing_field:${missing}` });

  const tenant_id = String(body.tenant_id);
  const actor_email = String(body.actor_email);
  const db = serviceClient();

  const patch: Record<string, unknown> = {};

  // Mudança de plano (opcional).
  if (body.plan_code !== undefined) {
    const plan_code = String(body.plan_code);
    const { data: plan } = await db.from("product_plans")
      .select("code").eq("code", plan_code).eq("active", true).maybeSingle();
    if (!plan) return json(400, { error: "unknown_plan" });
    patch.plan_code = plan_code;
  }

  // Override (opcional): objecto = definir/actualizar; null = remover.
  if ("override" in body) {
    const ov = body.override as Record<string, unknown> | null;
    if (ov === null) {
      patch.price_override_cents = null;
      patch.override_reason_code = null;
      patch.override_reason_note = null;
      patch.override_until = null;
    } else {
      const price_cents = Number(ov.price_cents);
      const reason_code = String(ov.reason_code ?? "");
      if (!Number.isInteger(price_cents) || price_cents < 0) {
        return json(400, { error: "invalid_price_cents" });
      }
      if (!REASONS.includes(reason_code)) return json(400, { error: "invalid_reason_code" });
      patch.price_override_cents = price_cents;
      patch.override_reason_code = reason_code;
      patch.override_reason_note = ov.reason_note != null ? String(ov.reason_note) : null;
      patch.override_until = ov.until != null ? String(ov.until) : null;
    }
  }

  if (Object.keys(patch).length === 0) return json(400, { error: "nothing_to_update" });

  const { error } = await db.from("restaurants").update(patch).eq("id", tenant_id);
  if (error) return json(500, { error: error.message });

  // Preço efectivo pós-mudança (mesma derivação da view).
  const { data: row } = await db.from("admin_tenant_overview")
    .select("effective_price_cents").eq("id", tenant_id).maybeSingle();
  if (!row) return json(404, { error: "tenant_not_found" });

  await audit(db, actor_email, "set_pricing", tenant_id, {
    plan_code: patch.plan_code ?? undefined,
    override: "override" in body ? body.override : undefined,
    effective_price_cents: row.effective_price_cents,
  });

  return json(200, { ok: true, effective_price_cents: row.effective_price_cents });
});
