import { supabase } from "@/integrations/supabase/client";
import type { Restaurant } from "@/lib/types";

// Confirmação de reserva multi-canal (best-effort). Chama a edge
// `send-reservation-message` (spec Reserva Proximidade §6c): a edge compõe o
// agradecimento com ganchos do menu real e renderiza por canal (SMS→email;
// WhatsApp stub) e por tom (restaurants.tone, 0015).
//
// GATE: esta função NUNCA lança nem bloqueia o fluxo de reserva. Cada canal
// salta sozinho na edge (sem TWILIO_* => SMS skip com log; sem RESEND_API_KEY
// => email no-op observável); aqui só registamos o resultado na consola.

export interface ReservationMessageInput {
  reservationId: string;
  restaurant: Restaurant;
  toEmail: string | null;
  toPhone: string | null;
  customerName: string;
  partySize: number;
  serviceDate: string;
  reservedAt: string | null;
  notes: string | null;
  /**
   * Idioma em que o cliente fez a reserva (0026). Opcional porque quem chama
   * hoje é o backoffice, que confirma reservas antigas sem idioma gravado. Vai
   * no corpo à espera de que a edge passe a compor a mensagem no idioma do
   * cliente: quem reservou em francês não devia receber a confirmação em
   * português. A edge ignora campos que não conhece, por isso é seguro já.
   */
  lang?: string | null;
}

export async function sendReservationMessage(input: ReservationMessageInput): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("send-reservation-message", {
      body: {
        reservationId: input.reservationId,
        restaurantSlug: input.restaurant.slug,
        restaurantName: input.restaurant.name,
        // Defensivo enquanto a 0015 não estiver aplicada em todos os ambientes.
        tone: (input.restaurant as { tone?: string }).tone ?? "proximo",
        replyTo: input.restaurant.email ?? undefined,
        toEmail: input.toEmail ?? undefined,
        toPhone: input.toPhone ?? undefined,
        customerName: input.customerName,
        partySize: input.partySize,
        serviceDate: input.serviceDate,
        reservedAt: input.reservedAt ?? undefined,
        timezone: input.restaurant.timezone,
        notes: input.notes ?? undefined,
        lang: input.lang ?? undefined,
      },
    });
    if (error) {
      console.warn("[nostos] Confirmação não enviada (edge function):", error.message);
      return;
    }
    if (data && data.sent === false) {
      console.info("[nostos] Confirmação em no-op (nenhum canal activo):", data.results ?? data);
    }
  } catch (e) {
    // Defensivo: qualquer falha do canal de mensagens é silenciada para não
    // afectar o fluxo de reserva.
    console.warn("[nostos] Falha ao invocar send-reservation-message (ignorada):", e);
  }
}
