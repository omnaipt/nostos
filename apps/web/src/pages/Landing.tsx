import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRight,
  CalendarCheck,
  ChefHat,
  LineChart,
  Package,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wine,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Landing pública de nostos.pt — identidade Pinho & Tinta (Zé, 07-Jul).
// Tokens de marca scoped em .landing (index.css): creme, verde pinho,
// terracota; Fraunces como serifa de display; greca como friso.
// Decisões mantidas: SEM preço à vista; CTA founding; leads via RPC 0009.

const LINE = [
  { label: "Stock", sub: "a despensa" },
  { label: "Confeção", sub: "ficha técnica" },
  { label: "Menu", sub: "digital + QR" },
  { label: "Seleção", sub: "o cliente escolhe" },
  { label: "Reserva", sub: "mesa marcada" },
];

const pine = "text-[hsl(var(--brand-pine))]";
const terra = "text-[hsl(var(--brand-terracotta))]";

// Símbolo da marca (o meandro do favicon), como glifo único e nítido.
function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="20 20 88 88" className={className} aria-hidden="true">
      <path
        d="M 32 96 L 32 32 L 96 32 L 96 73.41 L 54.59 73.41 L 54.59 54.59 L 77.18 54.59"
        fill="none"
        stroke="currentColor"
        strokeWidth="11.29"
      />
    </svg>
  );
}

// Separador de secção: linha fina · símbolo · linha fina. Um ornamento, não
// um friso repetido (feedback David 07-Jul).
function Ornament() {
  return (
    <div className="flex items-center justify-center gap-5 py-3" aria-hidden="true">
      <span className="h-px w-16 bg-[hsl(var(--brand-pine)/0.18)] sm:w-24" />
      <Mark className="h-6 w-6 text-[hsl(var(--brand-terracotta))]" />
      <span className="h-px w-16 bg-[hsl(var(--brand-pine)/0.18)] sm:w-24" />
    </div>
  );
}

function CtaPrimary({
  href,
  children,
  type,
  disabled,
  full,
}: {
  href?: string;
  children: React.ReactNode;
  type?: "submit";
  disabled?: boolean;
  full?: boolean;
}) {
  const cls =
    "inline-flex items-center justify-center gap-2 rounded-full bg-[hsl(var(--brand-terracotta))] px-7 py-3.5 text-base font-semibold text-[hsl(var(--brand-cream))] shadow-[0_2px_0_hsl(var(--brand-terracotta-deep))] transition-all hover:-translate-y-0.5 hover:bg-[hsl(var(--brand-terracotta-deep))] hover:shadow-[0_4px_12px_hsl(var(--brand-terracotta)/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-terracotta))] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 " +
    (full ? "w-full" : "");
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

function CtaGhost({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[hsl(var(--brand-pine)/0.25)] px-7 py-3 text-base font-medium text-[hsl(var(--brand-pine))] transition-colors hover:border-[hsl(var(--brand-pine))] hover:bg-[hsl(var(--brand-pine)/0.05)]"
    >
      {children}
    </a>
  );
}

export default function Landing() {
  return (
    <div className="landing min-h-screen bg-[hsl(var(--brand-cream))] text-[hsl(var(--brand-pine))] antialiased">
      {/* Header */}
      <header className="container flex items-center justify-between py-6">
        <img src="/brand/nostos-restaurantes.svg" alt="nostos restaurantes" className="h-14 sm:h-[4.5rem]" />
        <Link
          to="/login"
          className="rounded-full px-4 py-2 text-sm font-medium text-[hsl(var(--brand-pine-soft))] transition-colors hover:bg-[hsl(var(--brand-pine)/0.06)] hover:text-[hsl(var(--brand-pine))]"
        >
          Entrar
        </Link>
      </header>

      {/* Hero */}
      <section className="container pb-16 pt-12 text-center sm:pb-24 sm:pt-16">
        <p className={"text-sm font-semibold uppercase tracking-[0.25em] " + terra}>
          restaurantes fundadores · portugal
        </p>
        <h1 className={"font-display mx-auto mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] sm:text-6xl " + pine}>
          O sistema operativo do teu <em className="italic">restaurante</em>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[hsl(var(--brand-pine-soft))]">
          <span className="block sm:inline">Da despensa à reserva, num só sítio.</span>{" "}
          <span className="block sm:inline">Sem comissões por reserva.</span>{" "}
          <span className="block sm:inline">Feito para quem gere a casa, não para engenheiros.</span>
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <CtaPrimary href="#fundador">Quero ser restaurante fundador</CtaPrimary>
          <CtaGhost href="/m/restaurante-saloio-demo">Vê um menu de exemplo</CtaGhost>
        </div>
        <p className="mt-6 text-sm text-[hsl(var(--brand-pine-soft))]">
          Sem comissões · Alergénios UE no menu · Clientes que voltam
        </p>
      </section>

      <Ornament />

      {/* A linha completa */}
      <section className="bg-[hsl(var(--brand-paper))] py-14">
        <div className="container">
          <h2 className={"text-center text-xs font-bold uppercase tracking-[0.3em] " + terra}>
            A linha completa
          </h2>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-center sm:gap-3">
            {LINE.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="w-full max-w-[15rem] rounded-xl border border-[hsl(var(--brand-pine)/0.14)] bg-[hsl(var(--brand-cream))] px-3 py-4 text-center shadow-[0_1px_2px_hsl(var(--brand-pine)/0.06)] sm:w-32 sm:max-w-none">
                  <p className={"font-display text-base font-semibold " + pine}>{step.label}</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--brand-pine-soft))]">{step.sub}</p>
                </div>
                {i < LINE.length - 1 && (
                  <>
                    <ArrowDown className={"h-5 w-5 shrink-0 sm:hidden " + terra} aria-hidden />
                    <ArrowRight className={"hidden h-4 w-4 shrink-0 self-center sm:block " + terra} aria-hidden />
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
          <p className="mx-auto mt-7 max-w-2xl text-center leading-relaxed text-[hsl(var(--brand-pine-soft))]">
            Cada peça alimenta a seguinte. A ficha técnica é o elo que fecha o ciclo:
            transforma o menu de uma lista de preços num sistema que sabe{" "}
            <strong className={pine}>quanto custa e quanto rende cada prato</strong>.
          </p>
        </div>
      </section>

      {/* Bandeira: ficha técnica IA */}
      <section className="container py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className={"text-xs font-bold uppercase tracking-[0.3em] " + terra}>
              O diferenciador
            </p>
            <h2 className={"font-display mt-3 text-4xl font-semibold leading-tight " + pine}>
              A ficha técnica de cada prato, escrita por IA.
            </h2>
            <p className="mt-3 text-lg text-[hsl(var(--brand-pine-soft))]">
              A margem, calculada por ti nunca mais.
            </p>
            <ul className="mt-8 space-y-5">
              <Point icon={<ChefHat className="h-5 w-5" aria-hidden />}>
                A partir do nome do prato, o nostos escreve o primeiro rascunho: ingredientes,
                quantidades, passos e alergénios. <strong className={pine}>O chef corrige, não escreve do zero.</strong>
              </Point>
              <Point icon={<LineChart className="h-5 w-5" aria-hidden />}>
                Com a despensa e os preços de compra, sabes o food cost e a margem de cada coisa
                que serves, e <strong className={pine}>quais os pratos que estão a perder dinheiro</strong>.
              </Point>
              <Point icon={<Users className="h-5 w-5" aria-hidden />}>
                Consistência de cozinha e formação de equipa sem papelada: a ficha imprime-se num
                clique para a parede da cozinha.
              </Point>
            </ul>
          </div>

          {/* Card "ficha de papel" — o herói visual */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl bg-[hsl(var(--brand-pine)/0.10)]" aria-hidden />
            <div className="relative rounded-2xl border border-[hsl(var(--brand-pine)/0.15)] border-t-4 border-t-[hsl(var(--brand-terracotta))] bg-[hsl(var(--brand-paper))] p-7 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[hsl(var(--brand-pine-soft))]">
                Ficha técnica · exemplo real
              </p>
              <p className={"font-display mt-1 text-2xl font-semibold " + pine}>Bacalhau à Brás</p>
              <div className="mt-5 space-y-2.5 text-sm">
                <SheetRow k="Bacalhau demolhado" v="180 g" />
                <SheetRow k="Batata" v="200 g" />
                <SheetRow k="Ovos" v="3 un" />
                <SheetRow k="Cebola, azeite, azeitona, salsa" v="…" />
              </div>
              <div className="mt-5 space-y-2.5 border-t-2 border-dashed border-[hsl(var(--brand-pine)/0.2)] pt-4 text-sm">
                <SheetRow k="Food cost por dose" v="3,66 €" strong />
                <SheetRow k="Preço de venda" v="14,50 €" />
                <div className="flex items-baseline justify-between">
                  <span className="text-[hsl(var(--brand-pine-soft))]">Margem</span>
                  <span className={"font-display text-2xl font-semibold " + terra}>75%</span>
                </div>
              </div>
              <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--brand-pine)/0.08)] px-3 py-1 text-xs font-medium text-[hsl(var(--brand-pine))]">
                <ChefHat className="h-3.5 w-3.5" aria-hidden /> Gerada por IA · validada pelo chef
              </p>
            </div>
          </div>
        </div>
      </section>

      <Ornament />

      {/* Já a funcionar */}
      <section className="bg-[hsl(var(--brand-paper))] py-16">
        <div className="container">
          <h2 className={"font-display text-center text-3xl font-semibold " + pine}>
            Já a funcionar, sem comissões
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
              icon={<Wine className="h-5 w-5" aria-hidden />}
              title="Sommelier virtual"
              text="No menu QR, o cliente responde a duas perguntas (preço e gosto) e recebe sugestões da TUA carta de vinhos, com justificação de sommelier."
            />
            <Feature
              icon={<Users className="h-5 w-5" aria-hidden />}
              title="Clientes que voltam"
              text="O nostos lembra-se por ti: aniversários, alergias, mesa preferida, no-shows. Nostos é o regresso, em grego, e é isso que vendemos."
            />
          </div>
        </div>
      </section>

      {/* O que aí vem (pedido David 07-Jul) */}
      <section className="container py-16">
        <h2 className={"font-display text-center text-3xl font-semibold " + pine}>O que aí vem</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[hsl(var(--brand-pine-soft))]">
          Os restaurantes fundadores recebem tudo isto à medida que sai, sem pagar mais por módulo.
        </p>
        <div className="mt-9 grid gap-5 sm:grid-cols-3">
          <Upcoming
            icon={<Package className="h-5 w-5" aria-hidden />}
            title="Stock a sério"
            text="Dedução automática na venda a partir das fichas técnicas, com ligação ao teu POS."
          />
          <Upcoming
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            title="Reputação e escudo anti no-show"
            text="Reviews num só sítio e protecção contra mesas vazias que ninguém avisou."
          />
          <Upcoming
            icon={<ShoppingBag className="h-5 w-5" aria-hidden />}
            title="Take-away sem comissões"
            text="Encomendas directas no teu link, sem plataformas a levar percentagem."
          />
        </div>
      </section>

      {/* CTA founding + form */}
      <section id="fundador" className="container py-20">
        <div className="mx-auto max-w-xl">
          <h2 className={"font-display text-center text-4xl font-semibold leading-tight " + pine}>
            Queres ser um dos restaurantes fundadores?
          </h2>
          <p className="mt-4 text-center leading-relaxed text-[hsl(var(--brand-pine-soft))]">
            Estamos a escolher os primeiros restaurantes em Portugal. Montamos o teu restaurante
            contigo, usa-lo no serviço real com condições de fundador, e a tua opinião desenha o
            produto. Deixa o contacto e falamos.
          </p>
          <LeadForm />
        </div>
      </section>

      <footer className="border-t border-[hsl(var(--brand-pine)/0.12)] py-10">
        <div className="container flex flex-col items-center gap-3">
          <Mark className="h-8 w-8 text-[hsl(var(--brand-terracotta))]" aria-hidden="true" />
          <p className="text-sm text-[hsl(var(--brand-pine-soft))]">
            nostos.pt · uma plataforma OMNAI · reservas@nostos.pt
          </p>
        </div>
      </footer>
    </div>
  );
}

function Point({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-terracotta)/0.12)] text-[hsl(var(--brand-terracotta))]">
        {icon}
      </span>
      <span className="leading-relaxed text-[hsl(var(--brand-pine-soft))]">{children}</span>
    </li>
  );
}

function SheetRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[hsl(var(--brand-pine-soft))]">{k}</span>
      <span className="mx-1 flex-1 border-b border-dotted border-[hsl(var(--brand-pine)/0.3)]" aria-hidden />
      <span className={"tabular-nums " + (strong ? "font-semibold text-[hsl(var(--brand-pine))]" : "text-[hsl(var(--brand-pine))]")}>
        {v}
      </span>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--brand-pine)/0.12)] bg-[hsl(var(--brand-cream))] p-6 shadow-[0_1px_2px_hsl(var(--brand-pine)/0.05)] transition-shadow hover:shadow-[0_6px_20px_hsl(var(--brand-pine)/0.10)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--brand-terracotta)/0.12)] text-[hsl(var(--brand-terracotta))]">
        {icon}
      </div>
      <h3 className={"font-display mt-4 text-xl font-semibold " + pine}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--brand-pine-soft))]">{text}</p>
    </div>
  );
}

// Card de funcionalidade futura ("O que aí vem"): mesmo DNA visual dos
// Feature, mas tracejado e com selo "em breve" para não vender como actual.
function Upcoming({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[hsl(var(--brand-pine)/0.2)] bg-[hsl(var(--brand-cream))] p-6">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--brand-pine)/0.08)] text-[hsl(var(--brand-pine-soft))]">
          {icon}
        </div>
        <span className="rounded-full bg-[hsl(var(--brand-terracotta)/0.12)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--brand-terracotta))]">
          em breve
        </span>
      </div>
      <h3 className={"font-display mt-4 text-xl font-semibold " + pine}>{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--brand-pine-soft))]">{text}</p>
    </div>
  );
}

const inputCls =
  "flex h-12 w-full rounded-xl border border-[hsl(var(--brand-pine)/0.2)] bg-[hsl(var(--brand-paper))] px-4 text-base text-[hsl(var(--brand-pine))] placeholder:text-[hsl(var(--brand-pine)/0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-terracotta))]";

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
      <div className="mt-9 rounded-2xl border border-[hsl(var(--brand-pine)/0.15)] bg-[hsl(var(--brand-paper))] p-9 text-center shadow-sm">
        <p className={"font-display text-2xl font-semibold " + pine}>Recebido. Falamos em breve.</p>
        <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--brand-pine-soft))]">
          Vamos contactar-te para marcar uma demonstração de 15 minutos com o teu restaurante em
          mente. Entretanto, espreita o menu de exemplo.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-9 space-y-3 rounded-2xl border border-[hsl(var(--brand-pine)/0.15)] bg-[hsl(var(--brand-paper))] p-6 shadow-sm sm:p-8"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          aria-label="O teu nome"
          placeholder="O teu nome *"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          aria-label="Nome do restaurante"
          placeholder="Nome do restaurante *"
          className={inputCls}
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          aria-label="Telefone"
          inputMode="tel"
          placeholder="Telefone"
          className={inputCls}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          aria-label="Email"
          inputMode="email"
          placeholder="Email"
          className={inputCls}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <textarea
        aria-label="Mensagem"
        rows={3}
        maxLength={1000}
        placeholder="Conta-nos do teu restaurante (opcional)"
        className={inputCls + " h-auto py-3"}
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
      <CtaPrimary type="submit" disabled={submitting} full>
        {submitting ? "A enviar..." : "Pedir demonstração"}
      </CtaPrimary>
      <p className="text-center text-xs text-[hsl(var(--brand-pine-soft))]">
        Sem compromisso. Usamos o contacto só para falar contigo sobre o nostos.
      </p>
    </form>
  );
}
