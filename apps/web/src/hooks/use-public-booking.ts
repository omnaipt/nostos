import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { t, type Lang } from "@/lib/i18n";

// C8 — reservas públicas. Toda a superfície anónima passa pelas RPCs
// security definer (0004): info do restaurante, turnos aplicáveis e criação
// de reserva PENDENTE. Nunca se lê reservas/clientes/mesas daqui.

export interface PublicRestaurant {
  name: string;
  phone: string | null;
  slug: string;
  // 0019 (identidade da casa): opcionais enquanto a migração não estiver
  // aplicada em todos os ambientes — sem eles cai no monograma + costeiro.
  logo_url?: string | null;
  theme?: string | null;
  // Take-away (fase C do Marco): opt-in por restaurante. Defensivo — ausente
  // ou false ⇒ o módulo de encomendas nem aparece.
  takeaway_enabled?: boolean | null;
}

export interface PublicTurn {
  id: string;
  label: string;
  start_time: string;
  service: string | null;
}

export function usePublicRestaurant(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-restaurant", slug],
    queryFn: async (): Promise<PublicRestaurant | null> => {
      const { data, error } = await supabase.rpc("public_restaurant_by_slug", {
        p_slug: slug as string,
      });
      if (error) throw error;
      const rows = (data ?? []) as PublicRestaurant[];
      return rows[0] ?? null;
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

// O idioma entra na chave da query porque o rótulo do turno vem traduzido da
// RPC (0026): sem ele, trocar de idioma servia o "Almoço" em cache.
export function usePublicTurns(slug: string | undefined, date: string, lang: Lang = "pt") {
  return useQuery({
    queryKey: ["public-turns", slug, date, lang],
    queryFn: async (): Promise<PublicTurn[]> => {
      const { data, error } = await supabase.rpc("public_turns_for_date", {
        p_slug: slug as string,
        p_date: date,
        p_lang: lang,
      });
      if (error) throw error;
      return (data ?? []) as PublicTurn[];
    },
    enabled: !!slug && !!date,
  });
}

export interface PublicReservationInput {
  slug: string;
  date: string;
  turnId: string;
  name: string;
  phone: string;
  email: string;
  partySize: number;
  notes: string;
  /** Idioma em que o cliente está a ler a página (0026): fica em reservations.lang. */
  lang: Lang;
}

// Voz da casa (Reserva com Proximidade v1): tratamos o cliente por "si",
// como ao telefone. Mensagens curtas, sem tom de formulário.
//
// A RPC levanta códigos estáveis; a tradução acontece aqui, no idioma em que o
// cliente está a ler. Sem isto o formulário respondia em português a quem
// acabou de escolher francês, que é o defeito que a 0026 vem corrigir.
const ERROR_KEYS: Record<string, string> = {
  restaurante_invalido: "errRestauranteInvalido",
  turno_invalido: "errTurnoInvalido",
  turno_nao_aplicavel: "errTurnoNaoAplicavel",
  data_passada: "errDataPassada",
  data_demasiado_distante: "errDataDistante",
  pax_invalido: "errPaxInvalido",
  dados_invalidos: "errDadosInvalidos",
  email_obrigatorio: "errEmailObrigatorio",
  limite_atingido: "errLimiteAtingido",
};

export function publicBookingErrorMessage(err: unknown, lang: Lang = "pt"): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const [code, key] of Object.entries(ERROR_KEYS)) {
    if (msg.includes(code)) return t(lang, key);
  }
  return t(lang, "errReservaGeral");
}

export function useCreatePublicReservation() {
  return useMutation({
    mutationFn: async (input: PublicReservationInput): Promise<string> => {
      const { data, error } = await supabase.rpc("public_create_reservation", {
        p_slug: input.slug,
        p_service_date: input.date,
        p_turn_id: input.turnId,
        p_name: input.name,
        p_phone: input.phone,
        p_email: input.email,
        p_party_size: input.partySize,
        p_notes: input.notes,
        p_lang: input.lang,
      });
      if (error) throw error;
      return data as string;
    },
  });
}
