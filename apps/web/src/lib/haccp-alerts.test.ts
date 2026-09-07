import { describe, expect, it } from "vitest";
import { buildHaccpAlerts, type AlertStatusRow } from "./haccp-alerts";

function row(p: Partial<AlertStatusRow>): AlertStatusRow {
  return {
    turn_id: "t1",
    turn_label: "Almoço",
    control_point_name: "Frigorífico",
    status: "conforme",
    value_c: null,
    ...p,
  };
}

describe("buildHaccpAlerts", () => {
  it("sem dados não gera alertas", () => {
    expect(buildHaccpAlerts({ days: [], ncs: [] })).toEqual([]);
  });

  it("turno fechado com faltas: um alerta por turno com contagem", () => {
    const alerts = buildHaccpAlerts({
      days: [
        {
          label: "ontem",
          rows: [
            row({ status: "em_falta" }),
            row({ status: "em_falta", control_point_name: "Arca" }),
            row({ status: "conforme", control_point_name: "Banho" }),
          ],
        },
      ],
      ncs: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("turno_com_faltas");
    expect(alerts[0].text).toBe("Almoço de ontem fechou com 2 verificações em falta");
    expect(alerts[0].to).toBe("/haccp");
  });

  it("singular quando só falta uma verificação", () => {
    const alerts = buildHaccpAlerts({
      days: [{ label: "hoje", rows: [row({ status: "em_falta" })] }],
      ncs: [],
    });
    expect(alerts[0].text).toBe("Almoço de hoje fechou com 1 verificação em falta");
  });

  it("desvio sem resposta: alerta com ponto e valor e link para o registo", () => {
    const alerts = buildHaccpAlerts({
      days: [
        {
          label: "hoje",
          rows: [row({ status: "desvio_sem_resposta", control_point_name: "Arca", value_c: -8, turn_id: "t9" })],
        },
      ],
      ncs: [],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("desvio_sem_resposta");
    expect(alerts[0].text).toBe("Desvio sem resposta em Arca: -8 °C");
    expect(alerts[0].to).toBe("/haccp/registar/t9");
  });

  it("NC overdue: texto com horas e descrição truncada a 60", () => {
    const long = "x".repeat(80);
    const alerts = buildHaccpAlerts({
      days: [],
      ncs: [{ id: "nc1", description: long, open_hours: 52.4, overdue: true, nc_status: "aberta" }],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("nc_overdue");
    expect(alerts[0].text).toBe(`Não conformidade aberta há 52 h: ${"x".repeat(60)}…`);
    expect(alerts[0].to).toBe("/haccp/nc/nc1");
  });

  it("NC não overdue ou já verificada não gera alerta", () => {
    const alerts = buildHaccpAlerts({
      days: [],
      ncs: [
        { id: "a", description: "x", open_hours: 10, overdue: false, nc_status: "aberta" },
        { id: "b", description: "y", open_hours: 60, overdue: true, nc_status: "verificada" },
      ],
    });
    expect(alerts).toEqual([]);
  });

  it("combina alertas de ontem e de hoje", () => {
    const alerts = buildHaccpAlerts({
      days: [
        { label: "ontem", rows: [row({ status: "em_falta" })] },
        { label: "hoje", rows: [row({ status: "desvio_sem_resposta", value_c: 7 })] },
      ],
      ncs: [{ id: "nc1", description: "frigorífico", open_hours: 50, overdue: true, nc_status: "aberta" }],
    });
    expect(alerts.map((a) => a.kind)).toEqual(["turno_com_faltas", "desvio_sem_resposta", "nc_overdue"]);
  });
});
