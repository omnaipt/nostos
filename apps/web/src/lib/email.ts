import { supabase } from "@/integrations/supabase/client";
import type { Restaurant } from "@/lib/types";

// C7 — confirmação por email (best-effort). Chama a edge function
// `send-reservation-email`. O envio REAL depende de RESEND_API_KEY + domínio
// stoa.pt verificado no Resend (setup do David — ainda NÃO provisionado).
//
// GATE: esta função NUNCA lança nem bloqueia a criação da reserva. Se a edge
// function não existir, não tiver a key, ou falhar, fazemos no-op OBSERVÁVEL
// (console.warn) e seguimos. A edge function devolve { sent: false, reason }
// quando a key não está configurada — esse caso é tratado como sucesso silencioso.

export interface ReservationEmailInput {
  reservationId: string;
  restaurant: Restaurant;
  toEmail: string;
  customerName: string;
  partySize: number;
  serviceDate: string;
}

export async function sendReservationEmail(input: ReservationEmailInput): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("send-reservation-email", {
      body: {
        reservationId: input.reservationId,
        restaurantName: input.restaurant.name,
        replyTo: input.restaurant.email ?? undefined,
        toEmail: input.toEmail,
        customerName: input.customerName,
        partySize: input.partySize,
        serviceDate: input.serviceDate,
      },
    });
    if (error) {
      console.warn("[STOA] Confirmação por email não enviada (edge function):", error.message);
      return;
    }
    if (data && data.sent === false) {
      console.info("[STOA] Confirmação por email em no-op:", data.reason ?? "RESEND não configurado");
    }
  } catch (e) {
    // Defensivo: qualquer falha do canal de email é silenciada para não afectar
    // o fluxo de reserva.
    console.warn("[STOA] Falha ao invocar send-reservation-email (ignorada):", e);
  }
}
