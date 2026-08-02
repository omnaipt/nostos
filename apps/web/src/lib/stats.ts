// Estatísticas v0 — funções puras. Spec: Spec_Modulo_Estatistico.md (02-08).
//
// Duas ideias mandam neste ficheiro:
//
// 1. Períodos vêm sempre aos pares (o escolhido e o homólogo imediatamente
//    anterior, do mesmo comprimento). Um número sozinho não diz nada ao dono.
// 2. Nada de tendências com pouca amostra. "Terças, jantar, mês passado" são
//    quatro pontos; mostrar variação sobre isso é produzir disparate com ar de
//    certeza, e a credibilidade morre no primeiro uso.

export type PeriodKey = "30d" | "mes_passado" | "3m" | "12m";

export interface Period {
  from: string; // ISO yyyy-mm-dd
  to: string;
}

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  "30d": "Últimos 30 dias",
  mes_passado: "Mês passado",
  "3m": "Últimos 3 meses",
  "12m": "Últimos 12 meses",
};

export const PERIOD_KEYS: PeriodKey[] = ["30d", "mes_passado", "3m", "12m"];

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  return Math.round((b - a) / 86400000) + 1;
}

// Período escolhido + homólogo. O homólogo é o bloco de igual comprimento
// imediatamente antes, excepto no "mês passado", em que é o mês anterior a
// esse (comparar Julho com Junho é o que o dono faz de cabeça).
export function periodFor(key: PeriodKey, today: Date): { current: Period; previous: Period } {
  const hoje = toISODate(today);

  if (key === "mes_passado") {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth(); // 0-11, mês corrente
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    const prevStart = new Date(Date.UTC(y, m - 2, 1));
    const prevEnd = new Date(Date.UTC(y, m - 1, 0));
    return {
      current: { from: toISODate(start), to: toISODate(end) },
      previous: { from: toISODate(prevStart), to: toISODate(prevEnd) },
    };
  }

  const span = key === "30d" ? 30 : key === "3m" ? 90 : 365;
  const from = addDays(hoje, -(span - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  return {
    current: { from, to: hoje },
    previous: { from: prevFrom, to: prevTo },
  };
}

// Travões de honestidade estatística (§6 da spec). Abaixo destes limiares a UI
// mostra o número absoluto e esconde a variação.
export const MIN_DAYS_FOR_TREND = 8;
export const MIN_UNITS_FOR_TREND = 30;

export function canCompare(days: number, units: number): boolean {
  return days >= MIN_DAYS_FOR_TREND && units >= MIN_UNITS_FOR_TREND;
}

// Variação percentual. null quando a base é zero: "subiu infinito" não é
// informação, é uma divisão por zero com fato de domingo.
export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}

export function coveragePct(mapped: number, total: number): number | null {
  if (total <= 0) return null;
  return (mapped / total) * 100;
}

export const COVERAGE_WARN_PCT = 85;

// ── Engenharia de menu ──────────────────────────────────────────────────────
// Quatro quadrantes por volume e margem, contra a MEDIANA do próprio menu (não
// contra uma constante inventada: cada casa é a sua própria referência).

// Abaixo disto a mediana parte um punhado de pratos quase ao meio e a
// classificação vira sorteio: um prato a 110 unidades contra uma mediana de
// 125 aparece como "candidato a sair da ementa", o que não se sustenta. O
// quadro continua a mostrar-se, com a ressalva à vista.
export const MIN_DISHES_FOR_QUADRANTS = 10;

export type Quadrant = "estrela" | "cavalo" | "enigma" | "cao";

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  estrela: "Vende muito, margem alta",
  cavalo: "Vende muito, margem baixa",
  enigma: "Vende pouco, margem alta",
  cao: "Vende pouco, margem baixa",
};

export const QUADRANT_ACTION: Record<Quadrant, string> = {
  estrela: "Garantir disponibilidade e dar destaque na ementa e no menu digital.",
  cavalo: "Rever a ficha, o fornecedor, ou subir o preço com cuidado.",
  enigma: "Pouca visibilidade: mudar de posição na ementa e sugerir à mesa.",
  cao: "Candidato a sair da ementa.",
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function classifyDish(
  qty: number,
  marginPct: number,
  medianQty: number,
  medianMargin: number,
): Quadrant {
  const vendeMuito = qty >= medianQty;
  const daDinheiro = marginPct >= medianMargin;
  if (vendeMuito && daDinheiro) return "estrela";
  if (vendeMuito && !daDinheiro) return "cavalo";
  if (!vendeMuito && daDinheiro) return "enigma";
  return "cao";
}

// ── Dias da semana ──────────────────────────────────────────────────────────
// ISO: 1 = Segunda ... 7 = Domingo (igual a turns.weekdays).

export const WEEKDAYS: { n: number; short: string; label: string }[] = [
  { n: 1, short: "Seg", label: "Segunda" },
  { n: 2, short: "Ter", label: "Terça" },
  { n: 3, short: "Qua", label: "Quarta" },
  { n: 4, short: "Qui", label: "Quinta" },
  { n: 5, short: "Sex", label: "Sexta" },
  { n: 6, short: "Sáb", label: "Sábado" },
  { n: 7, short: "Dom", label: "Domingo" },
];

// Um array vazio de filtro significa "sem filtro" e vai como null para o SQL.
// Distinguir isto de "seleccionou zero" evita um ecrã em branco sem explicação.
export function toFilterArray<T>(picked: T[]): T[] | null {
  return picked.length === 0 ? null : picked;
}

export function formatEuroCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

export function formatQty(qty: number): string {
  const rounded = Math.round(qty * 100) / 100;
  return rounded.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
}
