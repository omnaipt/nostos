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
import { usePublicMenu, type PublicMenuItem } from "@/hooks/use-public-menu";
import { CasaLogo } from "@/components/CasaLogo";
import { themeStyle } from "@/lib/themes";
import { todayServiceDate } from "@/lib/service-date";
import { formatPriceCents } from "@/lib/types";

// C8 + Reserva com Proximidade v1 — página pública de reservas (/r/{slug}).
// O padrão de qualidade é a chamada telefónica para a casa: "guarda-me a
// mesa" → "claro, e hoje entrou robalo, guardo-lhe um?". O pedido entra
// PENDENTE e POR ATRIBUIR; o staff confirma na vista de disponibilidade (só
// aí segue o email C7). Sem auto-confirmação nem motor de disponibilidade
// público (v1). O "hoje temos" é opcional e discreto: isto nunca pode
// parecer um carrinho de compras (spec §7).

// Selos do "hoje temos". Um item pode acumular mais do que um.
function badgesFor(item: PublicMenuItem, isToday: boolean): string[] {
  const badges: string[] = [];
  if (item.kind === "daily" && isToday) badges.push("prato do dia");
  if (item.priceType === "market") badges.push("peixe da lota · preço do dia");
  if (item.byOrder) badges.push("por encomenda · confeção lenta");
  return badges;
}

// "2026-07-29" → "hoje" | "terça-feira, 29 de julho" (voz de conversa).
function formatDatePt(iso: string): string {
  if (iso === todayServiceDate()) return "hoje";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(y, m - 1, d));
}

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const restaurantQuery = usePublicRestaurant(slug);
  // Tema do restaurante (0019); `?tema=` sobrepõe para pré-visualização.
  const style = themeStyle(searchParams.get("tema") ?? restaurantQuery.data?.theme);

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

  const turnsQuery = usePublicTurns(slug, date);
  const create = useCreatePublicReservation();

  // "Hoje temos": pratos do dia (só se a reserva é para hoje — a RPC já os
  // limita ao próprio dia), peixe da lota (market) e por-encomenda (0013).
  // O pedido segue na p_notes da reserva (0004), sem tocar em reservations.
  const menuQuery = usePublicMenu(slug);
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
    else if (!turns.some((t) => t.id === turnId)) setTurnId(turns[0].id);
  }, [turns, turnId]);

  const chosenItems = highlights.filter((i) => preOrder.includes(i.id));
  const pedidos = chosenItems
    .map((i) => (i.byOrder ? `${i.name} (por encomenda)` : i.name))
    .join("; ");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (website.trim() !== "") return; // bot apanhado no honeypot: ignora em silêncio
    if (!slug || !turnId) {
      setFormError("Escolha um dia com serviço e um horário.");
      return;
    }
    if (name.trim().length < 2) {
      setFormError("Diga-nos o seu nome.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 9) {
      setFormError("Precisamos de um telefone válido (mín. 9 dígitos).");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFormError("Precisamos de um email para lhe enviar a confirmação.");
      return;
    }
    if (partySize < 1) {
      setFormError("Diga-nos quantos são.");
      return;
    }
    const composedNotes = pedidos
      ? `Pedidos: ${pedidos}` + (notes.trim() ? `\n${notes}` : "")
      : notes;
    create.mutate(
      { slug, date, turnId, name, phone, email, partySize, notes: composedNotes },
      {
        onSuccess: () => setDone(true),
        onError: (err) => setFormError(publicBookingErrorMessage(err)),
      },
    );
  }

  // ERRO / NÃO ENCONTRADO
  if (restaurantQuery.isError || (restaurantQuery.isSuccess && !restaurantQuery.data)) {
    return (
      <PublicShell style={style}>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {restaurantQuery.isError
              ? "Não foi possível carregar a página. Tente novamente."
              : "Restaurante não encontrado. Confirme o link."}
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // LOADING
  if (restaurantQuery.isLoading) {
    return (
      <PublicShell style={style}>
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
    const turn = turns.find((t) => t.id === turnId);
    return (
      <PublicShell style={style}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-seated-fg))]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">A sua mesa está reservada</h2>
            <p className="text-sm text-muted-foreground">
              {formatDatePt(date)}
              {turn ? ` · ${turn.label}, ${turn.start_time.slice(0, 5)}` : ""} ·{" "}
              {partySize} {partySize === 1 ? "pessoa" : "pessoas"} · em nome de {name.trim()}
            </p>
            {pedidos && (
              <p className="text-sm text-muted-foreground">
                Fica também apontado: <span className="text-foreground">{pedidos}</span>.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {email.trim()
                ? "Vai receber a confirmação por email. Se precisar de alguma coisa, basta responder-lhe."
                : restaurant.phone
                  ? `O ${restaurant.name} confirma consigo. Qualquer coisa, ligue: ${restaurant.phone}.`
                  : `O ${restaurant.name} confirma consigo em breve.`}
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
              Fazer outra reserva
            </Button>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // A CONVERSA
  return (
    <PublicShell style={style}>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2.5">
            <CasaLogo name={restaurant.name} logoUrl={restaurant.logo_url} size={38} />
            {/* Cor via var: nos temas escuros o atlântico do backoffice não serve. */}
            <CardTitle className="text-[hsl(var(--card-foreground))]">
              {restaurant.name}
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Diga-nos quando vem e quantos são, que a mesa fica reservada.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-date" label="Que dia?" required>
                {(p) => (
                  <Input {...p} type="date" min={todayServiceDate()} value={date}
                    onChange={(e) => { setDate(e.target.value); setTurnId(""); }} />
                )}
              </Field>
              <Field id="p-pax" label="Quantos são?" required>
                {(p) => (
                  <Input {...p} type="number" min={1} max={50} value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value))} />
                )}
              </Field>
            </div>

            <Field id="p-turn" label="A que horas?" required>
              {(p) => (
                <Select {...p} value={turnId} onChange={(e) => setTurnId(e.target.value)}
                  disabled={turnsQuery.isLoading || turns.length === 0}>
                  {turnsQuery.isLoading ? (
                    <option value="">A ver os horários...</option>
                  ) : turns.length === 0 ? (
                    <option value="">Nesse dia não temos serviço</option>
                  ) : (
                    turns.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} · {t.start_time.slice(0, 5)}
                        {t.service ? ` (${t.service})` : ""}
                      </option>
                    ))
                  )}
                </Select>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-name" label="O seu nome" required>
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field id="p-phone" label="Telefone" required hint="Se precisarmos de falar consigo.">
                {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
            </div>

            <Field id="p-email" label="Email" required hint="Para lhe escrevermos a confirmação.">
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>

            {highlights.length > 0 && (
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 text-sm font-medium">Hoje temos</legend>
                <p className="text-xs text-muted-foreground">
                  Se lhe apetecer, deixamos já apontado na reserva. Sem
                  compromisso; paga-se na mesa, como sempre.
                </p>
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
                            {formatPriceCents(item.priceCents)}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {badgesFor(item, isToday).map((b) => (
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
                        Quero reservar também
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            <Field id="p-notes" label="Mais alguma coisa? (opcional)" hint="Alergias, uma ocasião especial, cadeira de bebé...">
              {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />}
            </Field>

            {/* Honeypot invisível */}
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
              {create.isPending ? "A guardar..." : "Guardem-me a mesa"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              O {restaurant.name} confirma consigo. Sem pagamento online.
            </p>
          </form>
        </CardContent>
      </Card>
    </PublicShell>
  );
}

function PublicShell({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className="grid min-h-screen place-items-center bg-background p-4 text-foreground"
    >
      <div className="flex w-full flex-col items-center gap-4">
        {children}
        <p className="text-xs text-muted-foreground">
          Reservas por <span className="font-semibold">nostos</span>
        </p>
      </div>
    </div>
  );
}
