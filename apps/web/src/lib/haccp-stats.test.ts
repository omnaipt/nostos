import { describe, expect, it } from "vitest";
import { computeStats, isFlatline } from "./haccp-stats";

describe("computeStats", () => {
  it("lista vazia devolve nulos e contagem zero", () => {
    expect(computeStats([])).toEqual({
      count: 0,
      min: null,
      max: null,
      mean: null,
      stdDev: null,
      distinct: 0,
    });
  });

  it("um único valor tem desvio-padrão zero", () => {
    const s = computeStats([4.2]);
    expect(s.count).toBe(1);
    expect(s.min).toBe(4.2);
    expect(s.max).toBe(4.2);
    expect(s.mean).toBe(4.2);
    expect(s.stdDev).toBe(0);
    expect(s.distinct).toBe(1);
  });

  it("min, max e média corretos", () => {
    const s = computeStats([2, 4, 6]);
    expect(s.min).toBe(2);
    expect(s.max).toBe(6);
    expect(s.mean).toBe(4);
  });

  it("desvio-padrão populacional", () => {
    // valores [2,4,6]: média 4, variância (4+0+4)/3 = 2.6667, sqrt ≈ 1.63299
    const s = computeStats([2, 4, 6]);
    expect(s.stdDev).toBeCloseTo(1.632993, 5);
  });

  it("valores todos iguais dão desvio-padrão exactamente 0", () => {
    const s = computeStats([3, 3, 3, 3]);
    expect(s.stdDev).toBe(0);
    expect(s.distinct).toBe(1);
  });

  it("conta valores distintos", () => {
    expect(computeStats([1, 1, 2, 3, 3, 3]).distinct).toBe(3);
  });

  it("aceita negativos (congelação)", () => {
    const s = computeStats([-18, -20, -19]);
    expect(s.min).toBe(-20);
    expect(s.max).toBe(-18);
    expect(s.mean).toBeCloseTo(-19, 5);
  });
});

describe("isFlatline", () => {
  it("verdadeiro quando desvio 0 com 10+ registos", () => {
    expect(isFlatline(computeStats(Array(12).fill(4)))).toBe(true);
  });

  it("falso com menos de 10 registos ainda que iguais", () => {
    expect(isFlatline(computeStats([4, 4, 4]))).toBe(false);
  });

  it("falso quando há variação", () => {
    expect(isFlatline(computeStats([4, 4, 4, 4, 4, 4, 4, 4, 4, 5]))).toBe(false);
  });

  it("falso na lista vazia", () => {
    expect(isFlatline(computeStats([]))).toBe(false);
  });
});
