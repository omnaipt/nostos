// C7 — Edge function de confirmação de reserva por email (best-effort).
//
// GATE/DEPENDÊNCIA: o envio REAL precisa de RESEND_API_KEY (secret do projeto)
// e do domínio stoa.pt verificado no Resend. Enquanto a key NÃO estiver
// configurada, a função faz NO-OP OBSERVÁVEL: devolve 200 { sent:false,
// reason:"RESEND_API_KEY não configurada" } e NUNCA quebra a criação da
// reserva (o cliente trata isto como sucesso silencioso).
//
// From: reservas@stoa.pt, com display name = nome do restaurante.
// Reply-To: email do restaurante (se existir).
//
// Setup pendente do David (ver relatório):
//   1. Criar API key no Resend e configurá-la como secret:
//      supabase secrets set RESEND_API_KEY=... --project-ref emuwqkdummdmacnkltte
//   2. Verificar o domínio stoa.pt no Resend (SPF/DKIM) para poder enviar de
//      reservas@stoa.pt.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface Payload {
  reservationId: string;
  restaurantName: string;
  replyTo?: string;
  toEmail: string;
  customerName: string;
  partySize: number;
  serviceDate: string;
}

const FROM_ADDRESS = "reservas@stoa.pt";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ sent: false, reason: "payload inválido" }, 400);
  }

  if (!payload.toEmail) {
    return json({ sent: false, reason: "sem email de destino" });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");

  // GATE: sem API key → no-op observável. Nunca falha o fluxo de reserva.
  if (!apiKey) {
    console.info(
      `[send-reservation-email] NO-OP (RESEND_API_KEY ausente) reserva=${payload.reservationId}`,
    );
    return json({ sent: false, reason: "RESEND_API_KEY não configurada" });
  }

  const fromName = (payload.restaurantName || "STOA").replace(/[\r\n"]/g, "").trim();
  const subject = `Reserva confirmada · ${fromName}`;
  const html = `
    <div style="font-family: system-ui, sans-serif; color: #1a1a1a;">
      <h2>Reserva confirmada</h2>
      <p>Olá ${escapeHtml(payload.customerName)},</p>
      <p>A tua reserva no <strong>${escapeHtml(fromName)}</strong> está confirmada.</p>
      <ul>
        <li><strong>Data:</strong> ${escapeHtml(payload.serviceDate)}</li>
        <li><strong>Pessoas:</strong> ${payload.partySize}</li>
      </ul>
      <p>Até breve.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
      console.error(`[send-reservation-email] Resend erro ${res.status}: ${detail}`);
      // Best-effort: reportamos mas devolvemos 200 para não escalar no cliente.
      return json({ sent: false, reason: `resend ${res.status}` });
    }

    const data = await res.json();
    return json({ sent: true, id: data.id ?? null });
  } catch (e) {
    console.error("[send-reservation-email] falha de rede:", e);
    return json({ sent: false, reason: "erro de rede ao contactar Resend" });
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
