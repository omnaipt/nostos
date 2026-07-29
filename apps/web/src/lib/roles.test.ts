import { describe, expect, it } from "vitest";
import { canAccess, homeForRole, navForRole, type MemberRole } from "./roles";

describe("canAccess", () => {
  it("owner e gestor acedem a tudo", () => {
    for (const role of ["owner", "gestor"] as MemberRole[]) {
      for (const path of ["/", "/disponibilidade", "/balcao", "/ementa", "/margens", "/despensa", "/definicoes"]) {
        expect(canAccess(role, path)).toBe(true);
      }
    }
  });

  it("balcão vê só Balcão e Clientes", () => {
    expect(canAccess("balcao", "/balcao")).toBe(true);
    expect(canAccess("balcao", "/clientes")).toBe(true);
    expect(canAccess("balcao", "/margens")).toBe(false);
    expect(canAccess("balcao", "/despensa")).toBe(false);
    expect(canAccess("balcao", "/definicoes")).toBe(false);
    expect(canAccess("balcao", "/")).toBe(false);
  });

  it("cozinha vê ementa/despensa/entradas/inventário, não reservas nem margens", () => {
    expect(canAccess("cozinha", "/ementa")).toBe(true);
    expect(canAccess("cozinha", "/despensa")).toBe(true);
    expect(canAccess("cozinha", "/entradas")).toBe(true);
    expect(canAccess("cozinha", "/inventario")).toBe(true);
    expect(canAccess("cozinha", "/disponibilidade")).toBe(false);
    expect(canAccess("cozinha", "/margens")).toBe(false);
    expect(canAccess("cozinha", "/balcao")).toBe(false);
  });

  it("sub-rotas herdam do prefixo; '/' casa exacto", () => {
    expect(canAccess("cozinha", "/ementa/rever/abc")).toBe(true);
    expect(canAccess("owner", "/ementa/rever/abc")).toBe(true);
    // '/' não deve casar sub-rotas por prefixo
    expect(canAccess("balcao", "/balcaoxpto")).toBe(false);
  });
});

describe("homeForRole", () => {
  it("balcão abre no /balcao, cozinha na ementa, owner/gestor no Início", () => {
    expect(homeForRole("balcao")).toBe("/balcao");
    expect(homeForRole("cozinha")).toBe("/ementa");
    expect(homeForRole("owner")).toBe("/");
    expect(homeForRole("gestor")).toBe("/");
  });
});

describe("navForRole", () => {
  it("balcão só tem Balcão e Clientes, por esta ordem", () => {
    expect(navForRole("balcao").map((n) => n.to)).toEqual(["/balcao", "/clientes"]);
  });
  it("cozinha não vê Definições nem Reservas", () => {
    const tos = navForRole("cozinha").map((n) => n.to);
    expect(tos).toContain("/ementa");
    expect(tos).not.toContain("/definicoes");
    expect(tos).not.toContain("/disponibilidade");
  });
  it("owner vê o Início e o Balcão", () => {
    const tos = navForRole("owner").map((n) => n.to);
    expect(tos).toContain("/");
    expect(tos).toContain("/balcao");
    expect(tos).toContain("/definicoes");
  });
});
