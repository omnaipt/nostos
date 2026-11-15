import * as React from "react";
import { CONTACTO, Logotipo, botaoPrincipal } from "@/components/site/SiteChrome";

// Página da marca, depois dos produtos: como cada produto é montado com peças
// que já existem (pedido do David, 15-11-2026). Textos por aprovar.
// Regra: só se mostra como "em uso" o que está a funcionar com clientes.
// A montagem do nostos corps só entra em builds a partir de 01-12-2026.

type EstadoPeca = "uso" | "desenvolvimento" | "seguir";
type Peca = { nome: string; largura: 2 | 3 | 4 | 6; estado: EstadoPeca };
type Montagem = { vertical: "pulse" | "corps"; titulo: string; pecas: Peca[] };

const MONTAGENS: Montagem[] = [
  ...(__NOSTOS_CORPS__
    ? [
        {
          vertical: "corps" as const,
          titulo: "Uma brigada de bombeiros industriais",
          pecas: [
            { nome: "Ponto", largura: 2, estado: "uso" },
            { nome: "Escalas e turnos", largura: 4, estado: "uso" },
            { nome: "Pessoas e equipas", largura: 3, estado: "uso" },
            { nome: "Meios e viaturas", largura: 3, estado: "uso" },
            { nome: "Exportação de horas", largura: 4, estado: "uso" },
            { nome: "Check-lists", largura: 2, estado: "uso" },
            { nome: "Manutenção", largura: 3, estado: "seguir" },
            { nome: "Portal do cliente", largura: 3, estado: "seguir" },
          ] satisfies Peca[],
        },
      ]
    : []),
  {
    vertical: "pulse",
    titulo: "Um agente de telecomunicações",
    pecas: [
      { nome: "Conciliação de comissões", largura: 6, estado: "desenvolvimento" },
      { nome: "Parque de clientes", largura: 3, estado: "seguir" },
      { nome: "Leads", largura: 3, estado: "seguir" },
    ],
  },
];

const ESTILO: Record<EstadoPeca, string> = {
  uso: "bg-[var(--acento)] text-[var(--acento-texto)]",
  desenvolvimento:
    "border-[1.5px] border-[var(--acento)] bg-[color-mix(in_srgb,var(--acento)_14%,transparent)] text-[var(--titulo)]",
  seguir: "border-[1.5px] border-dashed border-[var(--borda-controlo,var(--regua))] text-[var(--texto-2)]",
};

const LEGENDA: [EstadoPeca, string][] = [
  ["uso", "Em uso"],
  ["desenvolvimento", "Em desenvolvimento"],
  ["seguir", "A seguir"],
];

const CAMADAS: [string, string][] = [
  [
    "Uma base comum",
    "Contas, acessos e a forma de trabalhar no computador e no telemóvel. É a mesma em todos os produtos.",
  ],
  [
    "Peças por função",
    "Ponto, escalas, meios, comissões. Cada peça resolve uma tarefa e liga-se às outras pelas mesmas pessoas e pelos mesmos locais.",
  ],
  [
    "A configuração do seu negócio",
    "As suas regras, as suas palavras e os seus documentos. Um restaurante fala em turnos de sala; um atelier fala em pedidos de elementos.",
  ],
];

const PASSOS: [string, string][] = [
  ["Conversa", "Percebemos como a sua equipa trabalha hoje, com os seus ficheiros e documentos à frente."],
  ["Montagem", "Escolhemos as peças, configuramos regras e vocabulário e carregamos os seus dados."],
  ["Arranque acompanhado", "Começa com a equipa real. Estamos presentes nas primeiras semanas e corrigimos o que aparecer."],
  ["Evolução", "O que pedir a seguir entra como peça nova ou como ajuste da configuração."],
];

function Tabuleiro({ montagem }: { montagem: Montagem }) {
  return (
    <figure
      className="rounded-[10px] bg-[var(--cartao)] p-6 shadow-[0_1px_3px_rgba(22,64,60,.06),0_4px_14px_rgba(22,64,60,.08)]"
      style={{ "--acento": `var(--acento-${montagem.vertical})` } as React.CSSProperties}
    >
      <Logotipo vertical={montagem.vertical} className="-ml-2 h-12 w-auto" />
      <figcaption className="mt-2 text-sm font-medium text-[var(--texto-2)]">{montagem.titulo}</figcaption>
      <ul className="mt-5 grid grid-cols-6 gap-1.5">
        {montagem.pecas.map((p) => (
          <li
            key={p.nome}
            className={
              "flex min-h-[3.5rem] items-end rounded-[7px] px-3 py-2.5 text-sm font-medium leading-tight " +
              ESTILO[p.estado]
            }
            style={{ gridColumn: `span ${p.largura}` }}
          >
            {p.nome}
            <span className="sr-only">
              {" (" + (LEGENDA.find(([e]) => e === p.estado)?.[1] ?? "") + ")"}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function ComoConstruimos() {
  return (
    <>
      <section className="border-t border-[var(--regua)] bg-[var(--realce)] py-16" aria-labelledby="pecas-titulo">
        <div className="container">
          <div className="max-w-3xl">
            <h2
              id="pecas-titulo"
              className="text-3xl font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--titulo)] sm:text-4xl"
            >
              Montado com peças que já funcionam.
            </h2>
            <p className="mt-5 text-lg leading-relaxed">
              Cada cliente parte de peças que já estão a trabalhar noutros. Juntamos as que o seu
              negócio precisa e ajustamos as regras e o vocabulário. O que faltar constrói-se como
              peça nova, que fica disponível para o cliente seguinte.
            </p>
          </div>

          <div className={"mt-10 grid gap-5 " + (MONTAGENS.length > 1 ? "lg:grid-cols-2" : "max-w-xl")}>
            {MONTAGENS.map((m) => (
              <Tabuleiro key={m.vertical} montagem={m} />
            ))}
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--texto-2)]" aria-hidden="true">
            {LEGENDA.map(([estado, texto]) => (
              <li key={estado} className="flex items-center gap-2">
                <span
                  className={"inline-block h-3.5 w-6 rounded-[4px] " + ESTILO[estado]}
                  style={{ "--acento": "var(--titulo)" } as React.CSSProperties}
                />
                {texto}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container py-16" aria-labelledby="camadas-titulo">
        <h2 id="camadas-titulo" className="max-w-3xl text-2xl font-semibold text-[var(--titulo)] sm:text-3xl">
          Três camadas, do que é igual ao que é só seu.
        </h2>
        <ol className="mt-8 max-w-3xl divide-y divide-[var(--regua)] border-y border-[var(--regua)]">
          {CAMADAS.map(([titulo, texto], i) => (
            <li key={titulo} className="grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[2.5rem_14rem_1fr]">
              <span className="text-sm font-semibold tabular-nums text-[var(--texto-2)]">{i + 1}</span>
              <h3 className="font-semibold text-[var(--titulo)]">{titulo}</h3>
              <p className="leading-relaxed">{texto}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-[var(--regua)] bg-[var(--cartao)] py-16" aria-labelledby="passos-titulo">
        <div className="container">
          <h2 id="passos-titulo" className="max-w-3xl text-2xl font-semibold text-[var(--titulo)] sm:text-3xl">
            Como começa.
          </h2>
          <ol className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {PASSOS.map(([titulo, texto], i) => (
              <li key={titulo} className="border-t-2 border-[var(--titulo)] pt-4">
                <span className="text-sm font-semibold tabular-nums text-[var(--texto-2)]">{i + 1}</span>
                <h3 className="mt-1 font-semibold text-[var(--titulo)]">{titulo}</h3>
                <p className="mt-2 leading-relaxed">{texto}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-3xl text-lg leading-relaxed">
            Fazemos poucos arranques por ano e acompanhamos cada um.
          </p>
          <a href={CONTACTO} className={botaoPrincipal + " mt-6"}>
            Fale connosco
          </a>
        </div>
      </section>
    </>
  );
}
