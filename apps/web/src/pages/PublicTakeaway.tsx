import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicRestaurant, usePublicTurns } from "@/hooks/use-public-booking";
import { usePublicMenu, usePublicMenuLangs } from "@/hooks/use-public-menu";
import { useSubmitTakeawayOrder, sendTakeawayMessage } from "@/hooks/use-takeaway";
import { CasaLogo } from "@/components/CasaLogo";
import { themeStyle } from "@/lib/themes";
import {
  detectLang,
  formatPriceCentsI18n,
  isLang,
  LANG_LABEL,
  LANG_LOCALE,
  LANG_SHORT,
  t,
  withLang,
  type Lang,
} from "@/lib/i18n";
import {
  cartCount,
  cartTotalCents,
  earliestPickupToday,
  optionsForItem,
  pickupDays,
  pickupSlots,
  toSubmitItems,
  type CartLine,
  type OrderOption,
} from "@/lib/takeaway";

// Encomendar para levar (spec §3, fase D). Carrinho MÍNIMO: só fixed/variants
// (market/by_order nem aparecem), nome+telefone+hora de levantamento. SEM
// pagamento online — paga-se ao levantar. O total é informativo; o servidor
// fixa o preço na submissão. Tema/tom/logo da casa aplicam-se (mesma vitrine).
//
// Multilingue (0026): nomes e descrições dos pratos chegam já traduzidos da RPC
// do menu; aqui traduz-se a moldura e formata-se o preço no locale de quem lê.
// A RPC de encomendas (submit_takeaway_order) ainda NÃO aceita idioma, por isso
// a encomenda em si não guarda a língua do cliente — ver relatório.

// Nome do dia no idioma do cliente. `pickupDays` devolve os rótulos sempre em
// português (é lib pura e testada, e não é dela que se trata a tradução); aqui
// reconstrói-se o rótulo a partir da data, no locale de quem lê. Vem na caixa
// natural de cada idioma, que é o que o Intl já faz certo: "sexta-feira" em
// português, "Friday" em inglês.
function dayName(iso: string, index: number, lang: Lang): string {
  if (index === 0) return t(lang, "hoje");
  if (index === 1) return t(lang, "amanha");
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(LANG_LOCALE[lang], { weekday: "long" }).format(
    new Date(y, m - 1, d),
  );
}

// Nos botões o dia começa por maiúscula; dentro de uma frase fica como o
// idioma o escreve.
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A RPC de encomendas ainda não devolve códigos estáveis (só o "contrato por
// fundir" é reconhecível). Para o resto, quem lê noutro idioma recebe a
// mensagem genérica na sua língua em vez de uma frase em português; o detalhe
// fica na consola para quem estiver a depurar.
function takeawayErrorMessage(err: unknown, lang: Lang): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("encomendas_inactivas")) return t(lang, "errEncomendasInactivas");
  if (lang === "pt") return msg || t(lang, "errEncomendaGeral");
  console.warn("[nostos] erro de encomenda:", msg);
  return t(lang, "errEncomendaGeral");
}

export default function PublicTakeaway() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const restaurantQuery = usePublicRestaurant(slug);

  // Idioma: mesmo padrão do menu público. O `?lang=` do URL manda (é quem
  // atravessou a porta com o cliente), a detecção pelo aparelho é o defeito, e
  // um idioma que esta casa não traduziu é ignorado assim que a lista chega.
  const langsQuery = usePublicMenuLangs(slug);
  const availableLangs: Lang[] = langsQuery.data ?? ["pt"];
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

  const menuQuery = usePublicMenu(slug, lang);
  // Três dias sem calendário (David, 30-07): hoje, amanhã e o dia seguinte pelo
  // nome. Chega para a encomenda de fim-de-semana e evita abrir um date picker.
  const days = React.useMemo(() => pickupDays(new Date()), []);
  const [date, setDate] = React.useState(days[0].date);
  const turnsQuery = usePublicTurns(slug, date, lang);
  const submit = useSubmitTakeawayOrder();
  const style = themeStyle(params.get("tema") ?? restaurantQuery.data?.theme);
  const menuHref = withLang(`/m/${slug}`, lang);

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pickup, setPickup] = React.useState("");
  const [note, setNote] = React.useState("");
  const [website, setWebsite] = React.useState(""); // honeypot
  const [formError, setFormError] = React.useState<string>();
  // Guarda-se a data e o índice do dia, não o rótulo já escrito: assim a
  // confirmação acompanha o cliente se ele trocar de idioma depois de encomendar.
  const [doneOrder, setDoneOrder] = React.useState<{
    pickup: string;
    date: string;
    dayIndex: number;
  } | null>(null);

  const restaurant = restaurantQuery.data;
  const enabled = restaurant?.takeaway_enabled === true;

  const categories = (menuQuery.data ?? []).map((c) => ({
    ...c,
    options: c.items.flatMap((i) => optionsForItem(i)),
  })).filter((c) => c.options.length > 0);

  const slots = React.useMemo(
    () =>
      pickupSlots(
        (turnsQuery.data ?? []).map((turno) => turno.start_time),
        // A folga de preparação só se aplica a hoje; para os outros dias a
        // cozinha tem a manhã toda.
        date === days[0].date ? earliestPickupToday(new Date()) : undefined,
      ),
    [turnsQuery.data, date, days],
  );

  React.useEffect(() => {
    if (slots.length > 0 && !slots.includes(pickup)) setPickup(slots[0]);
    if (slots.length === 0 && pickup) setPickup("");
  }, [slots, pickup]);

  function addOne(opt: OrderOption) {
    setLines((prev) => {
      const found = prev.find((l) => l.key === opt.key);
      if (found) return prev.map((l) => (l.key === opt.key ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        { key: opt.key, menuItemId: opt.menuItemId, variantId: opt.variantId, name: opt.label, unitPriceCents: opt.priceCents, qty: 1 },
      ];
    });
  }
  function removeOne(key: string) {
    setLines((prev) =>
      prev.flatMap((l) => (l.key === key ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l])),
    );
  }
  const qtyOf = (key: string) => lines.find((l) => l.key === key)?.qty ?? 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (website.trim() !== "") return;
    if (lines.length === 0) {
      setFormError(t(lang, "valPrato"));
      return;
    }
    if (name.trim().length < 2) {
      setFormError(t(lang, "valNome"));
      return;
    }
    if (phone.replace(/\D/g, "").length < 9) {
      setFormError(t(lang, "valTelefone"));
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFormError(t(lang, "valEmailEncomenda"));
      return;
    }
    if (!pickup) {
      setFormError(t(lang, "valHoraLevantamento"));
      return;
    }
    const pickupAt = `${date}T${pickup}:00`;
    submit.mutate(
      {
        slug: slug as string,
        customerName: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        pickupAt,
        note: note.trim() || null,
        items: toSubmitItems(lines),
        website,
      },
      {
        onSuccess: (res) => {
          setDoneOrder({
            pickup,
            date,
            dayIndex: Math.max(0, days.findIndex((d) => d.date === date)),
          });
          if (res.orderId && restaurant) {
            void sendTakeawayMessage({
              orderId: res.orderId,
              slug: slug as string,
              restaurantName: restaurant.name,
              tone: (restaurant as { tone?: string }).tone ?? "proximo",
              toPhone: phone.trim(),
              toEmail: email.trim(),
              customerName: name.trim(),
              kind: "takeaway_received",
              pickupAt,
            });
          }
        },
        onError: (err) => setFormError(takeawayErrorMessage(err, lang)),
      },
    );
  }

  // ── Páginas de estado ──────────────────────────────────────────────────────
  if (restaurantQuery.isError || (restaurantQuery.isSuccess && !restaurant)) {
    return (
      <Shell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t(lang, "naoEncontrado")}
          </CardContent>
        </Card>
      </Shell>
    );
  }
  if (restaurantQuery.isLoading || menuQuery.isLoading) {
    return (
      <Shell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 py-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </Shell>
    );
  }
  if (!enabled) {
    // Take-away desligado (ou coluna ainda ausente): honesto, com caminho de volta.
    return (
      <Shell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 py-12 text-center">
            <p className="font-display text-lg font-semibold">{t(lang, "encFechadas")}</p>
            <p className="text-sm text-muted-foreground">
              {t(lang, "encFechadasTexto", { casa: restaurant!.name })}
            </p>
            <Link to={menuHref} className="text-sm text-primary underline">
              {t(lang, "verMenu")}
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (doneOrder) {
    return (
      <Shell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-seated-fg))]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t(lang, "encRecebida")}</h2>
            <p className="text-sm text-muted-foreground">
              {t(lang, "encRecebidaTexto", {
                dia: dayName(doneOrder.date, doneOrder.dayIndex, lang),
                hora: doneOrder.pickup,
                nome: name.trim(),
                casa: restaurant!.name,
              })}
            </p>
            <Link to={menuHref} className="text-sm text-primary underline">
              {t(lang, "voltarMenu")}
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const total = cartTotalCents(lines);
  const count = cartCount(lines);

  return (
    <Shell
      style={style}
      lang={lang}
      hero={
        <div className="bg-[hsl(var(--hero-bg))] text-[hsl(var(--hero-fg))]">
          <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 pb-6 pt-7">
            <CasaLogo name={restaurant!.name} logoUrl={restaurant!.logo_url} size={44} />
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold">{restaurant!.name}</h1>
              <p className="text-xs uppercase tracking-[0.18em] opacity-75">
                {t(lang, "encomendarLevar")}
              </p>
            </div>
            <LangPicker lang={lang} available={availableLangs} onChange={changeLang} />
          </div>
        </div>
      }
    >
      <div className="w-full max-w-lg space-y-6 pb-32">
        {categories.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t(lang, "semItensEncomenda")}
            </CardContent>
          </Card>
        )}

        {categories.map((cat) => (
          <section key={cat.id} className="space-y-2">
            <h2 className="border-b border-border pb-1 text-lg font-semibold text-primary">{cat.label}</h2>
            <ul className="divide-y divide-border">
              {cat.options.map((opt) => {
                const q = qtyOf(opt.key);
                return (
                  <li key={opt.key} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{opt.label}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {formatPriceCentsI18n(opt.priceCents, lang)}
                      </span>
                    </span>
                    {q === 0 ? (
                      <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => addOne(opt)}>
                        <Plus className="h-4 w-4" /> {t(lang, "juntar")}
                      </Button>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2">
                        <Button size="icon" variant="outline" className="h-9 w-9" aria-label={t(lang, "menosUm")} onClick={() => removeOne(opt.key)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-5 text-center tabular-nums">{q}</span>
                        <Button size="icon" variant="outline" className="h-9 w-9" aria-label={t(lang, "maisUm")} onClick={() => addOne(opt)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {count > 0 && (
          <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-border bg-card p-4" noValidate>
            <p className="font-display text-lg font-semibold text-[hsl(var(--card-foreground))]">
              {t(lang, "osSeusDados")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="t-name" label={t(lang, "campoNome")} required>
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field id="t-phone" label={t(lang, "campoTelefone")} required hint={t(lang, "hintTelefoneEnc")}>
                {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
              <Field id="t-email" label={t(lang, "campoEmail")} required hint={t(lang, "hintEmailEnc")}>
                {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
            </div>
            <div className="space-y-2">
              <span className="text-sm font-medium">{t(lang, "quandoLevanta")}</span>
              <div className="flex flex-wrap gap-2">
                {days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    aria-pressed={d.date === date}
                    onClick={() => setDate(d.date)}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                      (d.date === date
                        ? "border-transparent bg-[hsl(var(--primary))] font-medium text-[hsl(var(--primary-foreground))]"
                        : "border-input hover:bg-[hsl(var(--muted))]")
                    }
                  >
                    {capitalize(dayName(d.date, i, lang))}
                  </button>
                ))}
              </div>
            </div>
            <Field id="t-pickup" label={t(lang, "horaLevanta")} required>
              {(p) => (
                <Select {...p} value={pickup} onChange={(e) => setPickup(e.target.value)} disabled={slots.length === 0}>
                  {slots.length === 0 ? (
                    <option value="">{t(lang, "semHoras")}</option>
                  ) : (
                    slots.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>
            <Field id="t-note" label={t(lang, "campoNota")}>
              {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
            </Field>
            {/* Honeypot: o rótulo fica em inglês de propósito, é isco para o bot
                e nunca chega a olhos humanos. */}
            <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <label htmlFor="t-web">Website</label>
              <input id="t-web" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            {formError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {formError}
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">{t(lang, "pagaAoLevantar")}</p>
          </form>
        )}
      </div>

      {/* Barra de carrinho fixa */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 p-3">
            <span className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {count} {count === 1 ? t(lang, "item") : t(lang, "itens")} ·{" "}
              <strong className="tabular-nums">{formatPriceCentsI18n(total, lang)}</strong>
            </span>
            <Button className="h-11 px-5" disabled={submit.isPending} onClick={onSubmit as unknown as () => void}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {submit.isPending ? t(lang, "aEnviar") : t(lang, "encomendar")}
            </Button>
          </div>
        </div>
      )}
    </Shell>
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
            {LANG_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}

function Shell({
  children,
  style,
  hero,
  lang,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  hero?: React.ReactNode;
  lang: Lang;
}) {
  return (
    // `lang` no root para o leitor de ecrã e a tradução do browser saberem em
    // que idioma está a página, que já não é sempre português.
    <div lang={lang} style={style} className="min-h-screen bg-background text-foreground">
      {hero}
      <div className="grid place-items-center p-4">
        <div className="flex w-full flex-col items-center gap-4 py-4">
          {children}
          <p className="text-xs text-muted-foreground">
            {t(lang, "assinaturaEncomendas")} <span className="font-semibold">nostos</span>
          </p>
        </div>
      </div>
    </div>
  );
}
