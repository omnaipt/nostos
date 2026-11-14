import {
  Bloco,
  Estado,
  Lista,
  PaginaVertical,
  botaoPrincipal,
  botaoSecundario,
  usePageMeta,
} from "@/components/site/SiteChrome";

// nostos.pt/urbs: página curta, do tamanho do que já se pode afirmar.
// Tratamento por você. Textos aprovados a 13-11-2026.

// Endereço atual da aplicação (ainda sem domínio próprio).
const APP = "https://nostos-urbs.vercel.app";

export default function Urbs() {
  usePageMeta(
    "nostos urbs · os processos de licenciamento do seu atelier",
    "O nostos urbs acompanha cada processo urbanístico: fases, prazos, pedidos da câmara e elementos instrutórios. Em teste com gabinetes de arquitetura.",
  );

  return (
    <PaginaVertical vertical="urbs">
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.015em] text-[var(--titulo)] sm:text-5xl">
        Os processos de licenciamento do seu atelier, num só sítio.
      </h1>
      <p className="mt-6 text-lg leading-relaxed">
        O nostos urbs acompanha cada processo urbanístico: fases, prazos, pedidos da câmara e
        elementos instrutórios. Verifica o projeto contra as regras do concelho antes de submeter. O
        atelier confirma e assina.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={APP + "/registo"} className={botaoPrincipal}>
          Registar o meu gabinete
        </a>
        <a href={APP + "/entrar"} className={botaoSecundario}>
          Já tenho conta
        </a>
      </div>

      <Bloco titulo="O que faz hoje">
        <Lista
          itens={[
            "Quadro de todos os processos em curso, com o próximo prazo de cada um",
            "Verificação do projeto contra as regras municipais carregadas",
            "Importação dos processos a partir de uma folha de cálculo",
          ]}
        />
      </Bloco>

      <Bloco titulo="Concelhos">
        <p>
          Sintra e Mafra carregados. Torres Vedras, Sobral de Monte Agraço, Arruda dos Vinhos,
          Alenquer e Loures em carregamento.
        </p>
      </Bloco>

      <Bloco titulo="Estado e preço">
        <p>
          <Estado>Em teste com gabinetes de arquitetura</Estado>
        </p>
        <p className="mt-3">No máximo 100 € por mês, sem limite de processos.</p>
      </Bloco>
    </PaginaVertical>
  );
}
