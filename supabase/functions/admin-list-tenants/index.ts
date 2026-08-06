// admin-list-tenants (GET) — devolve todos os tenants com preço efectivo e atraso.
// Auth HMAC. Leitura → não vai para audit log.
import { authenticate, json, serviceClient } from "./admin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;

  const db = serviceClient();
  const { data, error } = await db
    .from("admin_tenant_overview")
    .select(
      "id,name,status,plan_code,base_price_cents,effective_price_cents,override_reason,user_count,created_at,paid_until,is_demo,is_overdue",
    )
    .order("created_at", { ascending: true });

  if (error) return json(500, { error: error.message });
  return json(200, data);
});
