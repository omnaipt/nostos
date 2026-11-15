import * as React from "react";
import { Link } from "react-router-dom";
import { DESCRITOR, MEANDRO, PALAVRA } from "./logotipos";

// Peças comuns do site público da marca nostos (página da marca e páginas
// curtas das verticais). Tokens em .nostos-site (index.css); cada página só
// escolhe o acento. Textos aprovados a 13-11-2026.

export type Vertical = "rest" | "urbs" | "pulse" | "corps";

export const CONTACTO = "mailto:hello@omnai.pt";

export const botaoPrincipal =
  "inline-flex items-center justify-center rounded-[7px] bg-[var(--acento)] px-6 py-3 text-base font-semibold text-[var(--acento-texto)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acento)] focus-visible:ring-offset-2";

export const botaoSecundario =
  "inline-flex items-center justify-center rounded-[7px] border border-[var(--borda-controlo)] bg-[var(--botao)] px-6 py-3 text-base font-semibold text-[var(--titulo)] transition-colors hover:border-[var(--titulo)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--titulo)] focus-visible:ring-offset-2";

// Título e descrição por página (a SPA tem um só index.html).
export function usePageMeta(titulo: string, descricao: string) {
  React.useEffect(() => {
    document.title = titulo;
    document.querySelector('meta[name="description"]')?.setAttribute("content", descricao);
  }, [titulo, descricao]);
}

// Navegação entre a página da marca e as páginas das verticais (14-11-2026):
// cada página de vertical abre no início; "Voltar" leva à página da marca no
// sítio onde o visitante estava.
export const VOLTAR = { voltar: true } as const;
const CHAVE_POSICAO = "nostos-marca-posicao";

export function guardarPosicaoDaMarca() {
  try {
    sessionStorage.setItem(CHAVE_POSICAO, String(window.scrollY));
  } catch {
    /* sem armazenamento: a página da marca abre no início */
  }
}

export function lerPosicaoDaMarca(): number | null {
  try {
    const y = sessionStorage.getItem(CHAVE_POSICAO);
    return y === null ? null : Number(y);
  } catch {
    return null;
  }
}

// Abre a página no início, salvo quando o endereço traz uma âncora.
export function useInicioDaPagina() {
  React.useLayoutEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, []);
}

// O meandro da marca, na cor corrente.
export function Meandro({ className }: { className?: string }) {
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

// Logótipo desenhado de cada vertical, igual em todas: meandro e descritor no
// acento da vertical, palavra "nostos" sempre na mesma cor (14-11-2026).
export function Logotipo({ vertical, className }: { vertical: Vertical; className?: string }) {
  const acento = `var(--acento-${vertical})`;
  return (
    <svg
      viewBox="0 0 300 120"
      role="img"
      aria-label={"nostos " + vertical}
      className={className ?? "h-14 w-auto"}
    >
      <path d={MEANDRO} fill="none" stroke={acento} strokeWidth="9.18" />
      {PALAVRA.map((d) => (
        <path key={d.slice(0, 24)} d={d} fill="var(--palavra)" />
      ))}
      {/* Versão para tamanhos reduzidos: o descritor do lockup oficial (12,5 em
          120 de altura) fica ilegível num cabeçalho, por isso cresce 2 vezes
          a partir da margem esquerda, sem mexer no meandro nem na palavra. */}
      <g transform="translate(101.6 108) scale(2) translate(-101.6 -101.5)">
        {DESCRITOR[vertical].map((d, i) => (
          <path key={i} d={d} fill={acento} />
        ))}
      </g>
    </svg>
  );
}

// Cabeçalho igual em todas as páginas de vertical: logótipo à esquerda;
// "Todos os produtos" e, quando o produto tem aplicação, "Entrar" à direita.
export type Entrar = { href: string; interno?: boolean };

export function CabecalhoVertical({ vertical, entrar }: { vertical: Vertical; entrar?: Entrar }) {
  const classeEntrar =
    "inline-flex items-center justify-center whitespace-nowrap rounded-[7px] border border-[var(--borda-controlo)] bg-[var(--botao)] px-4 py-2 text-sm font-semibold text-[var(--titulo)] transition-colors hover:border-[var(--titulo)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--titulo)] focus-visible:ring-offset-2";
  return (
    <header className="container flex items-center justify-between gap-3 py-6">
      <Link to="/" state={VOLTAR} aria-label="nostos, página da marca" className="shrink-0">
        <Logotipo vertical={vertical} className="-ml-3 h-14 w-auto" />
      </Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link
          to="/"
          state={VOLTAR}
          className="whitespace-nowrap text-sm font-medium text-[var(--texto-2)] underline-offset-4 hover:underline"
        >
          Todos os produtos
        </Link>
        {entrar &&
          (entrar.interno ? (
            <Link to={entrar.href} className={classeEntrar}>
              Entrar
            </Link>
          ) : (
            <a href={entrar.href} className={classeEntrar}>
              Entrar
            </a>
          ))}
      </div>
    </header>
  );
}

export function Rodape({ produto }: { produto?: Vertical }) {
  return (
    <footer className="border-t border-[var(--regua)] py-10">
      <div className="container space-y-2 text-sm text-[var(--texto-2)]">
        {produto && <p>nostos {produto} · um produto nostos</p>}
        <p>
          nostos é uma marca da Omnai Consulting, Lda. · NIPC 519270592 · Rua dos Janotas 12, 3.º B,
          2715-094 Pero Pinheiro ·{" "}
          <a className="underline underline-offset-2" href={CONTACTO}>
            hello@omnai.pt
          </a>{" "}
          ·{" "}
          <a className="underline underline-offset-2" href="https://omnai.pt">
            omnai.pt
          </a>
        </p>
      </div>
    </footer>
  );
}

// Moldura de uma página curta de vertical: cabeçalho com o lockup, conteúdo e rodapé.
export function PaginaVertical({
  vertical,
  entrar,
  children,
}: {
  vertical: Vertical;
  entrar?: Entrar;
  children: React.ReactNode;
}) {
  useInicioDaPagina();
  return (
    <div
      className="nostos-site min-h-screen bg-[var(--fundo)] text-[var(--texto)] antialiased"
      style={{ "--acento": `var(--acento-${vertical})` } as React.CSSProperties}
    >
      <CabecalhoVertical vertical={vertical} entrar={entrar} />
      <main className="container max-w-3xl pb-20 pt-8 sm:pt-14">
        {children}
        <p className="mt-14">
          <Link to="/" state={VOLTAR} className={botaoSecundario}>
            Voltar a nostos.pt
          </Link>
        </p>
      </main>
      <Rodape produto={vertical} />
    </div>
  );
}

export function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-[var(--regua)] pt-6">
      <h2 className="text-lg font-semibold text-[var(--titulo)]">{titulo}</h2>
      <div className="mt-3 leading-relaxed text-[var(--texto)]">{children}</div>
    </section>
  );
}

export function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="space-y-2">
      {itens.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--titulo)]" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// Estado como etiqueta com ponto de cor (regra da marca).
export function Estado({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--texto-2)]">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--acento)]" aria-hidden="true" />
      {children}
    </span>
  );
}
