import {
  Bloco,
  CONTACTO,
  Estado,
  PaginaVertical,
  botaoPrincipal,
  usePageMeta,
} from "@/components/site/SiteChrome";

// nostos.pt/pulse: página curta. Tratamento por você. Textos aprovados a 13-11-2026.

export default function Pulse() {
  usePageMeta(
    "nostos pulse · o CRM montado à volta da forma como a sua empresa vende",
    "O nostos pulse parte de uma base comum e ganha os módulos que o seu negócio pede. Em desenvolvimento com o primeiro cliente.",
  );

  return (
    <PaginaVertical vertical="pulse">
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.015em] text-[var(--titulo)] sm:text-5xl">
        O CRM montado à volta da forma como a sua empresa vende.
      </h1>
      <p className="mt-6 text-lg leading-relaxed">
        O nostos pulse parte de uma base comum e ganha os módulos que o seu negócio pede. Começamos
        por um setor de cada vez.
      </p>
      <a href={CONTACTO} className={botaoPrincipal + " mt-8"}>
        Falar connosco
      </a>

      <Bloco titulo="Primeiro setor, agentes de telecomunicações">
        <p>
          Com a JMSoares, agente MEO Empresas, o pulse cruza todos os meses o mapa de comissões com
          o ficheiro do dealer, emparelha linha a linha e deixa as diferenças prontas para
          contestação.
        </p>
      </Bloco>

      <Bloco titulo="Estado">
        <p>
          <Estado>Em desenvolvimento com o primeiro cliente</Estado>
        </p>
        <p className="mt-3">Fazemos poucos arranques por ano e acompanhamos cada um.</p>
      </Bloco>
    </PaginaVertical>
  );
}
