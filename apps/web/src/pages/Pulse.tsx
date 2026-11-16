import {
  Bloco,
  CONTACTO,
  Estado,
  PaginaVertical,
  botaoPrincipal,
  usePageMeta,
} from "@/components/site/SiteChrome";
import ecraPulse from "@/assets/site/ecra-pulse.png";

// nostos.pt/pulse: página curta. Tratamento por você. Textos revistos a 15-11-2026 (CRM configurado por cliente), por aprovar.

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
        O nostos pulse é um CRM configurado para cada cliente. Parte de uma base comum e ganha os
        módulos de que a sua equipa precisa para vender mais depressa e decidir com melhores dados.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={CONTACTO} className={botaoPrincipal}>
          Fale connosco
        </a>
      </div>

      <figure className="mt-12">
        <img
          src={ecraPulse}
          alt="Painel do nostos pulse com oportunidades ativas, valor em pipeline e valor por fase"
          width={1568}
          height={522}
          className="w-full rounded-[10px] border border-[var(--regua)] shadow-[0_1px_3px_rgba(22,64,60,.06),0_4px_14px_rgba(22,64,60,.08)]"
        />
        <figcaption className="mt-3 text-sm text-[var(--texto-2)]">Painel de um nostos pulse em uso, com os nomes ocultados.</figcaption>
      </figure>

      <Bloco titulo="Primeiro pacote de módulos, agentes de telecomunicações">
        <p>
          Com a JMSoares, agente MEO Empresas, o pulse cruza todos os meses o mapa de comissões com
          o ficheiro do dealer, emparelha linha a linha e deixa as diferenças prontas para contestação. A seguir entram o parque de clientes e as
          leads.
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
