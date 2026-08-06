// OMNAI Console · Admin API partilhada (Nostos / stoa)
// Co-locado em cada function como ./admin.ts. Auth: HMAC-SHA256(body+timestamp).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = new TextEncoder();

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Lê o corpo cru e valida a assinatura HMAC. Devolve { rawBody } ou { error }.
export async function authenticate(
  req: Request,
): Promise<{ rawBody: string } | { error: Response }> {
  const secret = Deno.env.get("ADMIN_API_SECRET");
  if (!secret) return { error: json(500, { error: "server_misconfigured" }) };

  const signature = req.headers.get("x-admin-signature") ?? "";
  const ts = req.headers.get("x-admin-timestamp") ?? "";
  if (!signature || !ts) return { error: json(401, { error: "missing_signature" }) };

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { error: json(401, { error: "bad_timestamp" }) };
  const skew = Math.abs(Date.now() / 1000 - tsNum);
  if (skew > 300) return { error: json(401, { error: "stale_request" }) }; // janela 5 min

  const rawBody = await req.text(); // '' em GET
  const expected = await hmacHex(secret, `${ts}.${rawBody}`);
  if (!timingSafeEqual(signature.toLowerCase(), expected)) {
    return { error: json(401, { error: "bad_signature" }) };
  }
  return { rawBody };
}

export async function audit(
  client: ReturnType<typeof serviceClient>,
  actor_email: string,
  action: string,
  tenant_id: string | null,
  payload: unknown,
): Promise<void> {
  await client.from("admin_audit_log").insert({
    actor_email,
    action,
    tenant_id,
    payload,
  });
}

export function requireFields(
  obj: Record<string, unknown>,
  fields: string[],
): string | null {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === "") return f;
  }
  return null;
}
