import * as React from "react";
import { Link, useLocation, useNavigationType } from "react-router-dom";
import {
  Estado,
  Logotipo,
  Rodape,
  botaoPrincipal,
  guardarPosicaoDaMarca,
  lerPosicaoDaMarca,
  usePageMeta,
  type Vertical,
} from "@/components/site/SiteChrome";

// Página de entrada de nostos.pt: apresenta a marca e encaminha para cada
// vertical. Textos aprovados a 13-11-2026. O conteúdo de restaurantes vive em
// /rest. A entrada do nostos corps só existe em builds a partir de 01-12-2026.

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
  ...(__NOSTOS_CORPS__
    ? [
        {
          vertical: "corps" as const,
          paraQuem: "Operações com pessoas e meios",
          linha: "Ponto, escalas e equipas de serviços que vivem das suas pessoas",
          estado: "Em operação",
        },
      ]
    : []),
];

export default function Marca() {
  usePageMeta("nostos · software que conhece o seu negócio", __NOSTOS_DESCRICAO_MARCA__);

  // Quem volta de uma vertical (botão "Voltar" ou retrocesso do browser)
  // regressa ao sítio onde estava; quem chega de novo começa no início.
  const location = useLocation();
  const tipoDeNavegacao = useNavigationType();
  const aVoltar =
    tipoDeNavegacao === "POP" || (location.state as { voltar?: boolean } | null)?.voltar === true;
  React.useLayoutEffect(() => {
    const y = aVoltar ? lerPosicaoDaMarca() : null;
    window.scrollTo(0, y ?? 0);
    // Só na montagem: a posição é a do momento em que a página abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            Software que conhece o seu negócio.
          </h1>
          <p className="mt-6 text-lg leading-relaxed">
            Nostos é uma família de produtos. Uns são feitos para um setor, como os restaurantes e os ateliers de arquitetura. Outros são
            plataformas que se configuram para cada empresa. A base é a mesma em todos; muda o que interessa a cada
            negócio.
          </p>
          <a href="#produtos" className={botaoPrincipal + " mt-8"}>
            Ver os produtos
          </a>
        </section>

        <section className="border-y border-[var(--regua)] bg-[var(--realce)] py-12">
          <div className="container max-w-3xl">
            <h2 className="text-lg font-semibold text-[var(--titulo)]">O nome</h2>
            <p className="mt-3 text-lg leading-relaxed">
              Nostos é o regresso a casa, em grego. Fazemos software em que cada setor se sente em
              casa, com as suas regras e as suas palavras. Ele trata das reservas, dos prazos, das
              escalas e das contas, para que cada equipa volte ao que sabe fazer.
            </p>
          </div>
        </section>

        <section id="produtos" className="container scroll-mt-6 py-16" aria-label="Produtos">
          <div className="grid gap-5 sm:grid-cols-2">
            {ENTRADAS.map((e) => (
              <Link
                key={e.vertical}
                to={"/" + e.vertical}
                onClick={guardarPosicaoDaMarca}
                className="group flex flex-col rounded-[10px] bg-[var(--cartao)] p-7 shadow-[0_1px_3px_rgba(22,64,60,.06),0_4px_14px_rgba(22,64,60,.08)] transition-shadow hover:shadow-[0_2px_6px_rgba(22,64,60,.07),0_12px_32px_rgba(22,64,60,.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--titulo)]"
                style={{ "--acento": `var(--acento-${e.vertical})` } as React.CSSProperties}
              >
                <Logotipo vertical={e.vertical} className="-ml-3 h-16 w-auto self-start" />
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
