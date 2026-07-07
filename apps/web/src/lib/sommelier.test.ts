import { describe, expect, it } from "vitest";
import { isWineCategory, normalizeName } from "@/lib/sommelier";

// Detecção de categorias de vinhos e normalização de nomes (whitelist do
// sommelier). A normalização tem de igualar a da edge function.

describe("normalizeName", () => {
  it("remove acentos, caixa e pontuação", () => {
    expect(normalizeName("Douro DOC — Quinta do Vale")).toBe("douro doc quinta do vale");
    expect(normalizeName("  Vinho  Verde   Alvarinho ")).toBe("vinho verde alvarinho");
  });

  it("iguala variantes com/sem acentos", () => {
    expect(normalizeName("Água das Pedras")).toBe(normalizeName("Agua das pedras"));
  });
});

describe("isWineCategory", () => {
  it("aceita variantes com 'vinho'", () => {
    expect(isWineCategory("Vinhos")).toBe(true);
    expect(isWineCategory("Vinhos e Bebidas")).toBe(true);
    expect(isWineCategory("Carta de VINHOS")).toBe(true);
    expect(isWineCategory("Vinho a copo")).toBe(true);
  });

  it("rejeita categorias sem vinho", () => {
    expect(isWineCategory("Bebidas")).toBe(false);
    expect(isWineCategory("Sobremesas")).toBe(false);
    expect(isWineCategory("Entradas")).toBe(false);
  });
});
