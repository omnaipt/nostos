import { describe, expect, it } from "vitest";
import { fitDimensions, photoPath } from "./haccp-photo";

describe("fitDimensions", () => {
  it("encolhe pela maior aresta mantendo o rácio (paisagem)", () => {
    expect(fitDimensions(3200, 2400)).toEqual({ width: 1600, height: 1200 });
  });

  it("encolhe pela maior aresta (retrato)", () => {
    expect(fitDimensions(2400, 3200)).toEqual({ width: 1200, height: 1600 });
  });

  it("não amplia imagens já pequenas", () => {
    expect(fitDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("no limite exacto devolve as originais", () => {
    expect(fitDimensions(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  it("arredonda a inteiros", () => {
    expect(fitDimensions(1000, 333, 500)).toEqual({ width: 500, height: 167 });
  });

  it("dimensões inválidas devolvem zero", () => {
    expect(fitDimensions(0, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("photoPath", () => {
  it("começa pelo tenant e acaba em .jpg", () => {
    expect(photoPath("rest-1", 2026, "uuid-x")).toBe("rest-1/2026/uuid-x.jpg");
  });
});
