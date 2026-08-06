// admin-create-tenant (POST) — provisiona restaurante + owner.
// Payload: {name, plan_code, owner_email, initial_status, actor_email}
// Resposta: {tenant_id, invite_sent}
// Owner: criado via Auth Admin do Supabase (inviteUserByEmail). Se o envio de
// email não estiver disponível, cria o utilizador sem email e devolve
// invite_sent:false com nota (não se constrói sistema de email novo).
import { authenticate, audit, json, requireFields, serviceClient } from "./admin.ts";

const TRIAL_DAYS = 14; // default OQ1
const STATUSES = ["trial", "active"]; // estados iniciais permitidos na criação

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

  const missing = requireFields(body, ["name", "plan_code", "owner_email", "actor_email"]);
  if (missing) return json(400, { error: `missing_field:${missing}` });

  const name = String(body.name).trim();
  const plan_code = String(body.plan_code);
  const owner_email = String(body.owner_email).trim().toLowerCase();
  const actor_email = String(body.actor_email);
  const initial_status = STATUSES.includes(String(body.initial_status))
    ? String(body.initial_status)
    : "trial";

  const db = serviceClient();

  // Plano tem de existir e estar activo.
  const { data: plan } = await db.from("product_plans")
    .select("code").eq("code", plan_code).eq("active", true).maybeSingle();
  if (!plan) return json(400, { error: "unknown_plan" });

  // 1) Owner: criar utilizador. inviteUserByEmail envia convite via Supabase Auth.
  let owner_id: string | null = null;
  let invite_sent = false;
  const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(owner_email);
  if (!inviteErr && invited?.user) {
    owner_id = invited.user.id;
    invite_sent = true;
  } else {
    // Fallback: email indisponível → cria utilizador na mesma, convite manual.
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: owner_email,
      email_confirm: false,
    });
    if (createErr || !created?.user) {
      // Owner já pode existir: reaproveita.
      const { data: list } = await db.auth.admin.listUsers();
      const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === owner_email);
      if (!existing) return json(500, { error: "owner_creation_failed" });
      owner_id = existing.id;
    } else {
      owner_id = created.user.id;
    }
    invite_sent = false;
  }

  // 2) Restaurante (slug gerado pelo trigger set_restaurant_slug).
  const now = new Date();
  const trial_ends_at = initial_status === "trial"
    ? new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString().slice(0, 10)
    : null;
  // activated_at = âncora do intro; só quando já entra active.
  const activated_at = initial_status === "active" ? now.toISOString() : null;

  const { data: rest, error: restErr } = await db.from("restaurants").insert({
    name,
    owner_id,
    email: owner_email,
    plan_code,
    status: initial_status,
    trial_ends_at,
    activated_at,
  }).select("id").single();
  if (restErr) return json(500, { error: restErr.message });

  // 3) Owner como membro do restaurante.
  await db.from("restaurant_members").insert({
    restaurant_id: rest.id,
    user_id: owner_id,
    role: "owner",
  });

  await audit(db, actor_email, "create_tenant", rest.id, {
    name, plan_code, owner_email, initial_status, invite_sent,
  });

  return json(200, { tenant_id: rest.id, invite_sent });
});
