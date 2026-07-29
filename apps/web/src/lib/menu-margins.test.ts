import { describe, expect, it } from "vitest";
import { computeMenuMargins } from "@/lib/types";

// computeMenuMargins (S3): ranking piores-primeiro, alertas abaixo do alvo,
// food cost médio só sobre fichas completas com PVP.

const ings = new Map([
  ["bacalhau", { unit: "kg", cost_per_unit_cents: 1250 }],
  ["semcusto", { unit: "un", cost_per_unit_cents: null }],
]);

const items = [
  { id: "prato-bom", name: "Prato bom", price_cents: 2000, active: true },
  { id: "prato-mau", name: "Prato mau", price_cents: 500, active: true },
  { id: "prato-parcial", name: "Prato parcial", price_cents: 1000, active: true },
  { id: "sem-ficha", name: "Sem ficha", price_cents: 900, active: true },
  { id: "inactivo", name: "Inactivo", price_cents: 100, active: false },
];

const sheets = [
  { id: "s-bom", menu_item_id: "prato-bom" },
  { id: "s-mau", menu_item_id: "prato-mau" },
  { id: "s-parcial", menu_item_id: "prato-parcial" },
];

const lines = [
  // bom: 300g de bacalhau a 1250c/kg = 375c → margem (2000-375)/2000 = 81.25%
  { tech_sheet_id: "s-bom", qty: 300, unit: "g", ingredient_id: "bacalhau" },
  // mau: 320g = 400c sobre PVP 500 → margem 20% (abaixo de alvo 65)
  { tech_sheet_id: "s-mau", qty: 320, unit: "g", ingredient_id: "bacalhau" },
  // parcial: 1 linha com custo + 1 sem
  { tech_sheet_id: "s-parcial", qty: 100, unit: "g", ingredient_id: "bacalhau" },
  { tech_sheet_id: "s-parcial", qty: 1, unit: "un", ingredient_id: "semcusto" },
];

describe("computeMenuMargins", () => {
  const r = computeMenuMargins(items, sheets, lines, ings, 65);

  it("exclui inactivos; completas primeiro (piores no topo), parciais depois, sem ficha no fim", () => {
    expect(r.rows.map((x) => x.itemId)).toEqual([
      "prato-mau", // completa, 20%
      "prato-bom", // completa, 81.25%
      "prato-parcial", // parcial: margem aparente optimista, nunca à frente das completas
      "sem-ficha",
    ]);
  });

  it("marca abaixo do alvo só em fichas completas", () => {
    const mau = r.rows.find((x) => x.itemId === "prato-mau");
    const parcial = r.rows.find((x) => x.itemId === "prato-parcial");
    expect(mau?.belowTarget).toBe(true);
    expect(mau?.marginPct).toBeCloseTo(20, 5);
    // parcial tem margem aparente baixa mas NÃO conta como alerta
    expect(parcial?.complete).toBe(false);
    expect(parcial?.belowTarget).toBe(false);
  });

  it("food cost médio só sobre completas com PVP: (375/2000 + 400/500)/2", () => {
    expect(r.completeCount).toBe(2);
    expect(r.avgFoodCostPct).toBeCloseTo(((375 / 2000) * 100 + (400 / 500) * 100) / 2, 5);
    expect(r.belowTargetCount).toBe(1);
  });

  it("sem ficha: sem margem, sem alerta", () => {
    const sf = r.rows.find((x) => x.itemId === "sem-ficha");
    expect(sf?.hasSheet).toBe(false);
    expect(sf?.marginPct).toBeNull();
    expect(sf?.belowTarget).toBe(false);
  });

  it("menu vazio", () => {
    const vazio = computeMenuMargins([], [], [], ings, 65);
    expect(vazio.rows).toEqual([]);
    expect(vazio.avgFoodCostPct).toBeNull();
  });
});

// Gap E: pratos `variants` (price_cents null) calculam pela variante principal
// (is_default; fallback primeira com preço) e contam nos alertas e no
// completeCount.
describe("computeMenuMargins · pratos variants", () => {
  const vItems = [
    { id: "var-default", name: "Bacalhau à casa", price_cents: null, active: true },
    { id: "var-sem-default", name: "Arroz de marisco", price_cents: null, active: true },
    { id: "var-sem-preco", name: "Peixe do dia", price_cents: null, active: true },
  ];
  const vSheets = [
    { id: "s-vd", menu_item_id: "var-default" },
    { id: "s-vsd", menu_item_id: "var-sem-default" },
    { id: "s-vsp", menu_item_id: "var-sem-preco" },
  ];
  const vLines = [
    // 320g bacalhau = 400c em todas, para comparar só o PVP efectivo
    { tech_sheet_id: "s-vd", qty: 320, unit: "g", ingredient_id: "bacalhau" },
    { tech_sheet_id: "s-vsd", qty: 320, unit: "g", ingredient_id: "bacalhau" },
    { tech_sheet_id: "s-vsp", qty: 320, unit: "g", ingredient_id: "bacalhau" },
  ];
  const variants = new Map([
    // default (dose) 500c apesar de a ½ dose vir primeiro → margem 20%, alerta
    ["var-default", [
      { price_cents: 300, is_default: false },
      { price_cents: 500, is_default: true },
    ]],
    // sem default marcada → primeira com preço (2000) → margem 80%
    ["var-sem-default", [
      { price_cents: null, is_default: false },
      { price_cents: 2000, is_default: false },
    ]],
    // nenhuma variante com preço (preço do dia) → sem PVP, sem alerta
    ["var-sem-preco", [{ price_cents: null, is_default: false }]],
  ]);

  const r = computeMenuMargins(vItems, vSheets, vLines, ings, 65, variants);

  it("usa a variante default e marca viaVariant", () => {
    const vd = r.rows.find((x) => x.itemId === "var-default");
    expect(vd?.priceCents).toBe(500);
    expect(vd?.viaVariant).toBe(true);
    expect(vd?.marginPct).toBeCloseTo(20, 5);
    expect(vd?.belowTarget).toBe(true);
  });

  it("sem default cai na primeira variante com preço", () => {
    const vsd = r.rows.find((x) => x.itemId === "var-sem-default");
    expect(vsd?.priceCents).toBe(2000);
    expect(vsd?.marginPct).toBeCloseTo(80, 5);
    expect(vsd?.belowTarget).toBe(false);
  });

  it("variantes todas sem preço (preço do dia): sem PVP, sem alerta", () => {
    const vsp = r.rows.find((x) => x.itemId === "var-sem-preco");
    expect(vsp?.priceCents).toBeNull();
    expect(vsp?.marginPct).toBeNull();
    expect(vsp?.belowTarget).toBe(false);
  });

  it("variants completos com PVP contam no completeCount e nos alertas", () => {
    expect(r.completeCount).toBe(2); // var-default + var-sem-default
    expect(r.belowTargetCount).toBe(1);
  });
});
