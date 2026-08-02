import * as React from "react";
import { Wine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatPriceCentsI18n, t, type Lang } from "@/lib/i18n";
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

// Multilingue (0025): RÓTULO e VALOR são coisas diferentes e não podem ser
// confundidos. O rótulo (`labelKey`) passa pelo dicionário e muda com o idioma
// do cliente; o valor (`query` nos tipos, `code` nos perfis) vai dentro do
// campo `preference` do pedido e fica SEMPRE em português, porque é isso que a
// edge e o prompt do sommelier esperam ler. Traduzir o valor mudava aquilo que
// se pede ao modelo, não apenas aquilo que o cliente lê.
const WINE_TYPES: { code: string; labelKey: string; query: string }[] = [
  { code: "indiferente", labelKey: "somTantoFaz", query: "" },
  { code: "tinto", labelKey: "somTipoTinto", query: "vinho tinto" },
  { code: "branco", labelKey: "somTipoBranco", query: "vinho branco" },
  { code: "rose", labelKey: "somTipoRose", query: "vinho rosé" },
  { code: "espumante", labelKey: "somTipoEspumante", query: "espumante" },
  { code: "doce", labelKey: "somTipoDoce", query: "vinho doce ou fortificado" },
];

// O toque do empregado de mesa (David 29-07): "gostas mais robusto, encorpado,
// com acidez?" — perfil em escolha múltipla, nas palavras da mesa.
// O `code` é o texto português que segue na preferência para a edge.
const WINE_PROFILES: { code: string; labelKey: string }[] = [
  { code: "leve e fresco", labelKey: "somPerfilLeve" },
  { code: "encorpado e robusto", labelKey: "somPerfilEncorpado" },
  { code: "com acidez viva", labelKey: "somPerfilAcidez" },
  { code: "macio e frutado", labelKey: "somPerfilFrutado" },
  { code: "seco", labelKey: "somPerfilSeco" },
  { code: "mineral", labelKey: "somPerfilMineral" },
];

// Rótulo de cada escalão de preço. O código (`ate_15`, ...) é o que segue no
// pedido; aqui só se decide o que o cliente lê.
const PRICE_RANGE_KEYS: Record<PriceRange, string> = {
  ate_15: "somPrecoAte15",
  "15_25": "somPreco15a25",
  "25_40": "somPreco25a40",
  "40_mais": "somPreco40Mais",
  indiferente: "somTantoFaz",
};

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
    // A preferência é montada em português de propósito, seja qual for o
    // idioma do ecrã: é texto para a edge, não para o cliente.
    const typeQuery = WINE_TYPES.find((w) => w.code === wineType)?.query ?? "";
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
        // `result.reason` vem da edge sempre em português: é um código de
        // motivo, não texto para mostrar. O que se mostra sai do dicionário.
        setError(
          result.reason === "limite diário do sommelier atingido"
            ? t(lang, "somErroLimite")
            : t(lang, "somErroGeral"),
        );
        return;
      }
      setSuggestions(result.suggestions);
      setNote(result.note ?? null);
    } catch {
      setError(t(lang, "somErroGeral"));
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
          <Wine className="h-5 w-5" aria-hidden /> {t(lang, "somPedir")}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={t(lang, "somTitulo")}
        description={t(lang, dish ? "somDescComPrato" : "somDescSemPrato")}
      >
        {dish && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <p className="text-sm">
              <span className="text-muted-foreground">{t(lang, "somParaAcompanhar")} </span>
              <span className="font-medium">{dish}</span>
            </p>
            <button
              type="button"
              aria-label={t(lang, "somRemoverPrato")}
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
                      {formatPriceCentsI18n(s.priceCents, lang)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.reason}</p>
                </li>
              ))}
            </ul>
            {note && <p className="text-sm italic text-muted-foreground">{note}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={reset}>
                {t(lang, "somOutraVez")}
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {t(lang, "somFechar")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">1. {t(lang, "somPerguntaTipo")}</p>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t(lang, "somGrupoTipo")}
              >
                {WINE_TYPES.map((w) => {
                  const on = wineType === w.code;
                  return (
                    <button
                      key={w.code}
                      type="button"
                      onClick={() => setWineType(w.code)}
                      aria-pressed={on}
                      className={
                        "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                        (on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input text-muted-foreground hover:bg-muted")
                      }
                    >
                      {t(lang, w.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">2. {t(lang, "somPerguntaPerfil")}</p>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t(lang, "somGrupoPerfil")}
              >
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
                      {t(lang, p.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {regions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">3. {t(lang, "somPerguntaRegiao")}</p>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label={t(lang, "somGrupoRegiao")}
                >
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
                        {/* O nome da região vem da carta e não se traduz. */}
                        {r === "indiferente" ? t(lang, "somTantoFaz") : r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {regions.length > 0 ? "4." : "3."} {t(lang, "somPerguntaPreco")}
              </p>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t(lang, "somGrupoPreco")}
              >
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
                      {t(lang, PRICE_RANGE_KEYS[r.code])}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-muted-foreground">
                {t(lang, "somCastaPergunta")}
              </p>
              <Input
                aria-label={t(lang, "somCastaAria")}
                maxLength={200}
                placeholder={t(lang, "somCastaPlaceholder")}
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
              {loading ? t(lang, "somAPensar") : t(lang, "somSugerir")}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
