// Edge de confirmação de reserva AGNÓSTICA ao canal (spec Reserva Proximidade
// §6c, substitui a send-reservation-email como canal principal).
//
// A mensagem compõe-se UMA vez (agradecimento na voz da casa + resumo + notes
// ecoados + ganchos do menu real) e renderiza por canal e por tom
// (restaurants.tone, 0015). Canais v1, pela ordem de envio:
//   1. WhatsApp — stub até a Meta aprovar o negócio (templates pré-aprovados).
//   2. SMS via Twilio — pluggable: sem secrets TWILIO_* salta com log limpo.
//   3. Email via Resend — recibo; sem RESEND_API_KEY faz no-op observável.
// Best-effort como a edge antiga: NUNCA quebra o fluxo de reserva (200 sempre,
// excepto payload inválido).
//
// Secrets (todos opcionais; cada canal salta sozinho):
//   RESEND_API_KEY                          — email (domínio nostos.pt no Resend)
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN  — SMS
//   TWILIO_FROM ou TWILIO_MESSAGING_SERVICE_SID — remetente SMS

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  type Hook,
  type MenuRow,
  type MessageInput,
  renderEmailHtml,
  renderSms,
  renderSubject,
  selectHooks,
  type Tone,
} from "./render.ts";

interface Payload {
  reservationId: string;
  restaurantSlug: string;
  restaurantName: string;
  tone?: string;
  replyTo?: string;
  toEmail?: string;
  toPhone?: string;
  customerName: string;
  partySize: number;
  serviceDate: string; // YYYY-MM-DD
  reservedAt?: string; // ISO, para a hora
  timezone?: string;
  notes?: string | null;
}

interface ChannelResult {
  channel: "whatsapp" | "sms" | "email";
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  id?: string | null;
}

const FROM_ADDRESS = "reservas@nostos.pt";
const MAX_HOOKS = 4;

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

// Ganchos "para já ir sonhando" a partir do menu REAL do tenant, via a mesma
// RPC pública do menu (anon). Pratos do dia só se a reserva for para HOJE no
// fuso da casa; preço de mercado e por encomenda valem para qualquer data.
// Máx. 3-4 compactos; zero ganchos = mensagem simples. Falha => sem ganchos.
async function fetchHooks(slug: string, serviceDate: string, tz: string): Promise<Hook[]> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return [];
    const res = await fetch(`${url}/rest/v1/rpc/public_menu_by_slug`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) {
      console.warn(`[send-reservation-message] menu RPC ${res.status}; sem ganchos`);
      return [];
    }
    const rows = (await res.json()) as MenuRow[];
    const todayTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return selectHooks(rows, serviceDate === todayTz, MAX_HOOKS);
  } catch (e) {
    console.warn("[send-reservation-message] falha a compor ganchos (ignorada):", e);
    return [];
  }
}

// ── Adapters de canal ────────────────────────────────────────────────────────

async function sendEmail(
  payload: Payload,
  input: MessageInput,
): Promise<ChannelResult> {
  if (!payload.toEmail) {
    return { channel: "email", sent: false, skipped: true, reason: "sem email de destino" };
  }
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.info(
      `[send-reservation-message] EMAIL NO-OP (RESEND_API_KEY ausente) reserva=${payload.reservationId}`,
    );
    return { channel: "email", sent: false, skipped: true, reason: "RESEND_API_KEY não configurada" };
  }
  const fromName = input.restaurantName.replace(/[\r\n"]/g, "").trim() || "nostos";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${FROM_ADDRESS}>`,
        to: [payload.toEmail],
        reply_to: payload.replyTo ? [payload.replyTo] : undefined,
        subject: renderSubject(input),
        html: renderEmailHtml(input),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[send-reservation-message] Resend erro ${res.status}: ${detail}`);
      return { channel: "email", sent: false, reason: `resend ${res.status}` };
    }
    const data = await res.json();
    return { channel: "email", sent: true, id: data.id ?? null };
  } catch (e) {
    console.error("[send-reservation-message] falha de rede (Resend):", e);
    return { channel: "email", sent: false, reason: "erro de rede ao contactar Resend" };
  }
}

async function sendSms(
  payload: Payload,
  input: MessageInput,
): Promise<ChannelResult> {
  if (!payload.toPhone) {
    return { channel: "sms", sent: false, skipped: true, reason: "sem telefone de destino" };
  }
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  const service = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  if (!sid || !token || (!from && !service)) {
    // Pluggable por desenho (§6c): o David liga a conta, mete os secrets, e o
    // canal acorda sem redeploy. Até lá, salto limpo e observável.
    console.info(
      `[send-reservation-message] SMS SKIP (secrets TWILIO_* ausentes) reserva=${payload.reservationId}`,
    );
    return { channel: "sms", sent: false, skipped: true, reason: "TWILIO_* não configurados" };
  }
  try {
    const body = new URLSearchParams({ To: payload.toPhone, Body: renderSms(input) });
    if (service) body.set("MessagingServiceSid", service);
    else body.set("From", from as string);
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[send-reservation-message] Twilio erro ${res.status}: ${detail}`);
      return { channel: "sms", sent: false, reason: `twilio ${res.status}` };
    }
    const data = await res.json();
    return { channel: "sms", sent: true, id: data.sid ?? null };
  } catch (e) {
    console.error("[send-reservation-message] falha de rede (Twilio):", e);
    return { channel: "sms", sent: false, reason: "erro de rede ao contactar Twilio" };
  }
}

function sendWhatsApp(payload: Payload): ChannelResult {
  // Stub declarado: a Business Platform exige verificação Meta + número
  // dedicado + templates pré-aprovados (semanas). Encaixa aqui quando aprovar;
  // o render reutiliza o SMS até haver template próprio.
  console.info(
    `[send-reservation-message] WHATSAPP SKIP (stub, aguarda aprovação Meta) reserva=${payload.reservationId}`,
  );
  return { channel: "whatsapp", sent: false, skipped: true, reason: "aguarda aprovação Meta (stub)" };
}

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ sent: false, reason: "payload inválido" }, 400);
  }
  if (!payload.reservationId || !payload.restaurantSlug || !payload.customerName) {
    return json({ sent: false, reason: "payload incompleto" }, 400);
  }

  const tz = payload.timezone || "Europe/Lisbon";
  const tone: Tone = payload.tone === "formal" ? "formal" : "proximo";
  const hooks = await fetchHooks(payload.restaurantSlug, payload.serviceDate, tz);

  const serviceDateObj = new Date(`${payload.serviceDate}T12:00:00Z`);
  const dateLong = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(serviceDateObj);
  const dateShort = new Intl.DateTimeFormat("pt-PT", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  }).format(serviceDateObj);
  let timeLabel: string | null = null;
  if (payload.reservedAt) {
    const t = new Date(payload.reservedAt);
    if (!Number.isNaN(t.getTime())) {
      timeLabel = new Intl.DateTimeFormat("pt-PT", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      }).format(t);
    }
  }

  const input: MessageInput = {
    restaurantName: payload.restaurantName || "nostos",
    tone,
    customerName: payload.customerName,
    partySize: payload.partySize,
    dateLong,
    dateShort,
    timeLabel,
    notes: payload.notes?.trim() ? payload.notes.trim() : null,
    hooks,
    hasReply: !!payload.replyTo,
  };

  // Ordem §6c: WhatsApp quando existir → SMS → email como recibo.
  const results: ChannelResult[] = [];
  results.push(sendWhatsApp(payload));
  results.push(await sendSms(payload, input));
  results.push(await sendEmail(payload, input));

  return json({
    sent: results.some((r) => r.sent),
    results,
    hooks: hooks.length,
  });
});
