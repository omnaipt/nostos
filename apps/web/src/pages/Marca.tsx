import * as React from "react";
import { Link } from "react-router-dom";
import {
  Estado,
  Lockup,
  Rodape,
  botaoPrincipal,
  usePageMeta,
  type Vertical,
} from "@/components/site/SiteChrome";

// Página de entrada de nostos.pt: apresenta a marca e encaminha para cada
// vertical. Textos aprovados a 13-11-2026. O conteúdo de restaurantes vive em
// /rest. A entrada do nostos fire só existe em builds a partir de 01-12-2026.

type Entrada = { vertical: Vertical; paraQuem: string; linha: string; estado: string };

const ENTRADAS: Entrada[] = [
  {
    vertical: "rest",
    paraQuem: "Restaurantes",
    linha: "Reservas sem comissões, menu digital e custo real de cada prato",
    estado: "Restaurantes fundadores: 49 € por mês no primeiro ano",
  },
  {
    vertical: "urbs",
    paraQuem: "Ateliers de arquitetura",
    linha: "Processos de licenciamento com prazos, pedidos e verificação",
    estado: "Em teste com gabinetes",
  },
  {
    vertical: "pulse",
    paraQuem: "Equipas comerciais",
    linha: "O CRM montado à volta da forma como a sua empresa vende",
    estado: "Em desenvolvimento com o primeiro cliente",
  },
  ...(__NOSTOS_FIRE__
    ? [
        {
          vertical: "fire" as const,
          paraQuem: "Brigadas de bombeiros industriais",
          linha: "Ponto, escalas e equipas de brigadas privadas",
          estado: "Em operação",
        },
      ]
    : []),
];

export default function Marca() {
  usePageMeta("nostos · software feito para o seu setor", __NOSTOS_DESCRICAO_MARCA__);

  return (
    <div className="nostos-site min-h-screen bg-[var(--fundo)] text-[var(--texto)] antialiased">
      {/* Sem "Entrar" aqui (David, 14-11-2026): a entrada faz-se dentro de cada
          produto, para levar à aplicação certa. */}
      <header className="container flex items-center py-6">
        <img src="/brand/nostos-base.svg" alt="nostos" className="h-14 sm:h-[4.5rem]" />
      </header>

      <main>
        <section className="container max-w-3xl pb-16 pt-10 sm:pb-20 sm:pt-16">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.015em] text-[var(--titulo)] sm:text-6xl">
            Software que conhece o seu setor.
          </h1>
          <p className="mt-6 text-lg leading-relaxed">
            Nostos é uma família de produtos. Cada um é feito para um setor, com as regras e o
            vocabulário de quem lá trabalha. A base é a mesma em todos; muda o que interessa a cada
            negócio.
          </p>
          <a href="#setores" className={botaoPrincipal + " mt-8"}>
            Escolher o meu setor
          </a>
        </section>

        <section className="border-y border-[var(--regua)] bg-[var(--realce)] py-12">
          <div className="container max-w-3xl">
            <h2 className="text-lg font-semibold text-[var(--titulo)]">O nome</h2>
            <p className="mt-3 text-lg leading-relaxed">
              Nostos é o regresso a casa, em grego. Fazemos software para negócios que vivem de
              clientes que voltam.
            </p>
          </div>
        </section>

        <section id="setores" className="container scroll-mt-6 py-16" aria-label="Setores">
          <div className="grid gap-5 sm:grid-cols-2">
            {ENTRADAS.map((e) => (
              <Link
                key={e.vertical}
                to={"/" + e.vertical}
                className="group flex flex-col rounded-[10px] bg-[var(--cartao)] p-7 shadow-[0_1px_3px_rgba(22,64,60,.06),0_4px_14px_rgba(22,64,60,.08)] transition-shadow hover:shadow-[0_2px_6px_rgba(22,64,60,.07),0_12px_32px_rgba(22,64,60,.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--titulo)]"
                style={{ "--acento": `var(--acento-${e.vertical})` } as React.CSSProperties}
              >
                <Lockup vertical={e.vertical} />
                <p className="mt-4 text-sm font-medium text-[var(--texto-2)]">{e.paraQuem}</p>
                <p className="mt-1 text-lg leading-snug text-[var(--titulo)]">{e.linha}</p>
                <p className="mt-5">
                  <Estado>{e.estado}</Estado>
                </p>
                <span className="mt-6 text-sm font-semibold text-[var(--acento)] underline-offset-4 group-hover:underline">
                  Ver nostos {e.vertical}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Rodape />
    </div>
  );
}
