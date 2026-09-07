// Estatística descritiva pura para a vista mensal por ponto de controlo
// (item 2, A3). Sem React nem I/O: recebe números e devolve o resumo, para
// testar e reutilizar. O desvio-padrão é POPULACIONAL (o conjunto de leituras
// do mês é a população, não uma amostra dela): assim, valores todos iguais dão
// exactamente 0, que é o sinal que a UI usa para o aviso de registo não real.

export interface HaccpStats {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  stdDev: number | null;
  distinct: number;
}

export function computeStats(values: number[]): HaccpStats {
  const n = values.length;
  if (n === 0) {
    return { count: 0, min: null, max: null, mean: null, stdDev: null, distinct: 0 };
  }
  let min = values[0];
  let max = values[0];
  let sum = 0;
  const seen = new Set<number>();
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    seen.add(v);
  }
  const mean = sum / n;
  let sqDiff = 0;
  for (const v of values) sqDiff += (v - mean) * (v - mean);
  const stdDev = Math.sqrt(sqDiff / n);
  return { count: n, min, max, mean, stdDev, distinct: seen.size };
}

// O aviso âmbar da vista mensal: desvio-padrão exactamente 0 com 10 ou mais
// registos ("valores sempre iguais" = um inspector lê como registo não real).
export function isFlatline(stats: HaccpStats, minReadings = 10): boolean {
  return stats.count >= minReadings && stats.stdDev === 0;
}
