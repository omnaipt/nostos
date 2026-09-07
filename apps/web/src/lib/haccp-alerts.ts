// Alertas in-app do HACCP (item 3, A3 e C1). Puro: a partir do estado dos
// turnos de ontem e de hoje e do estado das não conformidades, produz a lista
// de alertas com o texto e o link do ecrã certo. Sem React nem I/O, para testar
// e reutilizar no hub e no Dashboard.

export type HaccpAlertKind = "turno_com_faltas" | "desvio_sem_resposta" | "nc_overdue";

export interface HaccpAlert {
  kind: HaccpAlertKind;
  text: string;
  to: string;
}

// Subconjunto das linhas de haccp_turn_status de que os alertas precisam.
export interface AlertStatusRow {
  turn_id: string;
  turn_label: string;
  control_point_name: string;
  status: string;
  value_c: number | null;
}

export interface AlertDay {
  label: "ontem" | "hoje";
  rows: AlertStatusRow[];
}

export interface AlertNc {
  id: string;
  description: string;
  open_hours: number | null;
  overdue: boolean | null;
  nc_status: string | null;
}

function fmt(n: number | null): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export function buildHaccpAlerts(input: { days: AlertDay[]; ncs: AlertNc[] }): HaccpAlert[] {
  const alerts: HaccpAlert[] = [];

  for (const day of input.days) {
    // (1) Turnos fechados com verificações em falta: um alerta por turno.
    const missingByTurn = new Map<string, { label: string; count: number }>();
    for (const r of day.rows) {
      if (r.status !== "em_falta") continue;
      const cur = missingByTurn.get(r.turn_id) ?? { label: r.turn_label, count: 0 };
      cur.count += 1;
      missingByTurn.set(r.turn_id, cur);
    }
    for (const { label, count } of missingByTurn.values()) {
      alerts.push({
        kind: "turno_com_faltas",
        text: `${label} de ${day.label} fechou com ${count} verificaç${count === 1 ? "ão" : "ões"} em falta`,
        to: "/haccp",
      });
    }

    // (2) Desvios sem resposta: um alerta por célula, com ponto e valor.
    for (const r of day.rows) {
      if (r.status !== "desvio_sem_resposta") continue;
      alerts.push({
        kind: "desvio_sem_resposta",
        text: `Desvio sem resposta em ${r.control_point_name}: ${fmt(r.value_c)} °C`,
        to: `/haccp/registar/${r.turn_id}`,
      });
    }
  }

  // (3) Não conformidades abertas há mais de 48 h.
  for (const nc of input.ncs) {
    if (!nc.overdue || nc.nc_status === "verificada") continue;
    const hours = nc.open_hours != null ? Math.round(nc.open_hours) : 48;
    alerts.push({
      kind: "nc_overdue",
      text: `Não conformidade aberta há ${hours} h: ${truncate(nc.description, 60)}`,
      to: `/haccp/nc/${nc.id}`,
    });
  }

  return alerts;
}
