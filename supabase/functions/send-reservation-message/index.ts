// Edge de mensagens ao CLIENTE, agnóstica ao evento: reserva OU take-away.
// Decisão de canais (30-07): email (Resend) é o único canal garantido; WhatsApp
// fica stub até a Meta aprovar. SMS saiu do v1 (sem ramo de SMS aqui).
//
// O campo `kind` do payload decide o conteúdo (defaults retro-compatíveis):
//   "reservation" (ou ausente) — agradecimento de reserva (voz da casa +
//       resumo + notes + ganchos do menu real).
//   "takeaway_received" / "takeaway_ready" — encomenda recebida / pronta.
// Best-effort: NUNCA quebra o fluxo (200 sempre, excepto payload inválido).
//
// Secrets (opcionais; cada canal salta sozinho):
//   RESEND_API_KEY — email (domínio nostos.pt no Resend)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  type Hook,
  type MenuRow,
  type MessageInput,
  renderEmailHtml,
  renderSubject,
  renderTakeawayEmailHtml,
  renderTakeawaySubject,
  selectHooks,
  type TakeawayInput,
  type TakeawayKind,
  THEME_ACCENT,
  type Tone,
} from "./render.ts";

interface Payload {
  // Comum
  kind?: string; // "reservation" | "takeaway_received" | "takeaway_ready"
  restaurantSlug: string;
  restaurantName: string;
  tone?: string;
  replyTo?: string;
  toEmail?: string;
  toPhone?: string;
  customerName: string;
  // Reserva
  reservationId?: string;
  partySize?: number;
  serviceDate?: string; // YYYY-MM-DD
  reservedAt?: string; // ISO
  timezone?: string;
  notes?: string | null;
  // Take-away
  orderId?: string;
  pickupAt?: string; // "YYYY-MM-DDTHH:MM:SS" (naive local)
}

interface ChannelResult {
  channel: "whatsapp" | "email";
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

const TAKEAWAY_KINDS = new Set(["takeaway_received", "takeaway_ready"]);

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

// Identidade da casa (0019): logo + tema via a RPC pública do restaurante.
async function fetchIdentity(
  slug: string,
): Promise<{ logoUrl: string | null; theme: string | null }> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return { logoUrl: null, theme: null };
    const res = await fetch(`${url}/rest/v1/rpc/public_restaurant_by_slug`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return { logoUrl: null, theme: null };
    const rows = (await res.json()) as { logo_url?: string | null; theme?: string | null }[];
    return { logoUrl: rows[0]?.logo_url ?? null, theme: rows[0]?.theme ?? null };
  } catch {
    return { logoUrl: null, theme: null };
  }
}

// ── Canais ───────────────────────────────────────────────────────────────────

async function sendEmail(
  payload: Payload,
  subject: string,
  html: string,
): Promise<ChannelResult> {
  if (!payload.toEmail) {
    return { channel: "email", sent: false, skipped: true, reason: "sem email de destino" };
  }
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.info(
      `[send-reservation-message] EMAIL NO-OP (RESEND_API_KEY ausente) ${payload.kind ?? "reservation"}`,
    );
    return { channel: "email", sent: false, skipped: true, reason: "RESEND_API_KEY não configurada" };
  }
  const fromName = payload.restaurantName.replace(/[\r\n"]/g, "").trim() || "nostos";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${FROM_ADDRESS}>`,
        to: [payload.toEmail],
        reply_to: payload.replyTo ? [payload.replyTo] : undefined,
        subject,
        html,
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

function sendWhatsApp(ref: string): ChannelResult {
  // Stub declarado: a Business Platform exige verificação Meta + número
  // dedicado + templates pré-aprovados. Encaixa aqui quando aprovar.
  console.info(
    `[send-reservation-message] WHATSAPP SKIP (stub, aguarda aprovação Meta) ref=${ref}`,
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
  if (!payload.restaurantSlug || !payload.customerName) {
    return json({ sent: false, reason: "payload incompleto" }, 400);
  }

  const tone: Tone = payload.tone === "formal" ? "formal" : "proximo";
  const kind = payload.kind ?? "reservation";
  const identity = await fetchIdentity(payload.restaurantSlug);
  const accentHex = THEME_ACCENT[identity.theme ?? "costeiro"] ?? THEME_ACCENT.costeiro;

  // ── Take-away ───────────────────────────────────────────────────────────────
  if (TAKEAWAY_KINDS.has(kind)) {
    // Com encomendas para hoje, amanhã ou o dia seguinte (David, 30-07), a hora
    // sozinha era ambígua: "para levantar às 19:30" não diz em que dia. Se o
    // levantamento não for hoje, o dia entra na frase.
    let pickupLabel: string | null = null;
    if (payload.pickupAt) {
      const tzPickup = payload.timezone || "Europe/Lisbon";
      // Dois formatos chegam aqui: o formulário público manda naive local
      // ("2026-07-31T19:30:00") e o balcão manda o timestamptz da BD, em UTC
      // ("2026-07-30T13:00:00+00:00"). Sem distinguir, o aviso de "pronta"
      // anunciava a hora UTC (13:00 em vez de 14:00).
      const temFuso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(payload.pickupAt);
      let dia = "";
      let hora = "";
      if (temFuso) {
        const d = new Date(payload.pickupAt);
        if (!Number.isNaN(d.getTime())) {
          dia = new Intl.DateTimeFormat("en-CA", {
            timeZone: tzPickup,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(d);
          hora = new Intl.DateTimeFormat("pt-PT", {
            timeZone: tzPickup,
            hour: "2-digit",
            minute: "2-digit",
          }).format(d);
        }
      } else {
        const m = payload.pickupAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        if (m) {
          dia = m[1];
          hora = m[2];
        }
      }
      if (dia && hora) {
        const hojeTz = new Intl.DateTimeFormat("en-CA", {
          timeZone: tzPickup,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        // O rótulo já traz a preposição, para o render não ter de adivinhar se
        // é "às 19:30" ou "sexta-feira, 31 de julho, às 19:30".
        if (dia === hojeTz) {
          pickupLabel = `às ${hora}`;
        } else {
          const d = new Date(`${dia}T12:00:00Z`);
          const legivel = new Intl.DateTimeFormat("pt-PT", {
            timeZone: "UTC",
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(d);
          pickupLabel = `${legivel}, às ${hora}`;
        }
      }
    }
    const t: TakeawayInput = {
      restaurantName: payload.restaurantName || "nostos",
      tone,
      customerName: payload.customerName,
      kind: kind as TakeawayKind,
      pickupLabel,
      logoUrl: identity.logoUrl,
      accentHex,
    };
    const results: ChannelResult[] = [];
    results.push(sendWhatsApp(payload.orderId ?? "takeaway"));
    results.push(await sendEmail(payload, renderTakeawaySubject(t), renderTakeawayEmailHtml(t)));
    return json({ sent: results.some((r) => r.sent), results });
  }

  // ── Reserva (default, retro-compatível) ─────────────────────────────────────
  if (!payload.reservationId || !payload.serviceDate) {
    return json({ sent: false, reason: "payload de reserva incompleto" }, 400);
  }
  const tz = payload.timezone || "Europe/Lisbon";
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
    partySize: payload.partySize ?? 0,
    dateLong,
    dateShort,
    timeLabel,
    notes: payload.notes?.trim() ? payload.notes.trim() : null,
    hooks,
    hasReply: !!payload.replyTo,
    logoUrl: identity.logoUrl,
    accentHex,
  };

  const results: ChannelResult[] = [];
  results.push(sendWhatsApp(payload.reservationId));
  results.push(await sendEmail(payload, renderSubject(input), renderEmailHtml(input)));

  return json({ sent: results.some((r) => r.sent), results, hooks: hooks.length });
});
