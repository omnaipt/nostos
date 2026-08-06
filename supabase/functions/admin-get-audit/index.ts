// admin-get-audit (POST) — histórico de acções administrativas de um tenant.
// Payload: {tenant_id, limit?}  Resposta: {entries: AuditEntry[]}
// AuditEntry.id = seq (bigint identity) para conformar ao contrato (id: number).
// Leitura → não é auditada.
import { authenticate, json, requireFields, serviceClient } from "./admin.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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

  const missing = requireFields(body, ["tenant_id"]);
  if (missing) return json(400, { error: `missing_field:${missing}` });

  const tenant_id = String(body.tenant_id);
  let limit = Number(body.limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const db = serviceClient();
  const { data, error } = await db
    .from("admin_audit_log")
    .select("seq, action, actor_email, payload, created_at")
    .eq("tenant_id", tenant_id)
    .order("seq", { ascending: false })
    .limit(limit);

  if (error) return json(500, { error: error.message });

  const entries = (data ?? []).map((r) => ({
    id: r.seq,
    action: r.action,
    actor_email: r.actor_email,
    payload: r.payload,
    created_at: r.created_at,
  }));
  return json(200, { entries });
});
