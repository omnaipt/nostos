import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Reservation } from "@/lib/types";

// C5 — disponibilidade por (service_date, turn_id). Devolve as reservas
// não-canceladas desse slot (com e sem mesa). A vista cruza isto com as mesas
// activas para calcular livre/ocupada e o bloco POR ATRIBUIR (table_id null).
// Tenant-scoped via RLS (reservations_member_all) — sem filtro de tenant aqui.

async function fetchSlotReservations(
  serviceDate: string,
  turnId: string,
): Promise<Reservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("service_date", serviceDate)
    .eq("turn_id", turnId)
    .neq("status", "cancelada")
    .order("reserved_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Reservation[];
}

export function useAvailability(
  restaurantId: string | undefined,
  serviceDate: string,
  turnId: string,
) {
  return useQuery({
    queryKey: queryKeys.availability(restaurantId, serviceDate, turnId),
    queryFn: () => fetchSlotReservations(serviceDate, turnId),
    enabled: !!restaurantId && !!turnId && !!serviceDate,
  });
}
