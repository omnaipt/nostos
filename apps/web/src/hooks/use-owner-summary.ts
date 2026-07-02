import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayServiceDate, shiftIsoDate } from "@/lib/service-date";
import type { ReservationStatus } from "@/lib/types";

// Dashboard do dono v0 (antecipa o relatório semanal da S2).
// Semana = segunda a domingo, no calendário do service_date.
// Canal (staff vs público) vem dos reservation_events 'criada' (G1).

export interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  total: number;
  pax: number;
  publicCount: number;
  staffCount: number;
  noShows: number;
  cancelled: number;
  newCustomers: number;
}

export interface OwnerSummary {
  current: WeekSummary;
  previous: WeekSummary;
  pendingNow: number;
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay() === 0 ? 7 : dt.getDay(); // ISO: 1=Seg..7=Dom
  return shiftIsoDate(iso, -(dow - 1));
}

interface ReservationRow {
  id: string;
  status: ReservationStatus;
  party_size: number;
  service_date: string;
}

async function fetchWeek(restaurantId: string, weekStart: string): Promise<WeekSummary> {
  const weekEnd = shiftIsoDate(weekStart, 6);

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, status, party_size, service_date")
    .eq("restaurant_id", restaurantId)
    .gte("service_date", weekStart)
    .lte("service_date", weekEnd);
  if (error) throw error;
  const rows = (reservations ?? []) as ReservationRow[];

  // Canal: evento 'criada' de cada reserva da semana.
  const ids = rows.map((r) => r.id);
  let publicCount = 0;
  if (ids.length > 0) {
    const { data: events, error: evErr } = await supabase
      .from("reservation_events")
      .select("reservation_id, actor")
      .eq("restaurant_id", restaurantId)
      .eq("event_type", "criada")
      .in("reservation_id", ids);
    if (evErr) throw evErr;
    publicCount = (events ?? []).filter((e) => e.actor === "publico").length;
  }

  const { count: newCustomers, error: custErr } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .gte("created_at", `${weekStart}T00:00:00`)
    .lte("created_at", `${weekEnd}T23:59:59`);
  if (custErr) throw custErr;

  const active = rows.filter((r) => r.status !== "cancelada");
  return {
    weekStart,
    weekEnd,
    total: active.length,
    pax: active
      .filter((r) => r.status !== "no_show")
      .reduce((s, r) => s + r.party_size, 0),
    publicCount,
    staffCount: Math.max(active.length - publicCount, 0),
    noShows: rows.filter((r) => r.status === "no_show").length,
    cancelled: rows.filter((r) => r.status === "cancelada").length,
    newCustomers: newCustomers ?? 0,
  };
}

async function fetchOwnerSummary(restaurantId: string): Promise<OwnerSummary> {
  const currentStart = mondayOf(todayServiceDate());
  const previousStart = shiftIsoDate(currentStart, -7);

  const [current, previous, pending] = await Promise.all([
    fetchWeek(restaurantId, currentStart),
    fetchWeek(restaurantId, previousStart),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "pendente")
      .gte("service_date", todayServiceDate()),
  ]);
  if (pending.error) throw pending.error;

  return { current, previous, pendingNow: pending.count ?? 0 };
}

export function useOwnerSummary(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ["owner-summary", restaurantId],
    queryFn: () => fetchOwnerSummary(restaurantId as string),
    enabled: !!restaurantId,
    staleTime: 60 * 1000,
  });
}
