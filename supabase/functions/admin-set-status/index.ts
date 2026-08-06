// admin-set-status (POST) — muda o estado do tenant.
// Payload: {tenant_id, status, reason, actor_email}
// Resposta: {ok, previous_status}
import { authenticate, audit, json, requireFields, serviceClient } from "./admin.ts";

const STATUSES = ["trial", "active", "suspended", "churned"];

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

  const missing = requireFields(body, ["tenant_id", "status", "actor_email"]);
  if (missing) return json(400, { error: `missing_field:${missing}` });

  const tenant_id = String(body.tenant_id);
  const status = String(body.status);
  const reason = body.reason != null ? String(body.reason) : null;
  const actor_email = String(body.actor_email);
  if (!STATUSES.includes(status)) return json(400, { error: "invalid_status" });

  const db = serviceClient();

  const { data: current } = await db.from("restaurants")
    .select("status, activated_at").eq("id", tenant_id).maybeSingle();
  if (!current) return json(404, { error: "tenant_not_found" });

  const patch: Record<string, unknown> = { status };
  patch.suspended_at = status === "suspended" ? new Date().toISOString() : null;
  // 1ª activação fixa a âncora do intro; reactivações não a repõem.
  if (status === "active" && !current.activated_at) {
    patch.activated_at = new Date().toISOString();
  }

  const { error } = await db.from("restaurants").update(patch).eq("id", tenant_id);
  if (error) return json(500, { error: error.message });

  await audit(db, actor_email, "set_status", tenant_id, {
    previous_status: current.status, status, reason,
  });

  return json(200, { ok: true, previous_status: current.status });
});
