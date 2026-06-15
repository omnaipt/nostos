import { describe, expect, it } from "vitest";
import { computeReservedAt, computeServiceDate } from "@/lib/service-date";

// Estes testes provam o CONTRATO FROZEN: service_date é a data CIVIL no fuso do
// RESTAURANTE e reserved_at é o instante UTC exacto dessa hora de parede. O
// resultado NÃO pode depender do fuso do browser/runner — por isso usamos fusos
// com offsets bem distintos de UTC e do runner (que em CI corre em UTC).

describe("computeServiceDate — ancoragem no fuso do restaurante", () => {
  it("sem time devolve a data do form (não há instante a converter)", () => {
    expect(computeServiceDate("2026-06-15", "Europe/Lisbon")).toBe("2026-06-15");
  });

  it("sem timezone devolve a data do form (fallback defensivo)", () => {
    expect(computeServiceDate("2026-06-15", undefined, "00:30")).toBe("2026-06-15");
  });

  it("reserva 00:30 em Lisboa fica na data civil de Lisboa (não derrapa para o dia anterior em UTC)", () => {
    // No Verão Lisboa = UTC+1 (WEST). 00:30 de 15-Jun em Lisboa = 23:30 UTC de
    // 14-Jun. Um cálculo ingénuo que lesse o dia em UTC daria 2026-06-14 (ERRADO).
    expect(computeServiceDate("2026-06-15", "Europe/Lisbon", "00:30")).toBe("2026-06-15");
  });

  it("reserva 23:30 em Auckland (UTC+12) fica no dia civil de Auckland", () => {
    // 23:30 de 15-Jun em Auckland = 11:30 UTC de 15-Jun. Dia civil NZ = 15.
    expect(computeServiceDate("2026-06-15", "Pacific/Auckland", "23:30")).toBe("2026-06-15");
  });

  it("reserva 00:30 em Auckland (UTC+12) — meia-noite local cai no dia anterior em UTC mas o service_date é o dia local", () => {
    // 00:30 de 15-Jun em Auckland = 12:30 UTC de 14-Jun. Dia civil NZ = 15.
    expect(computeServiceDate("2026-06-15", "Pacific/Auckland", "00:30")).toBe("2026-06-15");
  });

  it("reserva 23:30 em Honolulu (UTC-10) fica no dia local mesmo com UTC já no dia seguinte", () => {
    // 23:30 de 15-Jun em Honolulu = 09:30 UTC de 16-Jun. Dia civil HST = 15.
    expect(computeServiceDate("2026-06-15", "Pacific/Honolulu", "23:30")).toBe("2026-06-15");
  });
});

describe("computeReservedAt — instante UTC exacto da hora de parede no fuso do restaurante", () => {
  it("00:30 Lisboa (WEST, UTC+1) => 23:30Z do dia anterior", () => {
    expect(computeReservedAt("2026-06-15", "00:30", undefined, "Europe/Lisbon")).toBe(
      "2026-06-14T23:30:00.000Z",
    );
  });

  it("12:00 Lisboa (WEST, UTC+1) => 11:00Z do mesmo dia", () => {
    expect(computeReservedAt("2026-06-15", "12:00", undefined, "Europe/Lisbon")).toBe(
      "2026-06-15T11:00:00.000Z",
    );
  });

  it("12:00 Lisboa no Inverno (WET, UTC+0) => 12:00Z (prova que lê o DST da data)", () => {
    expect(computeReservedAt("2026-01-15", "12:00", undefined, "Europe/Lisbon")).toBe(
      "2026-01-15T12:00:00.000Z",
    );
  });

  it("23:30 Auckland (UTC+12) => 11:30Z do mesmo dia", () => {
    expect(computeReservedAt("2026-06-15", "23:30", undefined, "Pacific/Auckland")).toBe(
      "2026-06-15T11:30:00.000Z",
    );
  });

  it("usa o start_time do turno quando não há time explícito", () => {
    expect(computeReservedAt("2026-06-15", undefined, "20:00", "Europe/Lisbon")).toBe(
      "2026-06-15T19:00:00.000Z",
    );
  });

  it("New York (EDT, UTC-4) 22:00 => 02:00Z do dia seguinte", () => {
    expect(computeReservedAt("2026-06-15", "22:00", undefined, "America/New_York")).toBe(
      "2026-06-16T02:00:00.000Z",
    );
  });
});

describe("consistência service_date ↔ reserved_at", () => {
  it("o dia civil do reserved_at no fuso do restaurante == service_date", () => {
    const tz = "Pacific/Auckland";
    const date = "2026-06-15";
    const time = "00:30";
    const serviceDate = computeServiceDate(date, tz, time);
    const reservedAt = computeReservedAt(date, time, undefined, tz);
    const civilDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(reservedAt));
    expect(civilDay).toBe(serviceDate);
  });
});
