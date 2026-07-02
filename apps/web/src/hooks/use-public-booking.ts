import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// C8 — reservas públicas. Toda a superfície anónima passa pelas RPCs
// security definer (0004): info do restaurante, turnos aplicáveis e criação
// de reserva PENDENTE. Nunca se lê reservas/clientes/mesas daqui.

export interface PublicRestaurant {
  name: string;
  phone: string | null;
  slug: string;
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

export function usePublicTurns(slug: string | undefined, date: string) {
  return useQuery({
    queryKey: ["public-turns", slug, date],
    queryFn: async (): Promise<PublicTurn[]> => {
      const { data, error } = await supabase.rpc("public_turns_for_date", {
        p_slug: slug as string,
        p_date: date,
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
}

const ERROR_PT: Record<string, string> = {
  restaurante_invalido: "Restaurante não encontrado.",
  turno_invalido: "O turno escolhido já não está disponível.",
  turno_nao_aplicavel: "Esse turno não se aplica ao dia escolhido.",
  data_passada: "Não é possível reservar para uma data passada.",
  data_demasiado_distante: "Só aceitamos reservas até 6 meses.",
  pax_invalido: "Indica um número de pessoas entre 1 e 50.",
  dados_invalidos: "Verifica o nome e o telefone (mín. 9 dígitos).",
  limite_atingido: "Já tens pedidos pendentes para esse dia. O restaurante vai contactar-te.",
};

export function publicBookingErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const [key, pt] of Object.entries(ERROR_PT)) {
    if (msg.includes(key)) return pt;
  }
  return "Não foi possível enviar o pedido. Tenta novamente.";
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
      });
      if (error) throw error;
      return data as string;
    },
  });
}
