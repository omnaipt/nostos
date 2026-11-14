import * as React from "react";
import { Link } from "react-router-dom";

// Peças comuns do site público da marca nostos (página da marca e páginas
// curtas das verticais). Tokens em .nostos-site (index.css); cada página só
// escolhe o acento. Textos aprovados a 13-11-2026.

export type Vertical = "rest" | "urbs" | "pulse" | "fire";

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

// Lockup em texto: "nostos" sempre na cor da palavra; meandro e descritor no
// acento da vertical.
export function Lockup({ vertical, className }: { vertical: Vertical; className?: string }) {
  return (
    <span
      className={"inline-flex items-center gap-2 font-semibold " + (className ?? "text-2xl")}
      style={{ "--acento": `var(--acento-${vertical})` } as React.CSSProperties}
    >
      <Meandro className="h-[1.1em] w-[1.1em] text-[var(--acento)]" />
      <span>
        <span className="text-[var(--palavra)]">nostos</span>{" "}
        <span className="text-[var(--acento)]">{vertical}</span>
      </span>
    </span>
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
export function PaginaVertical({ vertical, children }: { vertical: Vertical; children: React.ReactNode }) {
  return (
    <div
      className="nostos-site min-h-screen bg-[var(--fundo)] text-[var(--texto)] antialiased"
      style={{ "--acento": `var(--acento-${vertical})` } as React.CSSProperties}
    >
      <header className="container flex items-center justify-between py-6">
        <Link to="/" aria-label="nostos, página da marca">
          <Lockup vertical={vertical} />
        </Link>
        <Link to="/" className="text-sm font-medium text-[var(--texto-2)] underline-offset-4 hover:underline">
          Todos os setores
        </Link>
      </header>
      <main className="container max-w-3xl pb-20 pt-8 sm:pt-14">{children}</main>
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
