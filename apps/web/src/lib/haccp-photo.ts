// Cálculo de redimensionamento de fotografias de evidência (item 6, B1). Puro:
// o desenho no canvas e o upload vivem na UI; aqui só a matemática das
// dimensões, para ser testável. Regra: máximo 1600 px no lado maior, sem
// AMPLIAR imagens já pequenas (só encolher).

export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.8;

export interface Dimensions {
  width: number;
  height: number;
}

// Devolve as dimensões alvo mantendo o rácio. Se já cabe em `maxEdge`, devolve
// as originais (nunca amplia). Arredonda a inteiros (o canvas quer pixéis).
export function fitDimensions(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): Dimensions {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Convenção do bucket haccp-evidence: o 1.º segmento é o tenant (a policy de
// storage valida-o). `<restaurant_id>/<yyyy>/<uuid>.jpg`.
export function photoPath(restaurantId: string, year: number, uuid: string): string {
  return `${restaurantId}/${year}/${uuid}.jpg`;
}
