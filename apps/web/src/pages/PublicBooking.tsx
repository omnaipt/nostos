import * as React from "react";
import { useParams } from "react-router-dom";
import { Loader2, CalendarDays, CheckCircle2 } from "lucide-react";
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
import { todayServiceDate } from "@/lib/service-date";

// C8 — página pública de reservas (/r/{slug}). O pedido entra PENDENTE e
// POR ATRIBUIR; o staff confirma na vista de disponibilidade (só aí segue o
// email C7). Sem auto-confirmação nem motor de disponibilidade público (v1).

export default function PublicBooking() {
  const { slug } = useParams<{ slug: string }>();
  const restaurantQuery = usePublicRestaurant(slug);

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

  const turns = turnsQuery.data ?? [];

  React.useEffect(() => {
    if (turns.length === 0) setTurnId("");
    else if (!turns.some((t) => t.id === turnId)) setTurnId(turns[0].id);
  }, [turns, turnId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    if (website.trim() !== "") return; // bot apanhado no honeypot: ignora em silêncio
    if (!slug || !turnId) {
      setFormError("Escolhe um dia com serviço e um turno.");
      return;
    }
    if (name.trim().length < 2) {
      setFormError("Indica o teu nome.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 9) {
      setFormError("Indica um telefone válido (mín. 9 dígitos).");
      return;
    }
    if (partySize < 1) {
      setFormError("Indica o número de pessoas.");
      return;
    }
    create.mutate(
      { slug, date, turnId, name, phone, email, partySize, notes },
      {
        onSuccess: () => setDone(true),
        onError: (err) => setFormError(publicBookingErrorMessage(err)),
      },
    );
  }

  // ERRO / NÃO ENCONTRADO
  if (restaurantQuery.isError || (restaurantQuery.isSuccess && !restaurantQuery.data)) {
    return (
      <PublicShell>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {restaurantQuery.isError
              ? "Não foi possível carregar a página. Tenta novamente."
              : "Restaurante não encontrado. Confirma o link."}
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // LOADING
  if (restaurantQuery.isLoading) {
    return (
      <PublicShell>
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

  // SUCESSO
  if (done) {
    return (
      <PublicShell>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-seated-fg))]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Pedido enviado</h2>
            <p className="text-sm text-muted-foreground">
              O {restaurant.name} recebeu o teu pedido de reserva e vai confirmar em breve
              {email.trim() ? " para o teu email" : ""}.
              {restaurant.phone ? ` Para alterações: ${restaurant.phone}.` : ""}
            </p>
            <Button variant="outline" size="sm" onClick={() => { setDone(false); setNotes(""); }}>
              Fazer outro pedido
            </Button>
          </CardContent>
        </Card>
      </PublicShell>
    );
  }

  // FORMULÁRIO
  return (
    <PublicShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            Reservar mesa · {restaurant.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="p-date" label="Data" required>
                {(p) => (
                  <Input {...p} type="date" min={todayServiceDate()} value={date}
                    onChange={(e) => { setDate(e.target.value); setTurnId(""); }} />
                )}
              </Field>
              <Field id="p-pax" label="Pessoas" required>
                {(p) => (
                  <Input {...p} type="number" min={1} max={50} value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value))} />
                )}
              </Field>
            </div>

            <Field id="p-turn" label="Turno" required>
              {(p) => (
                <Select {...p} value={turnId} onChange={(e) => setTurnId(e.target.value)}
                  disabled={turnsQuery.isLoading || turns.length === 0}>
                  {turnsQuery.isLoading ? (
                    <option value="">A carregar turnos...</option>
                  ) : turns.length === 0 ? (
                    <option value="">Sem serviço neste dia</option>
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
              <Field id="p-name" label="Nome" required>
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field id="p-phone" label="Telefone" required>
                {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
            </div>

            <Field id="p-email" label="Email (opcional)" hint="Para receberes a confirmação.">
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>

            <Field id="p-notes" label="Notas (opcional)" hint="Alergias, ocasião, cadeira de bebé...">
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
              {create.isPending ? "A enviar..." : "Pedir reserva"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              O restaurante confirma o teu pedido. Sem pagamento online.
            </p>
          </form>
        </CardContent>
      </Card>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <div className="flex w-full flex-col items-center gap-4">
        {children}
        <p className="text-xs text-muted-foreground">
          Reservas por <span className="font-semibold">stoa</span>
        </p>
      </div>
    </div>
  );
}
