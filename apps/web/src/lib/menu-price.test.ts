import { describe, it, expect } from "vitest";
import { formatPriceCents, parsePriceToCents } from "./types";

// Helpers puros do Menu Digital: conversão preço <-> cêntimos. Aceita vírgula
// (PT) e ponto, com/sem símbolo de euro; rejeita vazio/negativo/inválido.

describe("parsePriceToCents", () => {
  it("aceita vírgula e ponto decimais", () => {
    expect(parsePriceToCents("12,50")).toBe(1250);
    expect(parsePriceToCents("12.5")).toBe(1250);
    expect(parsePriceToCents("8")).toBe(800);
  });
  it("remove espaços e símbolo de euro", () => {
    expect(parsePriceToCents(" 12,50 € ")).toBe(1250);
  });
  it("devolve null para vazio ou inválido", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
    expect(parsePriceToCents("-3")).toBeNull();
  });
});

describe("formatPriceCents", () => {
  it("formata cêntimos em euros pt-PT", () => {
    const s = formatPriceCents(1250);
    expect(s).toMatch(/12,50/);
    expect(s).toMatch(/€/);
  });
  it("mostra travessão quando não há preço", () => {
    expect(formatPriceCents(null)).toBe("—");
  });
});
