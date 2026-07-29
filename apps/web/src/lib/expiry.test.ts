import { describe, expect, it } from "vitest";
import { estimateExpiryDate, resolveShelfLifeDays } from "@/lib/expiry";

// Resolução de validade (Gap G): override > (categoria, modo) > ('*', modo).

const DEFAULTS = [
  { category: "peixe-fresco", storage_mode: "refrigerado", shelf_life_days: 1 },
  { category: "mercearia", storage_mode: "ambiente", shelf_life_days: 180 },
  { category: "congelado-peixe", storage_mode: "congelado", shelf_life_days: 90 },
  { category: "*", storage_mode: "refrigerado", shelf_life_days: 3 },
  { category: "*", storage_mode: "ambiente", shelf_life_days: 180 },
  { category: "*", storage_mode: "congelado", shelf_life_days: 90 },
];

describe("resolveShelfLifeDays", () => {
  it("peixe fresco refrigerado: 1 dia (aceitação 5)", () => {
    expect(
      resolveShelfLifeDays(
        { category: "peixe-fresco", storage_mode: "refrigerado", shelf_life_override_days: null },
        DEFAULTS,
      ),
    ).toBe(1);
  });

  it("mercearia ambiente: 180 dias (aceitação 5)", () => {
    expect(
      resolveShelfLifeDays(
        { category: "mercearia", storage_mode: "ambiente", shelf_life_override_days: null },
        DEFAULTS,
      ),
    ).toBe(180);
  });

  it("override do ingrediente vence a categoria", () => {
    expect(
      resolveShelfLifeDays(
        { category: "peixe-fresco", storage_mode: "refrigerado", shelf_life_override_days: 2 },
        DEFAULTS,
      ),
    ).toBe(2);
  });

  it("sem categoria cai no fallback conservador do modo", () => {
    expect(
      resolveShelfLifeDays(
        { category: null, storage_mode: "refrigerado", shelf_life_override_days: null },
        DEFAULTS,
      ),
    ).toBe(3);
  });

  it("categoria desconhecida cai no fallback do modo", () => {
    expect(
      resolveShelfLifeDays(
        { category: "exotico", storage_mode: "congelado", shelf_life_override_days: null },
        DEFAULTS,
      ),
    ).toBe(90);
  });

  it("sem defaults: null (UI não mostra validade)", () => {
    expect(
      resolveShelfLifeDays(
        { category: null, storage_mode: "refrigerado", shelf_life_override_days: null },
        [],
      ),
    ).toBeNull();
  });
});

describe("estimateExpiryDate", () => {
  it("soma dias em UTC", () => {
    expect(estimateExpiryDate("2026-07-29", 1)).toBe("2026-07-30");
    expect(estimateExpiryDate("2026-07-29", 180)).toBe("2027-01-25");
  });

  it("atravessa fim de mês e ano", () => {
    expect(estimateExpiryDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});
