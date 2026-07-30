// Email de convite de equipa, em nome do restaurante.
//
// Porque é uma edge e não um RPC: a `invite_member` (0021) faz a autorização e
// grava o convite, mas o pg_net/http NÃO está instalado neste projecto, logo a
// base de dados não consegue falar com o Resend. Em vez de instalar pg_net (mais
// superfície, extensão a manter), o envio vive aqui e a BD continua a ser só BD.
//
// Autorização: NÃO usamos service role para decidir nada. A edge reencaminha o
// JWT de quem chamou para a RPC `member_role` e só envia se esse utilizador for
// OWNER do restaurante em causa. Sem JWT, ou não sendo owner, recusa.
//
// Best-effort do lado do cliente: o convite já ficou gravado pela RPC; se o
// email falhar, a pessoa continua a poder entrar (o convite é aceite no 1º
// signup). Por isso devolvemos 200 com {sent:false, reason} nos casos não
// fatais, como na send-reservation-message.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface Payload {
  restaurantId: string;
  slug: string;
  email: string;
  role: string;
  /** Origem da app (nostos.pt) para montar o link de entrada. */
  appUrl?: string;
}

const FROM_ADDRESS = "equipa@nostos.pt";
// Terracota nostos. O convite é uma mensagem interna da equipa, não uma
// mensagem ao cliente final, por isso não segue o tema escolhido pela casa.
const ACCENT = "#B4502A";

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

const ROLE_LABEL: Record<string, string> = {
  owner: "dono",
  gestor: "gestor",
  balcao: "balcão",
  cozinha: "cozinha",
};

const ROLE_SCOPE: Record<string, string> = {
  owner: "acesso total, incluindo a gestão da equipa",
  gestor: "a gestão da casa: reservas, ementa, despensa e definições",
  balcao: "o modo balcão: reservas do dia e encomendas para levar",
  cozinha: "a ementa e as fichas técnicas",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function callerIsOwner(jwt: string, restaurantId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return false;
  const res = await fetch(`${url}/rest/v1/rpc/member_role`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_restaurant_id: restaurantId }),
  });
  if (!res.ok) return false;
  const role = await res.json();
  return role === "owner";
}

async function fetchRestaurantName(slug: string): Promise<string | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon || !slug) return null;
    const res = await fetch(`${url}/rest/v1/rpc/public_restaurant_by_slug`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as { name?: string | null }[];
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const jwt = req.headers.get("Authorization");
  if (!jwt) return json({ sent: false, reason: "sem autenticação" }, 401);

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ sent: false, reason: "payload inválido" }, 400);
  }
  if (!payload.restaurantId || !payload.email || !payload.role) {
    return json({ sent: false, reason: "payload incompleto" }, 400);
  }

  if (!(await callerIsOwner(jwt, payload.restaurantId))) {
    return json({ sent: false, reason: "só o dono convida" }, 403);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.info("[send-invite-email] NO-OP (RESEND_API_KEY ausente)");
    return json({ sent: false, skipped: true, reason: "RESEND_API_KEY não configurada" });
  }

  const restaurantName = (await fetchRestaurantName(payload.slug)) ?? "o restaurante";
  const roleLabel = ROLE_LABEL[payload.role] ?? payload.role;
  const scope = ROLE_SCOPE[payload.role] ?? "acesso à aplicação";
  const appUrl = (payload.appUrl ?? "https://nostos.pt").replace(/\/+$/, "");
  // O convidado ainda não tem conta nem palavra-passe: o link leva-o
  // directamente ao modo "criar conta", com o endereço do convite preenchido.
  // Tem de ser este endereço, senão o trigger não encontra o convite pendente.
  const loginUrl = `${appUrl}/login?convite=1&email=${encodeURIComponent(payload.email)}`;

  const html = `
    <div style="font-family: system-ui, sans-serif; color: #1a1a1a; line-height: 1.5;">
      <p>Olá,</p>
      <p style="font-weight:600;">Foi convidado para gerir ${escapeHtml(restaurantName)} no nostos.</p>
      <p>O seu perfil é <strong>${escapeHtml(roleLabel)}</strong>, o que lhe dá ${escapeHtml(scope)}.</p>
      <p>
        <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;">Criar a minha conta</a>
      </p>
      <p style="font-size:14px;">
        Use o endereço <strong>${escapeHtml(payload.email)}</strong> e escolha uma
        palavra-passe. O acesso fica activo de imediato. Se já tiver conta no
        nostos, basta entrar com ela.
      </p>
      <p style="color:#6b6b6b;font-size:13px;">
        Se não estava à espera deste convite, ignore esta mensagem.
      </p>
      <p style="white-space: pre-line;">Até já,\n${escapeHtml(restaurantName)}</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${restaurantName.replace(/[\r\n"]/g, "").trim() || "nostos"} <${FROM_ADDRESS}>`,
        to: [payload.email],
        subject: `Convite para gerir ${restaurantName} no nostos`,
        html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[send-invite-email] Resend erro ${res.status}: ${detail}`);
      return json({ sent: false, reason: `resend ${res.status}` });
    }
    const data = await res.json();
    return json({ sent: true, id: data.id ?? null });
  } catch (e) {
    console.error("[send-invite-email] falha de rede (Resend):", e);
    return json({ sent: false, reason: "erro de rede ao contactar Resend" });
  }
});
