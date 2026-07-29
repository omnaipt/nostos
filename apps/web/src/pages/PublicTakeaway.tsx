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
import { usePublicMenu } from "@/hooks/use-public-menu";
import { useSubmitTakeawayOrder, sendTakeawayMessage } from "@/hooks/use-takeaway";
import { CasaLogo } from "@/components/CasaLogo";
import { themeStyle } from "@/lib/themes";
import { todayServiceDate } from "@/lib/service-date";
import { formatPriceCents } from "@/lib/types";
import {
  cartCount,
  cartTotalCents,
  optionsForItem,
  pickupSlots,
  toSubmitItems,
  type CartLine,
  type OrderOption,
} from "@/lib/takeaway";

// Encomendar para levar (spec §3, fase D). Carrinho MÍNIMO: só fixed/variants
// (market/by_order nem aparecem), nome+telefone+hora de levantamento. SEM
// pagamento online — paga-se ao levantar. O total é informativo; o servidor
// fixa o preço na submissão. Tema/tom/logo da casa aplicam-se (mesma vitrine).

export default function PublicTakeaway() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const restaurantQuery = usePublicRestaurant(slug);
  const menuQuery = usePublicMenu(slug);
  const date = todayServiceDate();
  const turnsQuery = usePublicTurns(slug, date);
  const submit = useSubmitTakeawayOrder();
  const style = themeStyle(params.get("tema") ?? restaurantQuery.data?.theme);

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pickup, setPickup] = React.useState("");
  const [note, setNote] = React.useState("");
  const [website, setWebsite] = React.useState(""); // honeypot
  const [formError, setFormError] = React.useState<string>();
  const [doneOrder, setDoneOrder] = React.useState<{ pickup: string } | null>(null);

  const restaurant = restaurantQuery.data;
  const enabled = restaurant?.takeaway_enabled === true;

  const categories = (menuQuery.data ?? []).map((c) => ({
    ...c,
    options: c.items.flatMap((i) => optionsForItem(i)),
  })).filter((c) => c.options.length > 0);

  const slots = React.useMemo(
    () => pickupSlots((turnsQuery.data ?? []).map((t) => t.start_time)),
    [turnsQuery.data],
  );

  React.useEffect(() => {
    if (slots.length > 0 && !slots.includes(pickup)) setPickup(slots[0]);
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
      setFormError("Escolha pelo menos um prato.");
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
    if (!pickup) {
      setFormError("Escolha a hora de levantamento.");
      return;
    }
    const pickupAt = `${date}T${pickup}:00`;
    submit.mutate(
      {
        slug: slug as string,
        customerName: name.trim(),
        phone: phone.trim(),
        pickupAt,
        note: note.trim() || null,
        items: toSubmitItems(lines),
        website,
      },
      {
        onSuccess: (res) => {
          setDoneOrder({ pickup });
          if (res.orderId && restaurant) {
            void sendTakeawayMessage({
              orderId: res.orderId,
              slug: slug as string,
              restaurantName: restaurant.name,
              tone: (restaurant as { tone?: string }).tone ?? "proximo",
              toPhone: phone.trim(),
              toEmail: null,
              customerName: name.trim(),
              kind: "takeaway_received",
              pickupAt,
            });
          }
        },
        onError: (err) => setFormError(err instanceof Error ? err.message : "Não foi possível encomendar."),
      },
    );
  }

  // ── Páginas de estado ──────────────────────────────────────────────────────
  if (restaurantQuery.isError || (restaurantQuery.isSuccess && !restaurant)) {
    return (
      <Shell style={style}>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Restaurante não encontrado. Confirme o link.
          </CardContent>
        </Card>
      </Shell>
    );
  }
  if (restaurantQuery.isLoading || menuQuery.isLoading) {
    return (
      <Shell style={style}>
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
      <Shell style={style}>
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 py-12 text-center">
            <p className="font-display text-lg font-semibold">Encomendas fechadas</p>
            <p className="text-sm text-muted-foreground">
              O {restaurant!.name} não está a aceitar encomendas para levar de momento.
            </p>
            <Link to={`/m/${slug}`} className="text-sm text-primary underline">
              Ver o menu
            </Link>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (doneOrder) {
    return (
      <Shell style={style}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--status-seated-fg))]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Encomenda recebida</h2>
            <p className="text-sm text-muted-foreground">
              Para levantar às {doneOrder.pickup}, em nome de {name.trim()}. Paga-se ao
              levantar. {restaurant!.name} confirma consigo por mensagem.
            </p>
            <Link to={`/m/${slug}`} className="text-sm text-primary underline">
              Voltar ao menu
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
      hero={
        <div className="bg-[hsl(var(--hero-bg))] text-[hsl(var(--hero-fg))]">
          <div className="mx-auto flex w-full max-w-lg items-center gap-3 px-4 pb-6 pt-7">
            <CasaLogo name={restaurant!.name} logoUrl={restaurant!.logo_url} size={44} />
            <div className="min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold">{restaurant!.name}</h1>
              <p className="text-xs uppercase tracking-[0.18em] opacity-75">Encomendar para levar</p>
            </div>
          </div>
        </div>
      }
    >
      <div className="w-full max-w-lg space-y-6 pb-32">
        {categories.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Ainda não há pratos disponíveis para encomenda.
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
                        {formatPriceCents(opt.priceCents)}
                      </span>
                    </span>
                    {q === 0 ? (
                      <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={() => addOne(opt)}>
                        <Plus className="h-4 w-4" /> Juntar
                      </Button>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2">
                        <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Menos" onClick={() => removeOne(opt.key)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-5 text-center tabular-nums">{q}</span>
                        <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Mais" onClick={() => addOne(opt)}>
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
            <p className="font-display text-lg font-semibold text-[hsl(var(--card-foreground))]">Os seus dados</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="t-name" label="O seu nome" required>
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
              </Field>
              <Field id="t-phone" label="Telefone" required hint="Avisamos quando estiver pronta.">
                {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
              </Field>
            </div>
            <Field id="t-pickup" label="A que horas levanta?" required>
              {(p) => (
                <Select {...p} value={pickup} onChange={(e) => setPickup(e.target.value)} disabled={slots.length === 0}>
                  {slots.length === 0 ? (
                    <option value="">Hoje não há serviço para levantamento</option>
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
            <Field id="t-note" label="Alguma nota? (opcional)">
              {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
            </Field>
            <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
              <label htmlFor="t-web">Website</label>
              <input id="t-web" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            {formError && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {formError}
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">Paga-se ao levantar. Sem pagamento online.</p>
          </form>
        )}
      </div>

      {/* Barra de carrinho fixa */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 p-3">
            <span className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              {count} {count === 1 ? "item" : "itens"} · <strong className="tabular-nums">{formatPriceCents(total)}</strong>
            </span>
            <Button className="h-11 px-5" disabled={submit.isPending} onClick={onSubmit as unknown as () => void}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {submit.isPending ? "A enviar..." : "Encomendar"}
            </Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  style,
  hero,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  hero?: React.ReactNode;
}) {
  return (
    <div style={style} className="min-h-screen bg-background text-foreground">
      {hero}
      <div className="grid place-items-center p-4">
        <div className="flex w-full flex-col items-center gap-4 py-4">
          {children}
          <p className="text-xs text-muted-foreground">
            encomendas por <span className="font-semibold">nostos</span>
          </p>
        </div>
      </div>
    </div>
  );
}
