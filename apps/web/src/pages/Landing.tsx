import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, CalendarCheck, ChefHat, LineChart, QrCode, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

// Landing pública de nostos.pt (S4). Decisões do David (07-Jul): SEM preço à
// vista; CTA = pedido de demonstração founding (leads gravados via RPC 0009).
// Autenticados nunca chegam aqui (HomeGate manda-os para o Dashboard).

const LINE = [
  { label: "Stock", sub: "a despensa" },
  { label: "Confeção", sub: "ficha técnica" },
  { label: "Menu", sub: "digital + QR" },
  { label: "Seleção", sub: "o cliente escolhe" },
  { label: "Reserva", sub: "mesa marcada" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="container flex items-center justify-between py-5">
        <img src="/brand/nostos-restaurantes.svg" alt="nostos restaurantes" className="h-10" />
        <Link to="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <section className="container py-14 text-center sm:py-20">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
          O sistema operativo do teu restaurante.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Da despensa à reserva, num só sítio. Sem comissões por reserva. Feito para quem gere a
          casa, não para engenheiros.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="#fundador" className={buttonVariants({ size: "lg" })}>
            Quero ser restaurante fundador
          </a>
          <a
            href="/m/restaurante-saloio-demo"
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Vê um menu de exemplo
          </a>
        </div>
      </section>

      {/* A linha completa */}
      <section className="border-y border-border bg-muted/30 py-12">
        <div className="container">
          <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            A linha completa
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {LINE.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="rounded-lg border border-input bg-card px-4 py-3 text-center">
                  <p className="text-sm font-semibold">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.sub}</p>
                </div>
                {i < LINE.length - 1 && (
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </React.Fragment>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-muted-foreground">
            Cada peça alimenta a seguinte. A ficha técnica é o elo que quase ninguém tem: transforma
            o menu de uma lista de preços num sistema que sabe quanto custa e quanto rende cada
            prato.
          </p>
        </div>
      </section>

      {/* Bandeira: ficha técnica IA */}
      <section className="container py-14">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              O diferenciador
            </p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight">
              A ficha técnica de cada prato, escrita por IA. A margem, calculada por ti nunca mais.
            </h2>
            <ul className="mt-6 space-y-4 text-muted-foreground">
              <li className="flex gap-3">
                <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span>
                  A partir do nome do prato, o nostos escreve o primeiro rascunho: ingredientes,
                  quantidades, passos e alergénios. O chef corrige, não escreve do zero.
                </span>
              </li>
              <li className="flex gap-3">
                <LineChart className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span>
                  Com a despensa e os preços de compra, sabes o food cost e a margem de cada coisa
                  que serves, e quais os pratos que estão a perder dinheiro.
                </span>
              </li>
              <li className="flex gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span>
                  Consistência de cozinha e formação de equipa sem papelada: a ficha imprime-se num
                  clique para a parede da cozinha.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Exemplo real</p>
            <p className="mt-1 text-lg font-semibold">Bacalhau à Brás</p>
            <div className="mt-4 space-y-2 text-sm">
              <Row k="Bacalhau demolhado" v="180 g" />
              <Row k="Batata" v="200 g" />
              <Row k="Ovos" v="3 un" />
              <Row k="Cebola, azeite, azeitona, salsa" v="…" />
            </div>
            <div className="mt-4 border-t border-border pt-3 text-sm">
              <Row k="Food cost por dose" v="3,66 €" strong />
              <Row k="Preço de venda" v="14,50 €" />
              <Row k="Margem" v="75%" strong accent />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Gerada por IA e validada pelo chef no restaurante de demonstração.
            </p>
          </div>
        </div>
      </section>

      {/* Já a funcionar */}
      <section className="border-y border-border bg-muted/30 py-14">
        <div className="container">
          <h2 className="text-center text-2xl font-semibold">Já a funcionar, sem comissões</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Feature
              icon={<CalendarCheck className="h-5 w-5" aria-hidden />}
              title="Reservas com link próprio"
              text="O cliente marca pelo telemóvel sem te ligar durante o serviço; o staff confirma com dois cliques. Ficha de cliente e histórico incluídos."
            />
            <Feature
              icon={<QrCode className="h-5 w-5" aria-hidden />}
              title="Menu digital + QR"
              text="O menu numa página, QR para as mesas, alergénios declarados e esgotado em tempo real. Acabou o PDF desactualizado."
            />
            <Feature
              icon={<Users className="h-5 w-5" aria-hidden />}
              title="Clientes que voltam"
              text="O nostos lembra-se por ti: aniversários, alergias, mesa preferida, no-shows. Nostos é o regresso, em grego, e é isso que vendemos."
            />
          </div>
        </div>
      </section>

      {/* CTA founding + form */}
      <section id="fundador" className="container py-16">
        <div className="mx-auto max-w-xl">
          <h2 className="text-center text-3xl font-semibold">Queres ser um dos restaurantes fundadores?</h2>
          <p className="mt-3 text-center text-muted-foreground">
            Estamos a escolher os primeiros restaurantes em Portugal. Montamos o teu restaurante
            contigo, usa-lo no serviço real com condições de fundador, e a tua opinião desenha o
            produto. Deixa o contacto e falamos.
          </p>
          <LeadForm />
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <p className="container text-center text-sm text-muted-foreground">
          nostos.pt · uma plataforma OMNAI · reservas@nostos.pt
        </p>
      </footer>
    </div>
  );
}

function Row({ k, v, strong, accent }: { k: string; v: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={
          "tabular-nums " +
          (strong ? "font-semibold " : "") +
          (accent ? "text-[hsl(var(--status-seated-fg))]" : "")
        }
      >
        {v}
      </span>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function LeadForm() {
  const [name, setName] = React.useState("");
  const [restaurantName, setRestaurantName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [website, setWebsite] = React.useState(""); // honeypot invisível
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (website.trim() !== "") return; // bot
    if (name.trim().length < 2 || restaurantName.trim().length < 2) {
      toast.error("Diz-nos o teu nome e o nome do restaurante.");
      return;
    }
    if (phone.trim() === "" && email.trim() === "") {
      toast.error("Deixa um telefone ou um email para te contactarmos.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("public_create_lead", {
      p_name: name.trim(),
      p_restaurant_name: restaurantName.trim(),
      // A RPC converte vazio em null (nullif); os tipos gerados pedem string.
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_message: message.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(
        error.message.includes("limite_pedidos")
          ? "Já recebemos o teu pedido hoje. Falamos em breve."
          : error.message.includes("email_invalido")
            ? "Confirma o email."
            : "Não foi possível enviar. Tenta outra vez ou escreve para reservas@nostos.pt.",
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-semibold">Recebido. Falamos em breve.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Vamos contactar-te para marcar uma demonstração de 15 minutos com o teu restaurante em
          mente. Entretanto, espreita o menu de exemplo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label="O teu nome"
          placeholder="O teu nome *"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label="Nome do restaurante"
          placeholder="Nome do restaurante *"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label="Telefone"
          inputMode="tel"
          placeholder="Telefone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          aria-label="Email"
          inputMode="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Textarea
        aria-label="Mensagem"
        rows={3}
        maxLength={1000}
        placeholder="Conta-nos do teu restaurante (opcional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {/* Honeypot: invisível para humanos, irresistível para bots. */}
      <div className="absolute left-[-9999px] top-auto" aria-hidden="true">
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting ? "A enviar..." : "Pedir demonstração"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Sem compromisso. Usamos o contacto só para falar contigo sobre o nostos.
      </p>
    </form>
  );
}
