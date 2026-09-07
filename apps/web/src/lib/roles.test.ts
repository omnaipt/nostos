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

  it("cozinha e balcão acedem ao HACCP e às suas sub-rotas", () => {
    expect(canAccess("cozinha", "/haccp")).toBe(true);
    expect(canAccess("cozinha", "/haccp/registar/x")).toBe(true);
    expect(canAccess("balcao", "/haccp")).toBe(true);
    expect(canAccess("balcao", "/haccp/recepcao")).toBe(true);
  });

  it("consultor só acede a /haccp e suas sub-rotas, mais nada", () => {
    expect(canAccess("consultor", "/haccp")).toBe(true);
    expect(canAccess("consultor", "/haccp/nc/abc")).toBe(true);
    expect(canAccess("consultor", "/haccp/pontos")).toBe(true);
    expect(canAccess("consultor", "/")).toBe(false);
    expect(canAccess("consultor", "/balcao")).toBe(false);
    expect(canAccess("consultor", "/despensa")).toBe(false);
    expect(canAccess("consultor", "/definicoes")).toBe(false);
    // '/haccp' não casa por prefixo cru: uma rota irmã não pertence ao consultor.
    expect(canAccess("consultor", "/haccpxpto")).toBe(false);
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
  it("consultor abre no HACCP", () => {
    expect(homeForRole("consultor")).toBe("/haccp");
  });
});

describe("navForRole", () => {
  it("balcão tem Balcão, HACCP e Clientes, pela ordem do ALL_NAV", () => {
    expect(navForRole("balcao").map((n) => n.to)).toEqual(["/balcao", "/haccp", "/clientes"]);
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
    expect(tos).toContain("/haccp");
  });
  it("consultor só vê o HACCP na navegação", () => {
    expect(navForRole("consultor").map((n) => n.to)).toEqual(["/haccp"]);
  });
});
