import { describe, expect, it } from "vitest";
import {
  addDays,
  canCompare,
  classifyDish,
  coveragePct,
  daysBetween,
  median,
  pctChange,
  periodFor,
  toFilterArray,
} from "./stats";

describe("períodos", () => {
  const hoje = new Date("2026-08-02T10:00:00Z");

  it("30 dias inclui hoje e tem 30 dias", () => {
    const { current } = periodFor("30d", hoje);
    expect(current.to).toBe("2026-08-02");
    expect(current.from).toBe("2026-07-04");
    expect(daysBetween(current.from, current.to)).toBe(30);
  });

  it("o homólogo não sobrepõe o período escolhido", () => {
    const { current, previous } = periodFor("30d", hoje);
    expect(previous.to).toBe(addDays(current.from, -1));
    expect(daysBetween(previous.from, previous.to)).toBe(30);
  });

  it("mês passado é o mês de calendário anterior, comparado com o anterior a esse", () => {
    const { current, previous } = periodFor("mes_passado", hoje);
    expect(current).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(previous).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("mês passado atravessa a viragem do ano", () => {
    const { current, previous } = periodFor("mes_passado", new Date("2026-01-15T00:00:00Z"));
    expect(current).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(previous).toEqual({ from: "2025-11-01", to: "2025-11-30" });
  });

  it("12 meses são 365 dias", () => {
    const { current } = periodFor("12m", hoje);
    expect(daysBetween(current.from, current.to)).toBe(365);
  });
});

describe("travões de amostra", () => {
  it("recusa comparar com poucos dias de serviço", () => {
    expect(canCompare(4, 500)).toBe(false);
  });

  it("recusa comparar com poucas unidades", () => {
    expect(canCompare(30, 12)).toBe(false);
  });

  it("aceita quando ambos passam", () => {
    expect(canCompare(8, 30)).toBe(true);
  });

  it("variação sobre base zero é null, não infinito", () => {
    expect(pctChange(120, 0)).toBeNull();
  });

  it("variação normal", () => {
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
  });
});

describe("cobertura", () => {
  it("null sem linhas (não 0%, que sugeriria falha de mapeamento)", () => {
    expect(coveragePct(0, 0)).toBeNull();
  });

  it("percentagem das linhas mapeadas", () => {
    expect(coveragePct(94, 100)).toBeCloseTo(94);
  });
});

describe("mediana", () => {
  it("ímpar", () => expect(median([3, 1, 2])).toBe(2));
  it("par", () => expect(median([4, 1, 3, 2])).toBe(2.5));
  it("vazio devolve 0", () => expect(median([])).toBe(0));
});

describe("quadrantes", () => {
  const medQty = 10;
  const medMargin = 60;

  it("vende muito e dá dinheiro", () => {
    expect(classifyDish(20, 70, medQty, medMargin)).toBe("estrela");
  });

  it("vende muito e dá pouco", () => {
    expect(classifyDish(20, 40, medQty, medMargin)).toBe("cavalo");
  });

  it("vende pouco e dá dinheiro", () => {
    expect(classifyDish(2, 80, medQty, medMargin)).toBe("enigma");
  });

  it("vende pouco e dá pouco", () => {
    expect(classifyDish(2, 30, medQty, medMargin)).toBe("cao");
  });

  it("o prato mediano conta como o lado bom (>=), não fica de fora", () => {
    expect(classifyDish(10, 60, medQty, medMargin)).toBe("estrela");
  });
});

describe("filtros", () => {
  it("selecção vazia significa sem filtro", () => {
    expect(toFilterArray([])).toBeNull();
  });

  it("selecção com itens passa tal e qual", () => {
    expect(toFilterArray([1, 6])).toEqual([1, 6]);
  });
});
