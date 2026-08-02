import * as React from "react";
import { Wine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatPriceCents } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import {
  PRICE_RANGES,
  type PriceRange,
  type SommelierResult,
  type SommelierSuggestion,
} from "@/lib/sommelier";

// Sommelier Virtual no menu público (/m/{slug}).
// UX v2 (specs David 29-Jul): o caminho principal é clicar no PRATO ("vou
// comer isto") — o widget abre já com o prato escolhido, sem select comprido.
// O gosto pede-se por TIPO em botões (tinto/branco/rosé/espumante/doce), com
// texto livre opcional para região/casta. As sugestões vêm SEMPRE da carta
// da casa (whitelist na edge; nenhuma mudança na edge nesta versão).

const WINE_TYPES: { code: string; label: string; query: string }[] = [
  { code: "indiferente", label: "Tanto faz", query: "" },
  { code: "tinto", label: "Tinto", query: "vinho tinto" },
  { code: "branco", label: "Branco", query: "vinho branco" },
  { code: "rose", label: "Rosé", query: "vinho rosé" },
  { code: "espumante", label: "Espumante", query: "espumante" },
  { code: "doce", label: "Doce / Porto", query: "vinho doce ou fortificado" },
];

// O toque do empregado de mesa (David 29-07): "gostas mais robusto, encorpado,
// com acidez?" — perfil em escolha múltipla, nas palavras da mesa.
const WINE_PROFILES: { code: string; label: string }[] = [
  { code: "leve e fresco", label: "Leve e fresco" },
  { code: "encorpado e robusto", label: "Encorpado" },
  { code: "com acidez viva", label: "Acidez viva" },
  { code: "macio e frutado", label: "Macio e frutado" },
  { code: "seco", label: "Seco" },
  { code: "mineral", label: "Mineral" },
];

export function SommelierWidget({
  slug,
  dish,
  onDishChange,
  open,
  onOpenChange,
  regions = [],
  lang = "pt",
}: {
  slug: string;
  dish: string | null;
  onDishChange: (d: string | null) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  regions?: string[];
  // Idioma escolhido no menu (0025): vai no pedido para o sommelier responder
  // na língua em que o cliente está a ler a ementa.
  lang?: Lang;
}) {
  const [wineType, setWineType] = React.useState("indiferente");
  const [profiles, setProfiles] = React.useState<string[]>([]);
  const [region, setRegion] = React.useState("indiferente");
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

  // Abrir para um prato novo limpa a resposta anterior.
  React.useEffect(() => {
    if (open) reset();
  }, [open, dish]);

  async function ask() {
    setLoading(true);
    setError(null);
    const typeQuery = WINE_TYPES.find((t) => t.code === wineType)?.query ?? "";
    const pref = [
      typeQuery,
      profiles.join(", "),
      region !== "indiferente" ? `da região ${region}` : "",
      preference.trim(),
    ]
      .filter(Boolean)
      .join(" · ");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("sommelier-pairing", {
        body: {
          slug,
          dishName: dish || null,
          priceRange,
          preference: pref || null,
          lang,
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
            onDishChange(null);
            onOpenChange(true);
          }}
        >
          <Wine className="h-5 w-5" aria-hidden /> Pedir sugestão ao sommelier
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="O sommelier da casa"
        description={
          dish ? "Vais comer isto; nós tratamos do vinho." : "Sugestões da nossa carta, à tua medida."
        }
      >
        {dish && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Para acompanhar: </span>
              <span className="font-medium">{dish}</span>
            </p>
            <button
              type="button"
              aria-label="Remover prato; sugerir para a refeição em geral"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onDishChange(null)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

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
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">1. Que tipo de vinho?</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de vinho">
                {WINE_TYPES.map((t) => {
                  const on = wineType === t.code;
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => setWineType(t.code)}
                      aria-pressed={on}
                      className={
                        "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                        (on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-muted")
                      }
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">2. Como gostas? (escolhe os que quiseres)</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Perfil de gosto">
                {WINE_PROFILES.map((p) => {
                  const on = profiles.includes(p.code);
                  return (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() =>
                        setProfiles((prev) =>
                          prev.includes(p.code)
                            ? prev.filter((x) => x !== p.code)
                            : [...prev, p.code],
                        )
                      }
                      aria-pressed={on}
                      className={
                        "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                        (on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-muted")
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {regions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">3. Alguma região preferida?</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Região">
                  {["indiferente", ...regions].map((r) => {
                    const on = region === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRegion(r)}
                        aria-pressed={on}
                        className={
                          "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                          (on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground hover:bg-muted")
                        }
                      >
                        {r === "indiferente" ? "Tanto faz" : r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {regions.length > 0 ? "4." : "3."} Quanto queres gastar na garrafa?
              </p>
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
              <p className="text-sm font-medium text-muted-foreground">
                Alguma casta ou outro detalhe? (opcional)
              </p>
              <Input
                aria-label="Casta ou outro detalhe (opcional)"
                maxLength={200}
                placeholder="Ex.: Alvarinho · sem madeira"
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
