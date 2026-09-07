// Teclado numérico de temperaturas (item 3, A2) — lógica pura, sem React.
// Regras: sinal negativo à frente, vírgula decimal única, no máximo UMA casa
// decimal, intervalo válido -60..200 °C (o mesmo do CHECK da tabela). O input
// é acumulado como texto ("3,5", "-18") e só se converte a número no fim.

export type KeypadKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | ","
  | "-"
  | "back"
  | "clear";

export const TEMP_MIN = -60;
export const TEMP_MAX = 200;

// Aplica uma tecla ao texto actual e devolve o texto seguinte. Nunca lança:
// teclas inválidas no contexto são ignoradas (ex.: 2.ª vírgula, 2.ª decimal).
export function appendKey(current: string, key: KeypadKey): string {
  switch (key) {
    case "clear":
      return "";
    case "back":
      return current.slice(0, -1);
    case "-":
      // Alterna o sinal à frente.
      return current.startsWith("-") ? current.slice(1) : "-" + current;
    case ",": {
      if (current.includes(",")) return current; // uma só vírgula
      if (current === "" ) return "0,";
      if (current === "-") return "-0,";
      return current + ",";
    }
    default: {
      // Dígito: barra uma segunda casa decimal.
      const commaAt = current.indexOf(",");
      if (commaAt >= 0 && current.length - commaAt - 1 >= 1) return current;
      return current + key;
    }
  }
}

// Converte o texto do teclado para número em °C, ou null se incompleto /
// inválido / fora do intervalo. Aceita "-", ",", uma casa decimal.
export function parseTempInput(text: string): number | null {
  if (!text) return null;
  // Incompleto: só sinal, só vírgula, ou a acabar em vírgula.
  if (text === "-" || text === "," || text === "-," || text.endsWith(",")) return null;
  // Forma válida: sinal opcional, dígitos, opcional vírgula + 1 dígito.
  if (!/^-?\d+(,\d)?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  if (value < TEMP_MIN || value > TEMP_MAX) return null;
  return value;
}

// Formata um número em °C para o texto do teclado ("3,5", "-18"). Uma casa
// decimal no máximo; inteiros ficam sem vírgula.
export function formatTemp(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return s.replace(".", ",");
}
