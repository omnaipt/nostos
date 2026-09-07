import * as React from "react";
import { useHaccpServiceDate, useHaccpTurnStatus } from "@/hooks/use-haccp-status";
import { useHaccpNonconformities } from "@/hooks/use-haccp-nc";
import { shiftIsoDate } from "@/lib/service-date";
import { buildHaccpAlerts, type AlertDay, type HaccpAlert } from "@/lib/haccp-alerts";

// Alertas in-app (item 3). Combina o estado dos turnos de ontem e de hoje com
// o estado das NC. Tudo tenant-scoped por RLS. Reutiliza os hooks existentes.

export function useHaccpAlerts(restaurantId: string | undefined): {
  alerts: HaccpAlert[];
  isLoading: boolean;
} {
  const today = useHaccpServiceDate(restaurantId).data;
  const yesterday = today ? shiftIsoDate(today, -1) : undefined;

  const todayQuery = useHaccpTurnStatus(restaurantId, today);
  const yesterdayQuery = useHaccpTurnStatus(restaurantId, yesterday);
  const ncQuery = useHaccpNonconformities(restaurantId);

  const alerts = React.useMemo<HaccpAlert[]>(() => {
    const days: AlertDay[] = [];
    if (yesterdayQuery.data) days.push({ label: "ontem", rows: yesterdayQuery.data.flatMap((g) => g.points) });
    if (todayQuery.data) days.push({ label: "hoje", rows: todayQuery.data.flatMap((g) => g.points) });
    const ncs = (ncQuery.data ?? []).map((n) => ({
      id: n.id,
      description: n.description,
      open_hours: n.open_hours,
      overdue: n.overdue,
      nc_status: n.nc_status,
    }));
    return buildHaccpAlerts({ days, ncs });
  }, [todayQuery.data, yesterdayQuery.data, ncQuery.data]);

  return {
    alerts,
    isLoading: todayQuery.isLoading || yesterdayQuery.isLoading || ncQuery.isLoading,
  };
}
