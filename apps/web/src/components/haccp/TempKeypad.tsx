import * as React from "react";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { appendKey, parseTempInput, type KeypadKey } from "@/lib/haccp-keypad";

// Teclado numérico próprio (item 3, A2): dígitos grandes, sinal negativo,
// vírgula decimal, uma casa decimal, alvos ≥ 56 px, usável com uma mão. A
// lógica de parsing é pura (lib/haccp-keypad.ts); aqui só a apresentação.

const DIGIT_KEYS: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

export function TempKeypad({
  initial = "",
  confirmLabel = "Confirmar",
  onConfirm,
  disabled = false,
}: {
  initial?: string;
  confirmLabel?: string;
  onConfirm: (value: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = React.useState(initial);
  const value = parseTempInput(text);

  const press = (k: KeypadKey) => setText((t) => appendKey(t, k));

  const keyBtn =
    "h-16 rounded-xl border border-input bg-card text-2xl font-semibold text-foreground transition-colors hover:bg-muted active:bg-muted";

  return (
    <div className="space-y-3">
      <div
        aria-live="polite"
        className="flex h-20 items-center justify-center rounded-xl border border-input bg-muted/30 text-5xl font-semibold tabular-nums"
      >
        {text === "" ? <span className="text-muted-foreground">—</span> : text}
        <span className="ml-2 text-2xl text-muted-foreground">°C</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {DIGIT_KEYS.flat().map((k) => (
          <button key={k} type="button" className={keyBtn} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        <button type="button" className={keyBtn} onClick={() => press(",")} aria-label="vírgula">
          ,
        </button>
        <button type="button" className={keyBtn} onClick={() => press("0")}>
          0
        </button>
        <button
          type="button"
          className={keyBtn}
          onClick={() => press("-")}
          aria-label="sinal negativo"
        >
          ±
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={keyBtn + " col-span-1 flex items-center justify-center"}
          onClick={() => press("back")}
          aria-label="apagar"
        >
          <Delete className="h-6 w-6" />
        </button>
        <Button
          type="button"
          size="lg"
          className="col-span-2 h-16 text-lg"
          disabled={disabled || value === null}
          onClick={() => value !== null && onConfirm(value)}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
