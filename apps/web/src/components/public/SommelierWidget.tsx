import * as React from "react";
import { Wine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatPriceCents } from "@/lib/types";
import {
  PRICE_RANGES,
  type PriceRange,
  type SommelierResult,
  type SommelierSuggestion,
} from "@/lib/sommelier";

// Sommelier Virtual no menu público (/m/{slug}). Specs David 07-Jul: o
// cliente responde a DUAS perguntas antes das sugestões — range de preço e
// região/casta/dica de gosto — com prato opcional. As sugestões vêm SEMPRE
// da carta da casa (whitelist na edge function).

export function SommelierWidget({
  slug,
  dishNames,
}: {
  slug: string;
  dishNames: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [dish, setDish] = React.useState("");
  const [priceRange, setPriceRange] = React.useState<PriceRange>("indiferente");
  const [preference, setPreference] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<SommelierSuggestion[] | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  function reset() {
    setSuggestions(null);
    setNote(null);
    setError(null);
  }

  async function ask() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sommelier-pairing", {
        body: {
          slug,
          dishName: dish || null,
          priceRange,
          preference: preference.trim() || null,
        },
      });
      if (fnError) throw fnError;
      const result = data as SommelierResult;
      if (!result.suggested || !result.suggestions) {
        setError(
          result.reason === "limite diário do sommelier atingido"
            ? "O sommelier já atendeu muita gente hoje. Pergunta ao staff, que sabe tudo."
            : "O sommelier não conseguiu responder agora. Tenta outra vez ou pergunta ao staff.",
        );
        return;
      }
      setSuggestions(result.suggestions);
      setNote(result.note ?? null);
    } catch {
      setError("O sommelier não conseguiu responder agora. Tenta outra vez ou pergunta ao staff.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="sticky bottom-4 z-10 flex w-full justify-center">
        <Button
          size="lg"
          className="rounded-full shadow-lg"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Wine className="h-5 w-5" aria-hidden /> Pedir sugestão ao sommelier
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="O sommelier da casa"
        description="Duas perguntas rápidas e sugerimos vinhos da nossa carta."
      >
        {suggestions ? (
          <div className="space-y-4">
            <ul className="space-y-3">
              {suggestions.map((s) => (
                <li key={s.wine} className="rounded-lg border border-input p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-semibold">{s.wine}</p>
                    <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                      {formatPriceCents(s.priceCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.reason}</p>
                </li>
              ))}
            </ul>
            {note && <p className="text-sm italic text-muted-foreground">{note}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={reset}>
                Perguntar outra vez
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Para que prato? (opcional)</p>
              <Select
                aria-label="Prato"
                value={dish}
                onChange={(e) => setDish(e.target.value)}
              >
                <option value="">Para a refeição em geral</option>
                {dishNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">1. Quanto queres gastar na garrafa?</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Range de preço">
                {PRICE_RANGES.map((r) => {
                  const on = priceRange === r.code;
                  return (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => setPriceRange(r.code)}
                      aria-pressed={on}
                      className={
                        "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                        (on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-muted")
                      }
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">2. Região, casta ou o teu gosto?</p>
              <Input
                aria-label="Região, casta ou gosto pessoal"
                maxLength={200}
                placeholder="Ex.: Douro · Alvarinho · gosto de tintos encorpados"
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    ask();
                  }
                }}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button className="w-full" disabled={loading} onClick={ask}>
              {loading ? "O sommelier está a pensar..." : "Sugerir vinhos"}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
