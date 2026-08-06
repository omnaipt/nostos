// admin-record-payment (POST) — regista até quando o tenant está pago.
// Payload: {tenant_id, paid_until, note?, actor_email}
// Resposta: {ok}
import { authenticate, audit, json, requireFields, serviceClient } from "./admin.ts";

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

  const missing = requireFields(body, ["tenant_id", "paid_until", "actor_email"]);
  if (missing) return json(400, { error: `missing_field:${missing}` });

  const tenant_id = String(body.tenant_id);
  const paid_until = String(body.paid_until); // YYYY-MM-DD
  const note = body.note != null ? String(body.note) : null;
  const actor_email = String(body.actor_email);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_until)) return json(400, { error: "invalid_date" });

  const db = serviceClient();

  const { data: current } = await db.from("restaurants")
    .select("id").eq("id", tenant_id).maybeSingle();
  if (!current) return json(404, { error: "tenant_not_found" });

  const { error } = await db.from("restaurants")
    .update({ paid_until }).eq("id", tenant_id);
  if (error) return json(500, { error: error.message });

  await audit(db, actor_email, "record_payment", tenant_id, { paid_until, note });

  return json(200, { ok: true });
});
