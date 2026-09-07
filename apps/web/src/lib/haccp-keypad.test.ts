import { describe, expect, it } from "vitest";
import { appendKey, formatTemp, parseTempInput } from "./haccp-keypad";

describe("appendKey", () => {
  it("acumula dígitos", () => {
    let t = "";
    for (const k of ["1", "8"] as const) t = appendKey(t, k);
    expect(t).toBe("18");
  });

  it("alterna o sinal à frente", () => {
    expect(appendKey("18", "-")).toBe("-18");
    expect(appendKey("-18", "-")).toBe("18");
  });

  it("aceita só uma vírgula e no máximo uma casa decimal", () => {
    expect(appendKey("3", ",")).toBe("3,");
    expect(appendKey("3,", ",")).toBe("3,"); // 2.ª vírgula ignorada
    expect(appendKey("3,5", "0")).toBe("3,5"); // 2.ª decimal ignorada
  });

  it("vírgula sem parte inteira gera zero à frente", () => {
    expect(appendKey("", ",")).toBe("0,");
    expect(appendKey("-", ",")).toBe("-0,");
  });

  it("back apaga o último caractere e clear limpa tudo", () => {
    expect(appendKey("3,5", "back")).toBe("3,");
    expect(appendKey("3,5", "clear")).toBe("");
  });
});

describe("parseTempInput", () => {
  it("converte vírgula decimal e sinal", () => {
    expect(parseTempInput("3,5")).toBe(3.5);
    expect(parseTempInput("-18")).toBe(-18);
    expect(parseTempInput("0")).toBe(0);
  });

  it("rejeita input incompleto", () => {
    expect(parseTempInput("")).toBeNull();
    expect(parseTempInput("-")).toBeNull();
    expect(parseTempInput(",")).toBeNull();
    expect(parseTempInput("3,")).toBeNull();
  });

  it("rejeita fora do intervalo -60..200", () => {
    expect(parseTempInput("201")).toBeNull();
    expect(parseTempInput("-61")).toBeNull();
    expect(parseTempInput("200")).toBe(200);
    expect(parseTempInput("-60")).toBe(-60);
  });

  it("rejeita mais de uma casa decimal ou lixo", () => {
    expect(parseTempInput("3,55")).toBeNull();
    expect(parseTempInput("3.5")).toBeNull();
    expect(parseTempInput("abc")).toBeNull();
  });
});

describe("formatTemp", () => {
  it("uma casa decimal, vírgula, sem decimal para inteiros", () => {
    expect(formatTemp(3.5)).toBe("3,5");
    expect(formatTemp(-18)).toBe("-18");
    expect(formatTemp(4)).toBe("4");
  });
});
