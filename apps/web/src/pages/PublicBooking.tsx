import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  publicBookingErrorMessage,
  useCreatePublicReservation,
  usePublicRestaurant,
  usePublicTurns,
} from "@/hooks/use-public-booking";
import {
  usePublicMenu,
  usePublicMenuLangs,
  type PublicMenuItem,
} from "@/hooks/use-public-menu";
import { CasaLogo } from "@/components/CasaLogo";
import { themeStyle } from "@/lib/themes";
import { todayServiceDate } from "@/lib/service-date";
import {
  detectLang,
  formatPriceCentsI18n,
  isLang,
  LANG_LABEL,
  LANG_LOCALE,
  LANG_SHORT,
  t,
  type Lang,
} from "@/lib/i18n";

// C8 + Reserva com Proximidade v1 — página pública de reservas (/r/{slug}).
// O padrão de qualidade é a chamada telefónica para a casa: "guarda-me a
// mesa" → "claro, e hoje entrou robalo, guardo-lhe um?". O pedido entra
// PENDENTE e POR ATRIBUIR; o staff confirma na vista de disponibilidade (só
// aí segue o email C7). Sem auto-confirmação nem motor de disponibilidade
// público (v1). O "hoje temos" é opcional e discreto: isto nunca pode
// parecer um carrinho de compras (spec §7).
//
// Multilingue (0026): a reserva abre no idioma em que o cliente vinha a ler a
// ementa. Sem isto, quem lia a carta em francês carregava em "Réserver une
// table" e caía num formulário em português. O idioma escolhido segue para a
// RPC (p_lang) e fica gravado em reservations.lang, para a casa saber em que
// língua falar com quem chega.

// Selos do "hoje temos". Um item pode acumular mais do que um.
function badgesFor(item: PublicMenuItem, isToday: boolean, lang: Lang): string[] {
  const badges: string[] = [];
  if (item.kind === "daily" && isToday) badges.push(t(lang, "seloPratoDia"));
  if (item.priceType === "market") badges.push(t(lang, "seloLota"));
  if (item.byOrder) badges.push(t(lang, "seloEncomenda"));
  return badges;
}

// "2026-07-29" → "hoje" | "terça-feira, 29 de julho" (voz de conversa). O
// formato segue o locale do cliente: quem lê em inglês espera "Tuesday, 29
// July" e não a ordem portuguesa traduzida à letra.
function formatDateI18n(iso: string, lang: Lang): string {
  if (iso === todayServiceDate()) return t(lang, "hoje");
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(LANG_LOCALE[lang], {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const restaurantQuery = usePublicRestaurant(slug);
  // Tema do restaurante (0019); `?tema=` sobrepõe para pré-visualização.
  const style = themeStyle(searchParams.get("tema") ?? restaurantQuery.data?.theme);

  // Idioma: mesmo padrão do menu público. O `?lang=` do URL manda, porque é
  // uma escolha explícita de quem já trocou de idioma na ementa e atravessou a
  // porta com ele; só depois a detecção pelo aparelho. Um `?lang=` que esta
  // casa não traduziu é ignorado, mas só depois de a lista ter chegado, para a
  // página não abrir em português e saltar de idioma a meio.
  const langsQuery = usePublicMenuLangs(slug);
  const availableLangs: Lang[] = langsQuery.data ?? ["pt"];
  const urlLang = searchParams.get("lang");
  const lang: Lang =
    isLang(urlLang) &&
    (!langsQuery.isSuccess || availableLangs.includes(urlLang))
      ? urlLang
      : detectLang(availableLangs);

  function changeLang(next: Lang) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("lang", next);
    // `replace` para a troca de idioma não encher o histórico de voltas atrás.
    setSearchParams(nextParams, { replace: true });
  }

  const [date, setDate] = React.useState(todayServiceDate());
  const [turnId, setTurnId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [partySize, setPartySize] = React.useState(2);
  const [notes, setNotes] = React.useState("");
  // Honeypot anti-bot: campo invisível; humanos não o preenchem.
  const [website, setWebsite] = React.useState("");
  const [formError, setFormError] = React.useState<string>();
  const [done, setDone] = React.useState(false);

  const turnsQuery = usePublicTurns(slug, date, lang);
  const create = useCreatePublicReservation();

  // "Hoje temos": pratos do dia (só se a reserva é para hoje — a RPC já os
  // limita ao próprio dia), peixe da lota (market) e por-encomenda (0013).
  // O pedido segue na p_notes da reserva (0004), sem tocar em reservations.
  const menuQuery = usePublicMenu(slug, lang);
  const isToday = date === todayServiceDate();
  const highlights = (menuQuery.data ?? [])
    .flatMap((c) => c.items)
    .filter((i) => i.available)
    .filter((i) => {
      if (i.kind === "daily") return isToday;
      return i.priceType === "market" || i.byOrder;
    });
  const [preOrder, setPreOrder] = React.useState<string[]>([]);

  const turns = turnsQuery.data ?? [];

  React.useEffect(() => {
    if (turns.length === 0) setTurnId("");
    else if (!turns.some((turno) => turno.id === turnId)) setTurnId(turns[0].id);
  }, [turns, turnId]);

  const chosenItems = highlights.filter((i) => preOrder.includes(i.id));
  // O que o cliente escolheu vai para as notas da reserva, que quem lê é a
  // casa: fica em português mesmo quando o cliente reservou noutro idioma. O
  // nome do prato é o do idioma escolhido, que é o que o cliente viu e o que a
  // sala vai ter de reconhecer ao telefone.
  const pedidos = chosenItems
    .map((i) => (i.byOrder ? `${i.name} (por encomenda)` : i.name))
    .join("; ");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (website.trim() !== "") return; // bot apanhado no honeypot: ignora em silêncio
    if (!slug || !turnId) {
      setFormError(t(lang, "valDiaHora"));
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
      setFormError(t(lang, "valEmailReserva"));
      return;
    }
    if (partySize < 1) {
      setFormError(t(lang, "valPax"));
      return;
    }
    const composedNotes = pedidos
      ? `Pedidos: ${pedidos}` + (notes.trim() ? `\n${notes}` : "")
      : notes;
    create.mutate(
      { slug, date, turnId, name, phone, email, partySize, notes: composedNotes, lang },
      {
        onSuccess: () => setDone(true),
        onError: (err) => setFormError(publicBookingErrorMessage(err, lang)),
      },
    );
  }

  // ERRO / NÃO ENCONTRADO
  if (restaurantQuery.isError || (restaurantQuery.isSuccess && !restaurantQuery.data)) {
    return (
      <PublicShell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {restaurantQuery.isError
              ? t(lang, "reservaErroPagina")
              : t(lang, "naoEncontrado")}
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // LOADING
  if (restaurantQuery.isLoading) {
    return (
      <PublicShell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 py-8">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  const restaurant = restaurantQuery.data!;

  // A MESA ESTÁ RESERVADA
  if (done) {
    const turn = turns.find((turno) => turno.id === turnId);
    return (
      <PublicShell style={style} lang={lang}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-seated-fg))]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t(lang, "mesaReservada")}</h2>
            <p className="text-sm text-muted-foreground">
              {formatDateI18n(date, lang)}
              {turn ? ` · ${turn.label}, ${turn.start_time.slice(0, 5)}` : ""} ·{" "}
              {partySize} {partySize === 1 ? t(lang, "pessoa") : t(lang, "pessoas")} ·{" "}
              {t(lang, "emNomeDe", { nome: name.trim() })}
            </p>
            {pedidos && (
              <p className="text-sm text-muted-foreground">
                {t(lang, "ficaApontado")}{" "}
                <span className="text-foreground">{pedidos}</span>.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {email.trim()
                ? t(lang, "avisoEmail")
                : restaurant.phone
                  ? t(lang, "avisoTelefone", { casa: restaurant.name, tel: restaurant.phone })
                  : t(lang, "avisoSemContacto", { casa: restaurant.name })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDone(false);
                setNotes("");
                setPreOrder([]);
              }}
            >
              {t(lang, "outraReserva")}
            </Button>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // A CONVERSA
  return (
    <PublicShell style={style} lang={lang}>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <CasaLogo name={restaurant.name} logoUrl={restaurant.logo_url} size={38} />
            {/* Cor via var: nos temas escuros o atlântico do backoffice não serve. */}
            <CardTitle className="text-[hsl(var(--card-foreground))]">
              {restaurant.name}
            </CardTitle>
            <LangPicker lang={lang} available={availableLangs} onChange={changeLang} />
          </div>
          <p className="text-sm text-muted-foreground">{t(lang, "reservaIntro")}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-date" label={t(lang, "campoDia")} required>
                {(p) => (
                  <Input {...p} type="date" min={todayServiceDate()} value={date}
                    onChange={(e) => { setDate(e.target.value); setTurnId(""); }} />
                )}
              </Field>
              <Field id="p-pax" label={t(lang, "campoPax")} required>
                {(p) => (
                  <Input {...p} type="number" min={1} max={50} value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value))} />
                )}
              </Field>
            </div>

            <Field id="p-turn" label={t(lang, "campoHora")} required>
              {(p) => (
                <Select {...p} value={turnId} onChange={(e) => setTurnId(e.target.value)}
                  disabled={turnsQuery.isLoading || turns.length === 0}>
                  {turnsQuery.isLoading ? (
                    <option value="">{t(lang, "horariosACarregar")}</option>
                  ) : turns.length === 0 ? (
                    <option value="">{t(lang, "semServico")}</option>
                  ) : (
                    // `turno` e não `t`: o `t` desta página é o tradutor.
                    turns.map((turno) => (
                      <option key={turno.id} value={turno.id}>
                        {turno.label} · {turno.start_time.slice(0, 5)}
                        {turno.service ? ` (${turno.service})` : ""}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-name" label={t(lang, "campoNome")} required>
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field id="p-phone" label={t(lang, "campoTelefone")} required hint={t(lang, "hintTelefone")}>
                {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
            </div>

            <Field id="p-email" label={t(lang, "campoEmail")} required hint={t(lang, "hintEmailReserva")}>
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>

            {highlights.length > 0 && (
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-sm font-medium">{t(lang, "hojeTemos")}</legend>
                <p className="text-xs text-muted-foreground">{t(lang, "hojeTemosNota")}</p>
                {highlights.map((item) => {
                  const checked = preOrder.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 transition-colors ${
                        checked ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.priceType !== "market" && item.priceCents != null && (
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {formatPriceCentsI18n(item.priceCents, lang)}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {badgesFor(item, isToday, lang).map((b) => (
                          <span
                            key={b}
                            className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {b}
                          </span>
                        ))}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={checked}
                          onChange={(e) =>
                            setPreOrder((prev) =>
                              e.target.checked
                                ? [...prev, item.id]
                                : prev.filter((id) => id !== item.id),
                            )
                          }
                        />
                        {t(lang, "queroTambem")}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            <Field id="p-notes" label={t(lang, "campoNotas")} hint={t(lang, "hintNotas")}>
              {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}
            </Field>

            {/* Honeypot invisível. Fica em inglês de propósito: o rótulo é isco
                para o bot e nunca chega a olhos humanos. */}
            <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="p-website">Website</label>
              <input id="p-website" type="text" tabIndex={-1} autoComplete="off"
                value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            {formError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {formError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={create.isPending || turns.length === 0}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {create.isPending ? t(lang, "aGuardar") : t(lang, "guardemMesa")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t(lang, "confirmaSemPagamento", { casa: restaurant.name })}
            </p>
          </form>
        </CardContent>
      </Card>
    </PublicShell>
  );
}

// Selector de idioma. Só aparece quando a casa tem mesmo mais do que um idioma
// validado: uma bandeira sozinha só serviria para ocupar o cabeçalho. Aqui vive
// dentro do cartão, por isso usa os tokens do cartão e não os do hero.
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
              "rounded-full border px-2 py-0.5 font-display text-xs transition-colors " +
              (on
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {/* Código curto e não o nome por extenso: o formulário lê-se no
                telemóvel e quatro nomes inteiros empurravam o nome da casa
                para fora do cabeçalho. O nome vai no title e no aria-label. */}
            {LANG_SHORT[l]}
          </button>
        );
      })}
    </div>
  );
}

function PublicShell({
  children,
  style,
  lang,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  lang: Lang;
}) {
  return (
    // `lang` no root para o leitor de ecrã e a tradução do browser saberem em
    // que idioma está a página, que já não é sempre português.
    <div
      lang={lang}
      style={style}
      className="grid min-h-screen place-items-center bg-background p-4 text-foreground"
    >
      <div className="flex w-full flex-col items-center gap-4">
        {children}
        <p className="text-xs text-muted-foreground">
          {t(lang, "assinaturaReservas")} <span className="font-semibold">nostos</span>
        </p>
      </div>
    </div>
  );
}
