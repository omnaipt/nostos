import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CalendarCheck, ShoppingBag, Wine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicRestaurant } from "@/hooks/use-public-booking";
import {
  usePublicMenu,
  usePublicMenuLangs,
  type PublicMenuItem,
} from "@/hooks/use-public-menu";
import { SommelierWidget } from "@/components/public/SommelierWidget";
import { CasaLogo } from "@/components/CasaLogo";
import { isWineCategory } from "@/lib/sommelier";
import { themeStyle } from "@/lib/themes";
import {
  allergenLabel,
  detectLang,
  formatPriceCentsI18n,
  isLang,
  LANG_LABEL,
  LANG_SHORT,
  t,
  type Lang,
} from "@/lib/i18n";

// Menu público (/m/{slug}). Só leitura, anónimo, via RPC. Sem preços em falta
// a partir de "—". Itens esgotados aparecem esbatidos com selo "Esgotado".
// Tema por restaurante (0019): as CSS vars do tema aplicam-se no root; a
// estrutura não muda. `?tema=<slug>` sobrepõe para pré-visualizar (usado pelo
// "ver o meu menu" das Definições).
//
// Multilingue (0025): os nomes e descrições chegam já traduzidos da RPC; aqui
// só traduzimos a moldura (rótulos, avisos, alergénios, formato do preço).

export default function PublicMenu() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const langsQuery = usePublicMenuLangs(slug);
  // Sem resposta ainda (ou casa sem traduções) mostra-se só português: é a
  // base e nunca falta.
  const availableLangs: Lang[] = langsQuery.data ?? ["pt"];

  // Precedência: o `?lang=` do URL manda, porque é uma escolha explícita de
  // quem partilhou ou de quem já trocou de idioma nesta página (e sobrevive ao
  // refresh sem nada guardado no aparelho). Só depois a detecção pelo
  // aparelho. Um `?lang=` de um idioma que esta casa não traduziu é ignorado,
  // em vez de abrir meia ementa em português — mas só depois de a lista ter
  // chegado: rejeitá-lo antes disso abria a ementa em português e saltava para
  // o idioma pedido a meio, com duas chamadas e um piscar de página.
  const urlLang = params.get("lang");
  const lang: Lang =
    isLang(urlLang) &&
    (!langsQuery.isSuccess || availableLangs.includes(urlLang))
      ? urlLang
      : detectLang(availableLangs);

  function changeLang(next: Lang) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("lang", next);
    // `replace` para a troca de idioma não encher o histórico de voltas atrás.
    setParams(nextParams, { replace: true });
  }

  const restaurantQuery = usePublicRestaurant(slug);
  const menuQuery = usePublicMenu(slug, lang);
  const style = themeStyle(params.get("tema") ?? restaurantQuery.data?.theme);
  // Sommelier v2: abre a partir do prato ("vou comer isto") ou do botão geral.
  const [sommelierOpen, setSommelierOpen] = useState(false);
  const [sommelierDish, setSommelierDish] = useState<string | null>(null);

  // ERRO / NÃO ENCONTRADO
  if (
    restaurantQuery.isError ||
    (restaurantQuery.isSuccess && !restaurantQuery.data)
  ) {
    return (
      <MenuShell style={style} lang={lang}>
        <Card className="w-full max-w-lg">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {restaurantQuery.isError
              ? t(lang, "erroCarregar")
              : t(lang, "naoEncontrado")}
          </CardContent>
        </Card>
      </MenuShell>
    );
  }

  // LOADING
  if (restaurantQuery.isLoading || menuQuery.isLoading) {
    return (
      <MenuShell style={style} lang={lang}>
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-3 py-8">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-5/6" />
            <Skeleton className="h-5 w-2/3" />
          </CardContent>
        </Card>
      </MenuShell>
    );
  }

  const restaurant = restaurantQuery.data!;
  const categories = (menuQuery.data ?? []).filter((c) => c.items.length > 0);

  // Sommelier Virtual: só aparece se a carta tiver vinhos disponíveis.
  const hasWines = categories.some(
    (c) => isWineCategory(c.label) && c.items.some((i) => i.available),
  );
  // Regiões da carta (convenção "Região · castas · perfil" na descrição dos
  // vinhos) para os chips do sommelier: extraídas do próprio menu, sem schema.
  const wineRegions = Array.from(
    new Set(
      categories
        .filter((c) => isWineCategory(c.label))
        .flatMap((c) => c.items)
        .filter((i) => i.available && i.description)
        .map((i) => (i.description ?? "").split("·")[0].trim())
        .filter((r) => r.length > 1 && r.length <= 30),
    ),
  ).slice(0, 8);
  return (
    <MenuShell
      style={style}
      lang={lang}
      hero={
        <div className="bg-[hsl(var(--hero-bg))] text-[hsl(var(--hero-fg))]">
          <div className="mx-auto flex w-full max-w-lg items-center gap-3.5 px-4 pb-7 pt-8">
            <CasaLogo name={restaurant.name} logoUrl={restaurant.logo_url} size={48} />
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold">{restaurant.name}</h1>
              <p className="text-xs uppercase tracking-[0.18em] opacity-75">{t(lang, "menu")}</p>
            </div>
            <LangPicker
              lang={lang}
              available={availableLangs}
              onChange={changeLang}
            />
          </div>
        </div>
      }
    >
      <div className="w-full max-w-lg space-y-6">

        {/* Navegação horizontal por categoria (pedido David 29-07): sticky no
            topo, salta por âncora para cada secção do menu. */}
        {categories.length > 1 && (
          <nav
            aria-label={t(lang, "categorias")}
            className="sticky top-0 z-20 -my-2 flex gap-1.5 overflow-x-auto border-b border-border/60 bg-background/90 px-1 py-2 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className="shrink-0 rounded-full border border-input bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() =>
                  document
                    .getElementById(`cat-${c.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {c.label}
              </button>
            ))}
          </nav>
        )}

        {menuQuery.isError && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t(lang, "erroCarregar")}
            </CardContent>
          </Card>
        )}

        {!menuQuery.isError && categories.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t(lang, "semItens")}
            </CardContent>
          </Card>
        )}

        {categories.map((cat) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-14 space-y-3">
            <h2 className="border-b border-border pb-1 text-lg font-semibold text-primary">
              {cat.label}
            </h2>
            <ul className="space-y-4">
              {cat.items.map((item) => (
                <li
                  key={item.id}
                  className={item.available ? "" : "opacity-60"}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {item.name}
                      {!item.available && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          {t(lang, "indisponivel")}
                        </span>
                      )}
                      {item.byOrder && item.available && (
                        <span className="ml-2 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-xs font-normal text-primary">
                          {t(lang, "porEncomenda")}
                        </span>
                      )}
                    </span>
                    <ItemPrice item={item} lang={lang} />
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                  {item.byOrder && item.available && (
                    <p className="mt-0.5 text-xs italic text-muted-foreground">
                      {t(lang, "porEncomendaNota")}
                    </p>
                  )}
                  {item.allergens.length > 0 && (
                    <p className="mt-1 text-xs font-medium text-[hsl(var(--warn-fg))]">
                      {t(lang, "alergenios")}:{" "}
                      {item.allergens
                        .map((a) => allergenLabel(a, lang))
                        .join(", ")}
                    </p>
                  )}
                  {hasWines && item.available && !isWineCategory(cat.label) && (
                    <button
                      type="button"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={t(lang, "queVinhoCom", { prato: item.name })}
                      onClick={() => {
                        setSommelierDish(item.name);
                        setSommelierOpen(true);
                      }}
                    >
                      <Wine className="h-3.5 w-3.5" aria-hidden />
                      {t(lang, "queVinho")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* Take-away (fase D): só quando o restaurante o activa (defensivo se a
            coluna ainda não existir). Botão de acção, ao contrário da reserva
            que é discreta — encomendar é a chamada à acção da vitrine. */}
        {restaurant.takeaway_enabled === true && (
          <Link
            to={`/m/${slug}/levar`}
            className="flex items-center justify-center gap-2 rounded-[9px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {t(lang, "encomendarLevar")}
          </Link>
        )}

        {/* Reserva despromovida no menu (David 29-07): quem lê o menu por QR
            já está sentado; a porta de entrada da reserva é /r/{slug}. Fica
            só um caminho discreto para quem chega ao menu fora da mesa. */}
        <p className="pt-2 text-center">
          <Link
            to={`/r/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {t(lang, "reservarMesa")}
          </Link>
        </p>

        {/* Quem lê noutro idioma tem direito a saber que está a ler uma
            tradução, e onde está a versão que a casa assina. */}
        {lang !== "pt" && (
          <p className="text-center text-xs italic text-muted-foreground">
            {t(lang, "traduzidoAviso")}
          </p>
        )}

        {slug && hasWines && (
          <SommelierWidget
            slug={slug}
            lang={lang}
            dish={sommelierDish}
            onDishChange={setSommelierDish}
            open={sommelierOpen}
            onOpenChange={setSommelierOpen}
            regions={wineRegions}
          />
        )}
      </div>
    </MenuShell>
  );
}

// Preço conforme o price_type (0010): fixed normal; per_kg com sufixo por kg;
// market em "preço do dia"; variants empilha "label · preço" (ex.: 2 pax,
// ½ dose). Variante sem preço cai para "preço do dia". O separador decimal e
// o símbolo seguem o idioma escolhido (quem lê em inglês espera 12.50).
function ItemPrice({ item, lang }: { item: PublicMenuItem; lang: Lang }) {
  if (item.priceType === "market") {
    return (
      <span className="shrink-0 text-sm italic text-muted-foreground">
        {t(lang, "precoDoDia")}
      </span>
    );
  }
  if (item.priceType === "per_kg") {
    return (
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatPriceCentsI18n(item.priceCents, lang)}
        <span className="text-xs"> {t(lang, "porKg")}</span>
      </span>
    );
  }
  if (item.priceType === "variants" && item.variants.length > 0) {
    return (
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-sm tabular-nums text-muted-foreground">
        {item.variants.map((v) => (
          <span key={v.label}>
            {v.label} ·{" "}
            {v.priceCents == null ? (
              <span className="italic">{t(lang, "precoDoDia")}</span>
            ) : (
              formatPriceCentsI18n(v.priceCents, lang)
            )}
            {v.unit === "kg" && <span className="text-xs"> {t(lang, "porKg")}</span>}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="shrink-0 tabular-nums text-muted-foreground">
      {formatPriceCentsI18n(item.priceCents, lang)}
    </span>
  );
}

// Selector de idioma. Só aparece quando a casa tem mesmo mais do que um idioma
// validado: uma bandeira sozinha só serviria para ocupar o cabeçalho. Vive no
// hero e usa os tokens do hero para não abrir uma segunda paleta na página.
function LangPicker({
  lang,
  available,
  onChange,
}: {
  lang: Lang;
  available: Lang[];
  onChange: (next: Lang) => void;
}) {
  if (available.length < 2) return null;
  return (
    <div
      className="ml-auto flex shrink-0 items-center gap-1"
      role="group"
      aria-label={t(lang, "idioma")}
    >
      {available.map((l) => {
        const on = l === lang;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={on}
            aria-label={`${t(lang, "idioma")}: ${LANG_LABEL[l]}`}
            title={LANG_LABEL[l]}
            onClick={() => onChange(l)}
            className={
              "rounded-full border px-2.5 py-1 font-display text-xs transition-colors " +
              (on
                ? "border-transparent bg-[hsl(var(--hero-fg))] text-[hsl(var(--hero-bg))]"
                : "border-[hsl(var(--hero-fg))]/35 opacity-75 hover:opacity-100")
            }
          >
            {/* Código curto e não o nome por extenso: o menu lê-se no
                telemóvel e quatro nomes inteiros empurravam o nome da casa
                para fora do cabeçalho. O nome vai no title e no aria-label. */}
            {LANG_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}

function MenuShell({
  children,
  style,
  hero,
  lang,
}: {
  children: ReactNode;
  style?: CSSProperties;
  hero?: ReactNode;
  lang: Lang;
}) {
  return (
    // `lang` no root para o leitor de ecrã e a tradução do browser saberem em
    // que idioma está a página, que já não é sempre português.
    <div lang={lang} style={style} className="min-h-screen bg-background text-foreground">
      {hero}
      <div className="p-4">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 py-6">
          {children}
          <p className="text-xs text-muted-foreground">
            {t(lang, "assinatura")} <span className="font-semibold">nostos</span>
          </p>
        </div>
      </div>
    </div>
  );
}
